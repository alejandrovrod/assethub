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

public record SearchAssetsQuery(string? SearchTerm, Guid? TemplateId, string? State) : IRequest<List<AssetDto>>;

public record AssetDto(Guid Id, Guid TemplateId, Guid? ParentId, string Path, string Code, string Name, string State, decimal? ConditionIndex);

public class SearchAssetsQueryHandler : IRequestHandler<SearchAssetsQuery, List<AssetDto>>
{
    private readonly ITenantDbContext _dbContext;

    public SearchAssetsQueryHandler(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<AssetDto>> Handle(SearchAssetsQuery request, CancellationToken cancellationToken)
    {
        var q = _dbContext.Assets.AsQueryable();

        if (!string.IsNullOrEmpty(request.SearchTerm))
        {
            q = q.Where(a => a.Name.Contains(request.SearchTerm) || a.Code.Contains(request.SearchTerm));
        }

        if (request.TemplateId.HasValue)
        {
            q = q.Where(a => a.AssetTemplateId == request.TemplateId);
        }

        if (!string.IsNullOrEmpty(request.State))
        {
            q = q.Where(a => a.State == request.State);
        }

        var assets = await q.ToListAsync(cancellationToken);

        return assets.Select(a => new AssetDto(
            a.Id,
            a.AssetTemplateId,
            a.ParentId,
            a.Path,
            a.Code,
            a.Name,
            a.State,
            a.ConditionIndex
        )).ToList();
    }
}
