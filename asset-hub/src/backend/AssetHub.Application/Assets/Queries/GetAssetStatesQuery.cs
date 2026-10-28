using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Queries;

public record AssetStateOptionDto(string Name, string? Color);

public record GetAssetStatesQuery() : IRequest<List<AssetStateOptionDto>>;

public class GetAssetStatesQueryHandler : IRequestHandler<GetAssetStatesQuery, List<AssetStateOptionDto>>
{
    private readonly ITenantDbContext _dbContext;

    public GetAssetStatesQueryHandler(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<AssetStateOptionDto>> Handle(GetAssetStatesQuery request, CancellationToken cancellationToken)
    {
        // 1. Obtener todos los estados distintos que están actualmente en uso en los activos
        var activeStates = await _dbContext.Assets
            .Where(a => !a.IsDeleted && !string.IsNullOrWhiteSpace(a.State))
            .Select(a => a.State)
            .Distinct()
            .ToListAsync(cancellationToken);

        // 2. Obtener plantillas para resolver los colores de los estados
        var templates = await _dbContext.AssetTemplates
            .Where(t => t.IsActive && t.LifecycleStates != null)
            .ToListAsync(cancellationToken);

        var stateColors = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var t in templates)
        {
            if (t.LifecycleStates?.States != null)
            {
                foreach (var (stateName, stateConfig) in t.LifecycleStates.States)
                {
                    if (!string.IsNullOrWhiteSpace(stateConfig.Color) && !stateColors.ContainsKey(stateName))
                    {
                        stateColors[stateName] = stateConfig.Color;
                    }
                }
            }
        }

        var result = activeStates
            .OrderBy(s => s)
            .Select(s => new AssetStateOptionDto(s, stateColors.TryGetValue(s, out var color) ? color : null))
            .ToList();

        return result;
    }
}
