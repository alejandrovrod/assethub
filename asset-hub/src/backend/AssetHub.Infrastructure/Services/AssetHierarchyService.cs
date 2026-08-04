using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Infrastructure.Services;

public class AssetHierarchyService : IAssetHierarchyService
{
    private readonly ITenantDbContext _dbContext;

    public AssetHierarchyService(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task InsertAssetHierarchyAsync(Guid assetId, Guid? parentId, CancellationToken cancellationToken)
    {
        var asset = await _dbContext.Assets.FindAsync(new object[] { assetId }, cancellationToken);
        if (asset == null) return;

        // Path update
        if (parentId.HasValue)
        {
            var parent = await _dbContext.Assets.FindAsync(new object[] { parentId.Value }, cancellationToken);
            asset.Path = $"{parent?.Path}{assetId}/";
        }
        else
        {
            asset.Path = $"/{assetId}/";
        }

        // Self-reference in hierarchy
        _dbContext.AssetHierarchies.Add(new AssetHierarchy
        {
            AncestorId = assetId,
            DescendantId = assetId,
            Depth = 0
        });

        if (parentId.HasValue)
        {
            // Connect to ancestors
            var ancestors = await _dbContext.AssetHierarchies
                .Where(h => h.DescendantId == parentId.Value)
                .ToListAsync(cancellationToken);

            foreach (var ancestor in ancestors)
            {
                _dbContext.AssetHierarchies.Add(new AssetHierarchy
                {
                    AncestorId = ancestor.AncestorId,
                    DescendantId = assetId,
                    Depth = ancestor.Depth + 1
                });
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task MoveAssetHierarchyAsync(Guid assetId, Guid? newParentId, CancellationToken cancellationToken)
    {
        // Simplificado para ejemplo: 
        // 1. Prevenir ciclos
        // 2. Eliminar relaciones viejas de AssetHierarchy donde DescendantId en subárbol y AncestorId fuera del subárbol
        // 3. Crear nuevas relaciones de AssetHierarchy conectando a nuevos ancestros
        // 4. Actualizar Path en bloque
        
        throw new NotImplementedException("Complejidad omitida temporalmente");
    }

    public async Task SoftDeleteSubtreeAsync(Guid assetId, CancellationToken cancellationToken)
    {
        var descendants = await _dbContext.AssetHierarchies
            .Where(h => h.AncestorId == assetId)
            .Select(h => h.DescendantId)
            .ToListAsync(cancellationToken);

        var assets = await _dbContext.Assets.Where(a => descendants.Contains(a.Id)).ToListAsync(cancellationToken);
        
        foreach (var a in assets)
        {
            a.IsDeleted = true;
            a.DeletedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
