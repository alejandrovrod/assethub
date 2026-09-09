using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Maintenance.Commands;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Maintenance;
using AssetHub.Infrastructure.Services;
using AssetHub.Api.Tests.MaintenanceOrders;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Tests for hybrid order with internal issue and external line — covers TASK-INV-032.
/// </summary>
public class InventoryHybridOrderTests
{
    private static (
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        Guid tenantId,
        Guid assetId,
        Guid orderId,
        Guid catalogItemId,
        Guid warehouseId
    ) BuildContext(string mode = InventoryOperatingMode.Hybrid)
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

        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = true,
            OperatingMode = mode,
        });

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
    public async Task AddPart_HybridMode_InternalSource_DeductsStockAndSetsMovingAverageCost()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

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

        Assert.Equal(7, stock.QuantityOnHand);
        Assert.NotNull(part);
        Assert.NotNull(part!.InventoryTransactionId);
        Assert.Equal(100m, part.UnitCost);
    }

    [Fact]
    public async Task AddPart_HybridMode_ExternalSource_DoesNotTouchStock()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

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
            SourceType = "External",
            ExternalSupplierName = "Supplier Co.",
            ExternalReference = "PO-12345",
        }, CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.Equal(10, stock.QuantityOnHand);
    }

    [Fact]
    public async Task AddPart_HybridMode_NoneSource_DoesNotTouchStock()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

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

        Assert.Equal(10, stock.QuantityOnHand);
    }

    [Fact]
    public async Task AddPart_HybridMode_InternalAndExternalLinesAtomic()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var handler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        var internalPartId = await handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 3,
            UnitCost = 100m,
            SourceType = "Internal",
            WarehouseId = warehouseId,
        }, CancellationToken.None);

        var externalPartId = await handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 2,
            UnitCost = 120m,
            SourceType = "External",
            ExternalSupplierName = "Supplier Co.",
            ExternalReference = "PO-12345",
        }, CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.Equal(7, stock.QuantityOnHand);

        var internalPart = await db.MaintenanceParts.FindAsync(internalPartId);
        var externalPart = await db.MaintenanceParts.FindAsync(externalPartId);

        Assert.NotNull(internalPart!.InventoryTransactionId);
        Assert.Null(externalPart!.InventoryTransactionId);
        Assert.Equal("External", externalPart.SourceType);
        Assert.Equal("Supplier Co.", externalPart.ExternalSupplierName);
        Assert.Equal("PO-12345", externalPart.ExternalReference);
    }

    [Fact]
    public async Task AddPart_HybridMode_InternalRequiresWarehouse()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var handler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
            {
                MaintenanceOrderId = orderId,
                CatalogItemId = catalogItemId,
                Quantity = 3,
                UnitCost = 100m,
                SourceType = "Internal",
                WarehouseId = null, // Missing warehouse
            }, CancellationToken.None)
        );
    }

    [Fact]
    public async Task AddPart_HybridMode_ExternalDoesNotRequireWarehouse()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

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
            SourceType = "External",
            WarehouseId = null, // Not required for external
            ExternalSupplierName = "Supplier Co.",
        }, CancellationToken.None);

        var part = await db.MaintenanceParts.FindAsync(partId);
        Assert.NotNull(part);
        Assert.Null(part!.WarehouseId);
        Assert.Equal("External", part.SourceType);
    }

    [Fact]
    public async Task AddPart_HybridMode_InternalWithInsufficientStock_ThrowsException()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var handler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
            {
                MaintenanceOrderId = orderId,
                CatalogItemId = catalogItemId,
                Quantity = 15, // More than available (10)
                UnitCost = 100m,
                SourceType = "Internal",
                WarehouseId = warehouseId,
            }, CancellationToken.None)
        );

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(10, stock.QuantityOnHand); // Unchanged
    }

    [Fact]
    public async Task AddPart_HybridMode_ExternalWithSameCatalogItemAsInternal_StockUnchanged()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext(InventoryOperatingMode.Hybrid);

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var handler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        await handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 3,
            UnitCost = 100m,
            SourceType = "Internal",
            WarehouseId = warehouseId,
        }, CancellationToken.None);

        await handler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 120m,
            SourceType = "External",
            ExternalSupplierName = "Supplier Co.",
        }, CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.Equal(7, stock.QuantityOnHand); // Only internal deducted
    }
}