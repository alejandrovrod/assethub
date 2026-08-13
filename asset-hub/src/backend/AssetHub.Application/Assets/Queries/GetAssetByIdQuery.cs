using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using AssetHub.Domain.AssetTemplates;

namespace AssetHub.Application.Assets.Queries;

public record GetAssetByIdQuery(Guid Id) : IRequest<AssetDetailDto?>;

public record AssetDetailDto(
    Guid Id, 
    Guid TemplateId, 
    string TemplateName,
    string SchemaJson,
    LifecycleConfig LifecycleStates,
    Guid? ParentId, 
    string Path, 
    string Code, 
    string Name, 
    string State, 
    decimal? ConditionIndex,
    string PropertiesJson,
    DateTime? InstalledAt,
    DateTime? CommissionedAt
);

public class GetAssetByIdQueryHandler : IRequestHandler<GetAssetByIdQuery, AssetDetailDto?>
{
    private readonly ITenantDbContext _dbContext;

    public GetAssetByIdQueryHandler(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<AssetDetailDto?> Handle(GetAssetByIdQuery request, CancellationToken cancellationToken)
    {
        var asset = await _dbContext.Assets
            .Include(a => a.AssetTemplate)
            .FirstOrDefaultAsync(a => a.Id == request.Id, cancellationToken);

        if (asset == null || asset.AssetTemplate == null) return null;

        return new AssetDetailDto(
            asset.Id,
            asset.AssetTemplateId,
            asset.AssetTemplate.Name,
            asset.AssetTemplate.SchemaJson,
            asset.AssetTemplate.LifecycleStates,
            asset.ParentId,
            asset.Path,
            asset.Code,
            asset.Name,
            asset.State,
            asset.ConditionIndex,
            asset.PropertiesJson,
            asset.InstalledAt,
            asset.CommissionedAt
        );
    }
}
