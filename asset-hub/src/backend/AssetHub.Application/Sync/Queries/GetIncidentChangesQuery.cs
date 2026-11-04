using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Domain.Concurrency;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Sync.Queries;

/// <summary>
/// Pull incremental de incidencias (022 §8.2).
///
/// Sin filtro por asignación: una incidencia no tiene responsable propio, se atiende a
/// través de las tareas que genera. El límite es el tenant, igual que en
/// <c>GET /incidents</c>.
/// </summary>
public class GetIncidentChangesQuery : IRequest<ChangePageDto>
{
    public string? Since { get; set; }

    public int? Limit { get; set; }

    public bool IncludeDeleted { get; set; } = true;
}

public class GetIncidentChangesQueryHandler : IRequestHandler<GetIncidentChangesQuery, ChangePageDto>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public GetIncidentChangesQueryHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
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
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(i => new ChangeItemDto
            {
                Id = i.Id,
                UpdatedAt = i.UpdatedAt,
                Deleted = i.IsDeleted,
                DeletedAt = i.DeletedAt,
                ETag = i.IsDeleted ? null : RowVersionToken.ToToken(i.RowVersion),
            })
            .ToList();

        return DeltaSync.BuildPage(items, limit);
    }
}
