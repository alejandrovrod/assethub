using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Cursors;
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

        if (request.AssignedToMe)
        {
            var employeeId = await ResolveEmployeeIdAsync(tenantId, cancellationToken);

            if (employeeId is null)
            {
                // Usuario sin ficha de empleado: no tiene tareas asignadas. Devolver la
                // página vacía es correcto; devolver todo el tenant sería una fuga.
                return new ChangePageDto();
            }

            var teamIds = await _db.TeamMembers
                .IgnoreQueryFilters()
                .AsNoTracking()
                .Where(m => m.TenantId == tenantId && m.EmployeeId == employeeId.Value)
                .Select(m => m.TeamId)
                .ToListAsync(cancellationToken);

            query = query.Where(t =>
                t.AssignedEmployeeId == employeeId.Value
                || (t.AssignedTeamId != null && teamIds.Contains(t.AssignedTeamId.Value)));
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
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(r => new ChangeItemDto
            {
                Id = r.Id,
                UpdatedAt = r.UpdatedAt,
                Deleted = r.IsDeleted,
                DeletedAt = r.DeletedAt,
                // El token se arma en memoria: convertir el rowversion a base64url no se
                // puede traducir a SQL.
                ETag = r.IsDeleted ? null : RowVersionToken.ToToken(r.RowVersion),
            })
            .ToList();

        return DeltaSync.BuildPage(items, limit);
    }

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var userId = _currentUser.Id;

        if (userId is null)
        {
            return null;
        }

        return await _db.Employees
            .AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.UserId == userId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
