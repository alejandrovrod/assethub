using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Commands;
using AssetHub.Application.Assets.Queries;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Assets;

public class AssetMaterialTests
{
    private sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    private static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var resolver = new FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }

    [Fact]
    public void Validator_Should_Fail_If_Quantity_Is_Zero_Or_Negative()
    {
        // Arrange
        var validator = new CreateAssetMaterialCommandValidator();
        var command = new CreateAssetMaterialCommand(
            AssetId: Guid.NewGuid(),
            CatalogItemId: Guid.NewGuid(),
            Quantity: 0,
            UnitOfMeasure: "Unidad",
            IsCritical: false,
            Notes: null
        );

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == "Quantity");
    }

    [Fact]
    public async Task CreateAssetMaterial_Should_Throw_InvalidOperation_When_Duplicate()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);

        var existing = new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            CatalogItemId = catalogItemId,
            Quantity = 1,
            UnitOfMeasure = "Unidad",
            IsCritical = false
        };
        db.AssetMaterials.Add(existing);
        await db.SaveChangesAsync();

        var handler = new CreateAssetMaterialCommandHandler(db, new FakeTenantResolver(tenantId));
        var command = new CreateAssetMaterialCommand(assetId, catalogItemId, 2, "Unidad", true, null);

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
        {
            await handler.Handle(command, CancellationToken.None);
        });
    }

    [Fact]
    public async Task GetAssetMaterialsQuery_Should_Filter_By_SoftDelete_And_Tenant()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        var catalogItemId1 = Guid.NewGuid();
        var catalogItemId2 = Guid.NewGuid();
        
        using var db = CreateDbContext(tenantId);
        
        var catalogItem1 = new CatalogItem { Id = catalogItemId1, TenantId = tenantId, Code = "PART-01" };
        var catalogItem2 = new CatalogItem { Id = catalogItemId2, TenantId = tenantId, Code = "PART-02" };
        
        db.CatalogItems.AddRange(catalogItem1, catalogItem2);

        var materialActive = new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            CatalogItemId = catalogItemId1,
            CatalogItem = catalogItem1,
            Quantity = 1,
            UnitOfMeasure = "Unidad",
            IsCritical = false
        };

        var materialDeleted = new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            CatalogItemId = catalogItemId2,
            CatalogItem = catalogItem2,
            Quantity = 1,
            UnitOfMeasure = "Unidad",
            IsCritical = false,
            IsDeleted = true // soft deleted
        };

        // Otro material para otro asset o tenant para verificar aislamiento si estuviera mezclado en In-Memory
        // EF Core InMemory evalúa Query Filters (IsDeleted=false) desde la v3
        db.AssetMaterials.AddRange(materialActive, materialDeleted);
        await db.SaveChangesAsync();

        var handler = new GetAssetMaterialsQueryHandler(db);
        var query = new GetAssetMaterialsQuery(assetId, null, null);

        // Act
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        Assert.Single(result); // Solo debería traer 1 porque el otro está soft-deleted
        Assert.Equal(catalogItemId1, result.First().CatalogItemId);
    }
}
