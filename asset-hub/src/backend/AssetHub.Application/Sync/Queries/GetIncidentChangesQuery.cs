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
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Sync.Queries;

/// <summary>
/// Pull incremental de incidencias (022 §8.2).
///
/// Con <c>AssignedToMe</c> el stream se limita a las incidencias que el empleado autenticado
/// ejecuta. La asignación no vive en una columna: se resuelve desde <c>PropertiesJson</c>
/// (ver <see cref="AssignedWork"/>), con el fallback de una orden correctiva asignada.
/// </summary>
public class GetIncidentChangesQuery : IRequest<ChangePageDto>
{
    public string? Since { get; set; }

    public int? Limit { get; set; }

    public bool IncludeDeleted { get; set; } = true;

    /// <summary>
    /// Restringe a las incidencias del empleado autenticado. Opt-in para no cambiar el
    /// alcance de <c>GET /incidents</c>, que ve todo el tenant. El PWA de campo lo pide.
    /// </summary>
    public bool AssignedToMe { get; set; }
}

public class GetIncidentChangesQueryHandler : IRequestHandler<GetIncidentChangesQuery, ChangePageDto>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;
    private readonly ICurrentUser _currentUser;

    public GetIncidentChangesQueryHandler(
        ITenantDbContext db,
        ITenantResolver tenantResolver,
        ICurrentUser currentUser)
    {
        _db = db;
        _tenantResolver = tenantResolver;
        _currentUser = currentUser;
    }

    public async Task<ChangePageDto> Handle(GetIncidentChangesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("A tenant is required to pull changes.");

        var limit = DeltaSync.NormalizeLimit(request.Limit);
        var cursor = DeltaSync.ParseSince(request.Since);

        // Ver el comentario en GetWorkTaskChangesQuery: quitar el filtro global también
        // quita el de tenant, así que se repone explícitamente.
        var query = _db.Incidents
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(i => i.TenantId == tenantId);

        if (!request.IncludeDeleted)
        {
            query = query.Where(i => !i.IsDeleted);
        }

        Guid? employeeId = null;
        if (request.AssignedToMe)
        {
            employeeId = await AssignedWork.ResolveEmployeeIdAsync(_db, _currentUser, cancellationToken);

            // Sin ficha de empleado no hay trabajo asignado. Devolver el tenant sería una fuga.
            if (employeeId is null)
            {
                return new ChangePageDto();
            }

            // Prefiltro ancho en SQL: descarta lo que ni siquiera menciona al empleado.
            query = query.WhereAssignedCandidates(_db, employeeId.Value);
        }

        if (cursor is { } position)
        {
            var after = position.UpdatedAt;
            var afterId = position.Id;

            query = query.Where(i =>
                i.UpdatedAt > after || (i.UpdatedAt == after && i.Id.CompareTo(afterId) > 0));
        }

        var rows = await query
            .OrderBy(i => i.UpdatedAt)
            .ThenBy(i => i.Id)
            .Take(limit + 1)
            .Select(i => new
            {
                i.Id,
                i.UpdatedAt,
                i.IsDeleted,
                i.DeletedAt,
                i.RowVersion,
                i.PropertiesJson,
            })
            .ToListAsync(cancellationToken);

        // El prefilter de SQL es deliberadamente ancho (matchea el GUID en cualquier clave),
        // así que la decisión final se toma en memoria. El cursor avanza sobre TODO lo
        // escaneado, no sobre lo entregado: si avanzara sólo con lo entregado, una página
        // entera de filas ajenas dejaría al cliente atascado en el mismo cursor.
        var scanned = rows.Take(limit).ToList();
        var hasMore = rows.Count > limit;

        HashSet<Guid>? assignedIds = null;
        if (employeeId is { } emp && scanned.Count > 0)
        {
            var scannedIds = scanned.Select(r => r.Id).ToList();
            assignedIds = (await AssignedWork.ExactIncidentIdsAsync(
                _db,
                _db.Incidents
                    .IgnoreQueryFilters()
                    .AsNoTracking()
                    .Where(i => i.TenantId == tenantId && scannedIds.Contains(i.Id)),
                emp,
                cancellationToken)).ToHashSet();
        }

        var items = scanned
            .Where(r => assignedIds is null || assignedIds.Contains(r.Id))
            .Select(r => new ChangeItemDto
            {
                Id = r.Id,
                UpdatedAt = r.UpdatedAt,
                Deleted = r.IsDeleted,
                DeletedAt = r.DeletedAt,
                ETag = r.IsDeleted ? null : RowVersionToken.ToToken(r.RowVersion),
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
