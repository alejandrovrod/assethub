using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Queries;

public record SearchAssetsQuery(string? SearchTerm, Guid? TemplateId, string? State, Dictionary<string, Guid>? CatalogFilters = null, Guid? AncestorId = null, bool? RootOnly = false) : IRequest<List<AssetDto>>;

public record AssetSummaryDto(Guid Id, string Code, string Name, string State, string? StateColor);

public record AssetDto(Guid Id, Guid TemplateId, Guid? ParentId, string Path, string PathNames, string Code, string Name, string State, string? StateColor, decimal? ConditionIndex, List<AssetSummaryDto> Children);

public class SearchAssetsQueryHandler : IRequestHandler<SearchAssetsQuery, List<AssetDto>>
{
    private readonly ITenantDbContext _dbContext;

    public SearchAssetsQueryHandler(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<AssetDto>> Handle(SearchAssetsQuery request, CancellationToken cancellationToken)
    {
        var q = _dbContext.Assets
            .Include(a => a.AssetTemplate)
            .Where(a => !a.IsDeleted)
            .AsQueryable();

        if (request.RootOnly == true)
        {
            q = q.Where(a => a.ParentId == null);
        }

        if (!string.IsNullOrEmpty(request.SearchTerm))
        {
            q = q.Where(a => a.Code.Contains(request.SearchTerm) || a.Name.Contains(request.SearchTerm));
        }

        if (request.TemplateId.HasValue)
        {
            q = q.Where(a => a.AssetTemplateId == request.TemplateId);
        }

        if (!string.IsNullOrEmpty(request.State))
        {
            q = q.Where(a => a.State == request.State);
        }

        if (request.AncestorId.HasValue)
        {
            var ancestorId = request.AncestorId.Value;
            var descendantIds = _dbContext.AssetHierarchies
                .Where(h => h.AncestorId == ancestorId && h.Depth > 0)
                .Select(h => h.DescendantId);
            
            q = q.Where(a => descendantIds.Contains(a.Id));
        }

        if (request.CatalogFilters != null && request.CatalogFilters.Any())
        {
            foreach (var filter in request.CatalogFilters)
            {
                var attributeKey = filter.Key;
                var catalogItemId = filter.Value;
                var catalogItemIdStr = filter.Value.ToString();

                // Buscar en el viejo EAV
                var assetIdsWithAttr = _dbContext.AssetAttributeValues
                    .Where(v => v.AttributeKey == attributeKey && v.ValueCatalogItemId == catalogItemId)
                    .Select(v => v.AssetId);

                // Y buscar en el nuevo PropertiesJson
                q = q.Where(a => (a.PropertiesJson != null && a.PropertiesJson.Contains(catalogItemIdStr)) || assetIdsWithAttr.Contains(a.Id));
            }
        }

        var assets = await q.ToListAsync(cancellationToken);
        
        // Fetch immediate children for the matched assets
        var matchedIds = assets.Select(a => a.Id).ToList();
        var allChildren = new List<Asset>();
        if (matchedIds.Any())
        {
            allChildren = await _dbContext.Assets
                .Include(a => a.AssetTemplate)
                .Where(a => !a.IsDeleted && a.ParentId.HasValue && matchedIds.Contains(a.ParentId.Value))
                .ToListAsync(cancellationToken);
        }
        var childrenLookup = allChildren.GroupBy(a => a.ParentId!.Value).ToDictionary(g => g.Key, g => g.ToList());

        // Extraer todos los IDs de las rutas para buscar sus nombres
        var pathIds = new HashSet<Guid>();
        foreach(var a in assets) 
        {
            if (string.IsNullOrEmpty(a.Path)) continue;
            var parts = a.Path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            foreach(var p in parts) 
            {
                if (Guid.TryParse(p, out var g)) pathIds.Add(g);
            }
        }

        var assetNames = await _dbContext.Assets
            .Where(a => pathIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, a => a.Name, cancellationToken);

        return assets.Select(a => {
            var pathNames = "/";
            if (!string.IsNullOrEmpty(a.Path)) 
            {
                var parts = a.Path.Split('/', StringSplitOptions.RemoveEmptyEntries);
                var names = parts.Select(p => Guid.TryParse(p, out var g) && assetNames.TryGetValue(g, out var name) ? name : p);
                pathNames = "/" + string.Join("/", names) + "/";
            }

            var assetChildren = childrenLookup.TryGetValue(a.Id, out var cList)
                ? cList.Select(c => {
                    string? cColor = null;
                    if (c.AssetTemplate?.LifecycleStates?.States != null && c.AssetTemplate.LifecycleStates.States.TryGetValue(c.State, out var cStateConfig))
                    {
                        cColor = cStateConfig.Color;
                    }
                    return new AssetSummaryDto(c.Id, c.Code, c.Name, c.State, cColor);
                }).ToList()
                : new List<AssetSummaryDto>();

            string? aColor = null;
            if (a.AssetTemplate?.LifecycleStates?.States != null && a.AssetTemplate.LifecycleStates.States.TryGetValue(a.State, out var aStateConfig))
            {
                aColor = aStateConfig.Color;
            }

            return new AssetDto(
                a.Id,
                a.AssetTemplateId,
                a.ParentId,
                a.Path,
                pathNames,
                a.Code,
                a.Name,
                a.State,
                aColor,
                a.ConditionIndex,
                assetChildren
            );
        }).ToList();
    }
}
