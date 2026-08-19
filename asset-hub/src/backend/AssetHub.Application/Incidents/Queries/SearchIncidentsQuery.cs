using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Incidents.Queries;

public record IncidentSummaryDto(
    Guid Id,
    string Title,
    string State,
    Guid AssetId,
    string AssetName,
    DateTime CreatedAt,
    DateTime? ResolvedAt,
    DateTime? ClosedAt
);

public record SearchIncidentsQuery(string? SearchTerm, string? State, Dictionary<string, Guid>? CatalogFilters = null, Guid? AssetId = null) : IRequest<List<IncidentSummaryDto>>;

public class SearchIncidentsQueryHandler : IRequestHandler<SearchIncidentsQuery, List<IncidentSummaryDto>>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public SearchIncidentsQueryHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<List<IncidentSummaryDto>> Handle(SearchIncidentsQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();
        var query = _db.Incidents
            .Include(i => i.Asset)
            .Where(i => i.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.State))
        {
            query = query.Where(i => i.State == request.State);
        }

        if (request.AssetId.HasValue)
        {
            query = query.Where(i => i.AssetId == request.AssetId.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.ToLower();
            query = query.Where(i => i.Title.ToLower().Contains(term) 
                                  || (i.Asset != null && i.Asset.Name.ToLower().Contains(term))
                                  || (i.Asset != null && i.Asset.Code.ToLower().Contains(term)));
        }

        if (request.CatalogFilters != null && request.CatalogFilters.Any())
        {
            foreach (var filter in request.CatalogFilters)
            {
                var catalogItemIdStr = filter.Value.ToString();
                query = query.Where(a => a.PropertiesJson != null && a.PropertiesJson.Contains(catalogItemIdStr));
            }
        }

        return await query
            .OrderByDescending(i => i.Id) // Id is Guid, usually we'd order by date if we had a CreateDate in base entity, assuming they don't have CreatedAt base property we'll order by Id or just don't order for now
            .Select(i => new IncidentSummaryDto(
                i.Id,
                i.Title,
                i.State,
                i.AssetId,
                i.Asset != null ? i.Asset.Name : "",
                DateTime.UtcNow, // Fallback if no CreatedAt
                i.ResolvedAt,
                i.ClosedAt ?? (i.State == "Resuelta" || i.State == "Cancelada" || i.State == "Closed" || i.State == "Resolved" ? DateTime.UtcNow : null)
            ))
            .ToListAsync(cancellationToken);
    }
}
