using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Cursors;
using AssetHub.Application.Common.Workflow;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Sync.Queries;

/// <summary>
/// Pull incremental de tareas para el cliente offline (022 §8.2).
///
/// Devuelve sólo lo que cambió desde el cursor, incluidas las filas borradas: una tarea
/// que el servidor dio de baja tiene que desaparecer de la tablet, y si el delta no la
/// reporta el técnico sigue viendo trabajo que ya no existe.
/// </summary>
public class GetWorkTaskChangesQuery : IRequest<ChangePageDto>
{
    public string? Since { get; set; }

    public int? Limit { get; set; }

    /// <summary>
    /// Incluir borradas. Por defecto <c>true</c>: el consumidor de este endpoint es un
    /// cliente que cachea, y para cachear bien hay que saber qué se borró.
    /// </summary>
    public bool IncludeDeleted { get; set; } = true;

    /// <summary>
    /// Restringe a las tareas del empleado autenticado y de sus equipos.
    ///
    /// Es opt-in para no cambiar el alcance de <c>GET /work-tasks</c>, que ve todo el
    /// tenant. El PWA de campo lo pide en <c>true</c>: descargar la jornada completa del
    /// tenant a una tablet no tiene sentido.
    /// </summary>
    public bool AssignedToMe { get; set; }
}

public class GetWorkTaskChangesQueryHandler : IRequestHandler<GetWorkTaskChangesQuery, ChangePageDto>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;
    private readonly ICurrentUser _currentUser;

    public GetWorkTaskChangesQueryHandler(
        ITenantDbContext db,
        ITenantResolver tenantResolver,
        ICurrentUser currentUser)
    {
        _db = db;
        _tenantResolver = tenantResolver;
        _currentUser = currentUser;
    }

    public async Task<ChangePageDto> Handle(GetWorkTaskChangesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("A tenant is required to pull changes.");

        var limit = DeltaSync.NormalizeLimit(request.Limit);
        var cursor = DeltaSync.ParseSince(request.Since);

        // IgnoreQueryFilters + TenantId explícito: el filtro global esconde justamente las
        // filas borradas, que son las que más necesitamos reportar. Pero quitar el filtro
        // quita también el de tenant, así que el aislamiento se vuelve a poner a mano. Si
        // falta, este endpoint devuelve el trabajo de otro cliente.
        var query = _db.WorkTasks
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(t => t.TenantId == tenantId);

        if (!request.IncludeDeleted)
        {
            query = query.Where(t => !t.IsDeleted);
        }

        Guid? employeeId = null;
        IReadOnlyCollection<Guid> teamIds = [];
        if (request.AssignedToMe)
        {
            employeeId = await AssignedWork.ResolveEmployeeIdAsync(_db, _currentUser, cancellationToken);

            if (employeeId is null)
            {
                // Usuario sin ficha de empleado: no tiene tareas asignadas. Devolver la
                // página vacía es correcto; devolver todo el tenant sería una fuga.
                return new ChangePageDto();
            }

            teamIds = await AssignedWork.ResolveTeamIdsAsync(_db, employeeId.Value, cancellationToken);

            // Prefiltro ancho en SQL: columna, equipo o mención del empleado en las props.
            query = query.WhereAssignedCandidates(employeeId.Value, teamIds);
        }

        if (cursor is { } position)
        {
            // Keyset, no OFFSET. `Id.CompareTo` traduce a `[Id] > @id` nativo sobre
            // uniqueidentifier en EF Core 10: el orden lo decide SQL Server y es total,
            // así que dos filas con el mismo UpdatedAt nunca se repiten ni se saltean.
            var after = position.UpdatedAt;
            var afterId = position.Id;

            query = query.Where(t =>
                t.UpdatedAt > after || (t.UpdatedAt == after && t.Id.CompareTo(afterId) > 0));
        }

        var rows = await query
            .OrderBy(t => t.UpdatedAt)
            .ThenBy(t => t.Id)
            .Take(limit + 1)
            .Select(t => new
            {
                t.Id,
                t.UpdatedAt,
                t.IsDeleted,
                t.DeletedAt,
                t.RowVersion,
                t.AssignedEmployeeId,
                t.AssignedTeamId,
                t.PropertiesJson,
            })
            .ToListAsync(cancellationToken);

        // El prefilter de SQL es deliberadamente ancho, así que la decisión final se toma en
        // memoria con las mismas tres fuentes: columna del empleado, equipo del empleado y
        // propiedades del template. El cursor avanza sobre TODO lo escaneado, no sobre lo
        // entregado: si avanzara sólo con lo entregado, una página entera de filas ajenas
        // dejaría al cliente atascado en el mismo cursor.
        var scanned = rows.Take(limit).ToList();
        var hasMore = rows.Count > limit;

        var items = scanned
            .Where(t => employeeId is not { } emp
                || t.AssignedEmployeeId == emp
                || (t.AssignedTeamId is { } teamId && teamIds.Contains(teamId))
                || WorkflowProperties.MatchesExecutor(t.PropertiesJson, emp))
            .Select(t => new ChangeItemDto
            {
                Id = t.Id,
                UpdatedAt = t.UpdatedAt,
                Deleted = t.IsDeleted,
                DeletedAt = t.DeletedAt,
                // El token se arma en memoria: convertir el rowversion a base64url no se
                // puede traducir a SQL.
                ETag = t.IsDeleted ? null : RowVersionToken.ToToken(t.RowVersion),
            })
            .ToList();

        return new ChangePageDto
        {
            Items = items,
            HasMore = hasMore,
            NextCursor = scanned.Count == 0
                ? null
                : KeysetCursor.Encode(scanned[^1].UpdatedAt, scanned[^1].Id),
        };
    }
}
