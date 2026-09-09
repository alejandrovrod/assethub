using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Maintenance;
using AssetHub.Infrastructure.Services;
using AssetHub.Api.Tests.MaintenanceOrders;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Tests for the integration between AddMaintenancePartCommand and InventoryPostingService.
/// Verifies that when SourceType = "Internal", a transaction is posted and the part
/// inherits the moving average cost. Also verifies that removing a part reverses the stock.
/// </summary>
public class MaintenancePartInventoryIntegrationTests
{
    private static (
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        Guid tenantId,
        Guid assetId,
        Guid orderId,
        Guid catalogItemId,
        Guid warehouseId
    ) BuildContext()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        var orderId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<AssetHub.Infrastructure.Persistence.TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new AssetHub.Infrastructure.Persistence.TenantDbContext(options, resolver);

        // Seed settings in Internal mode
        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = true,
            OperatingMode = InventoryOperatingMode.Internal,
        });

        // Seed required entities
        db.Assets.Add(new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-T01",
            Name = "Test Asset",
            State = "Activo",
            Path = "/"
        });

        db.MaintenanceOrders.Add(new MaintenanceOrder
        {
            Id = orderId,
            TenantId = tenantId,
            AssetId = assetId,
            Title = "Test Order",
            State = MaintenanceOrderStates.InProgress,
            Kind = MaintenanceOrderKinds.Corrective
        });

        db.Warehouses.Add(new Warehouse
        {
            Id = warehouseId,
            TenantId = tenantId,
            Name = "Test WH",
            Code = "WH-T",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        });

        db.CatalogItems.Add(new CatalogItem
        {
            Id = catalogItemId,
            CatalogId = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "PART-T"
        });

        // Seed initial stock: 10 units @ $100
        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 10,
            AverageUnitCost = 100m,
            UpdatedAt = DateTime.UtcNow
        });

        db.SaveChanges();
        return (db, tenantId, assetId, orderId, catalogItemId, warehouseId);
    }

    [Fact]
    public async Task AddPart_Internal_DeductsStockAndSetsMovingAverageCost()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var handler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        var partId = await handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 3,
            UnitCost = 100m,
            SourceType = "Internal",
            WarehouseId = warehouseId,
        }, CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        var part = await db.MaintenanceParts.FindAsync(partId);

        // Stock should have decreased by 3
        Assert.Equal(7, stock.QuantityOnHand);

        // Part should be linked to a transaction
        Assert.NotNull(part);
        Assert.NotNull(part!.InventoryTransactionId);

        // Unit cost should reflect the moving average ($100 in this case)
        Assert.Equal(100m, part.UnitCost);
    }

    [Fact]
    public async Task AddPart_None_DoesNotTouchStock()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var handler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        await handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 80m,
            SourceType = "None",
        }, CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        // Stock untouched — still 10
        Assert.Equal(10, stock.QuantityOnHand);
    }

    [Fact]
    public async Task RemovePart_Internal_ReversesStock()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        // First add a part from internal inventory
        var addHandler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        var partId = await addHandler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 4,
            UnitCost = 100m,
            SourceType = "Internal",
            WarehouseId = warehouseId,
        }, CancellationToken.None);

        var stockAfterAdd = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(6, stockAfterAdd.QuantityOnHand); // 10 - 4 = 6

        // Now remove the part — should reverse stock
        var removeHandler = new AssetHub.Application.Maintenance.Commands.RemoveMaintenancePartCommandHandler(
            db, postingService);

        await removeHandler.Handle(new AssetHub.Application.Maintenance.Commands.RemoveMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            PartId = partId,
        }, CancellationToken.None);

        var stockAfterRemove = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.Equal(10, stockAfterRemove.QuantityOnHand); // Back to 10
    }
}
