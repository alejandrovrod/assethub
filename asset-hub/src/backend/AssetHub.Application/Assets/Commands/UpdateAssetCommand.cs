using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;

namespace AssetHub.Application.Assets.Commands;

public record UpdateAssetCommand(
    Guid AssetId,
    string? Code,
    string? Name,
    DateTime? InstalledAt,
    DateTime? CommissionedAt,
    decimal? ConditionIndex,
    string? PropertiesJson,
    string? GeoJson
) : IRequest<bool>;

public class UpdateAssetCommandHandler : IRequestHandler<UpdateAssetCommand, bool>
{
    private readonly ITenantDbContext _dbContext;

    public UpdateAssetCommandHandler(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<bool> Handle(UpdateAssetCommand request, CancellationToken cancellationToken)
    {
        var asset = await _dbContext.Assets.Include(a => a.AssetTemplate).FirstOrDefaultAsync(a => a.Id == request.AssetId, cancellationToken);
        if (asset == null) return false;

        if (request.Code != null) asset.Code = request.Code;
        if (request.Name != null) asset.Name = request.Name;
        if (request.InstalledAt.HasValue) asset.InstalledAt = request.InstalledAt;
        if (request.CommissionedAt.HasValue) asset.CommissionedAt = request.CommissionedAt;
        if (request.ConditionIndex.HasValue) asset.ConditionIndex = request.ConditionIndex;
        asset.UpdatedAt = DateTime.UtcNow;

        if (request.PropertiesJson != null)
        {
            if (!string.IsNullOrEmpty(asset.AssetTemplate?.SchemaJson) && !string.IsNullOrEmpty(request.PropertiesJson))
            {
                var schema = await NJsonSchema.JsonSchema.FromJsonAsync(asset.AssetTemplate.SchemaJson, cancellationToken);
                var errors = schema.Validate(request.PropertiesJson);
                if (errors.Count > 0)
                {
                    var errorMessages = string.Join(", ", errors.Select(e => $"{e.Path}: {e.Kind}"));
                    throw new InvalidOperationException($"El JSON no cumple con el esquema: {errorMessages}");
                }
            }
            asset.PropertiesJson = request.PropertiesJson;
        }

        // Parsear Geo
        if (request.GeoJson != null)
        {
            if (string.IsNullOrWhiteSpace(request.GeoJson))
            {
                asset.Geo = null;
                asset.GeoType = null;
            }
            else
            {
                var reader = new GeoJsonReader();
                var geometry = reader.Read<Geometry>(request.GeoJson);
                if (geometry.GeometryType != "Point" && geometry.GeometryType != "LineString" && geometry.GeometryType != "Polygon")
                {
                    throw new InvalidOperationException("GeoJson must be Point, LineString or Polygon.");
                }
                geometry.SRID = 4326;
                asset.Geo = geometry;
                asset.GeoType = geometry.GeometryType;
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
