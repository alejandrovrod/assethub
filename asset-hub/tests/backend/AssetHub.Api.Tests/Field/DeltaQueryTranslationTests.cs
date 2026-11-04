using System;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Guarda de traducción del keyset a SQL (022 T052).
///
/// El desempate por <c>Id</c> se escribe como <c>Id.CompareTo(cursorId) &gt; 0</c> porque
/// C# no define <c>&gt;</c> para <c>Guid</c>. EF Core 7 dejó de traducir ese método y
/// volvió a hacerlo más adelante: si una actualización del proveedor lo rompe otra vez, el
/// endpoint de sync explota en producción con "could not be translated" y **ningún test de
/// InMemory lo detecta**, porque InMemory evalúa en el cliente.
///
/// <c>ToQueryString()</c> traduce sin abrir conexión, así que esta guarda corre siempre,
/// sin depender de una instancia de SQL Server.
/// </summary>
public class DeltaQueryTranslationTests
{
    [Fact]
    public void KeysetPredicateOnGuid_TranslatesToANativeComparison()
    {
        using var db = CreateSqlServerContext();

        var tenantId = Guid.NewGuid();
        var after = DateTime.UtcNow;
        var afterId = Guid.NewGuid();

        var sql = db.WorkTasks
            .IgnoreQueryFilters()
            .Where(t => t.TenantId == tenantId && (t.UpdatedAt > after
                || (t.UpdatedAt == after && t.Id.CompareTo(afterId) > 0)))
            .OrderBy(t => t.UpdatedAt)
            .ThenBy(t => t.Id)
            .Take(201)
            .ToQueryString();

        // Si EF volviera a fallar en la traducción, ToQueryString() ya habría lanzado.
        // La comparación tiene que ser nativa sobre uniqueidentifier: si aparece un
        // CONVERT(varchar...) el índice deja de servir y el cursor compara texto.
        Assert.Contains("[Id] > @", sql);
        Assert.DoesNotContain("CONVERT(varchar", sql);
        Assert.Matches(@"ORDER BY \[\w+\]\.\[UpdatedAt\], \[\w+\]\.\[Id\]", sql);
    }

    [Fact]
    public void WorkTaskDeltaQuery_IsTranslatable()
    {
        using var db = CreateSqlServerContext();
        var tenantId = Guid.NewGuid();

        var sql = db.WorkTasks
            .IgnoreQueryFilters()
            .Where(t => t.TenantId == tenantId)
            .Where(t => t.AssignedEmployeeId == tenantId
                || (t.AssignedTeamId != null && new[] { tenantId }.Contains(t.AssignedTeamId.Value)))
            .OrderBy(t => t.UpdatedAt)
            .ThenBy(t => t.Id)
            .Select(t => new { t.Id, t.UpdatedAt, t.IsDeleted, t.DeletedAt })
            .ToQueryString();

        Assert.Contains("WHERE", sql);
    }

    private static TenantDbContext CreateSqlServerContext()
    {
        // Cadena sin servidor real: sólo se pide el SQL, no se ejecuta. NetTopologySuite es
        // obligatorio para que el validador del proveedor acepte el modelo (Geometry).
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseSqlServer(
                "Server=(localdb)\\MSSQLLocalDB;Database=translation-guard;Trusted_Connection=True",
                x => x.UseNetTopologySuite())
            .ConfigureWarnings(w => w.Ignore(
                Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning))
            .Options;

        return new TenantDbContext(options, new WorkTaskTestHelper.FakeTenantResolver(Guid.NewGuid()));
    }
}
