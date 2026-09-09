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
/// Tests for compatibility with historical MaintenancePart — covers TASK-INV-033.
/// </summary>
public class InventoryHistoricalMaintenancePartCompatibilityTests
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

        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = true,
            OperatingMode = InventoryOperatingMode.Internal,
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
    public async Task AddPart_LegacyMaintenancePartWithoutInventoryFields_StillWorks()
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

        var part = await db.MaintenanceParts.FindAsync(partId);

        Assert.NotNull(part);
        Assert.NotNull(part!.WarehouseId);
        Assert.NotNull(part.InventoryTransactionId);
        Assert.Equal("Internal", part.SourceType);
        Assert.Null(part.ExternalSupplierName);
        Assert.Null(part.ExternalReference);
    }

    [Fact]
    public async Task HistoricalPart_NoWarehouseId_CanBeQueried()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var legacyPart = new MaintenancePart
        {
            Id = Guid.NewGuid(),
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 50m,
            SourceType = "None",
            WarehouseId = null,
            InventoryTransactionId = null,
            ExternalSupplierName = null,
            ExternalReference = null,
        };
        db.MaintenanceParts.Add(legacyPart);
        await db.SaveChangesAsync();

        var part = await db.MaintenanceParts.FindAsync(legacyPart.Id);

        Assert.NotNull(part);
        Assert.Null(part!.WarehouseId);
        Assert.Null(part.InventoryTransactionId);
        Assert.Equal("None", part.SourceType);
    }

    [Fact]
    public async Task HistoricalPart_WithWarehouseIdButNoTransaction_CanBeQueried()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var legacyPart = new MaintenancePart
        {
            Id = Guid.NewGuid(),
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 50m,
            SourceType = "Internal",
            WarehouseId = warehouseId,
            InventoryTransactionId = null,
            ExternalSupplierName = null,
            ExternalReference = null,
        };
        db.MaintenanceParts.Add(legacyPart);
        await db.SaveChangesAsync();

        var part = await db.MaintenanceParts.FindAsync(legacyPart.Id);

        Assert.NotNull(part);
        Assert.Equal(warehouseId, part!.WarehouseId);
        Assert.Null(part.InventoryTransactionId);
        Assert.Equal("Internal", part.SourceType);
    }

    [Fact]
    public async Task HistoricalPart_ExternalWithSupplierInfo_CanBeQueried()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var legacyPart = new MaintenancePart
        {
            Id = Guid.NewGuid(),
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 50m,
            SourceType = "External",
            WarehouseId = null,
            InventoryTransactionId = null,
            ExternalSupplierName = "Old Supplier",
            ExternalReference = "OLD-PO-001",
        };
        db.MaintenanceParts.Add(legacyPart);
        await db.SaveChangesAsync();

        var part = await db.MaintenanceParts.FindAsync(legacyPart.Id);

        Assert.NotNull(part);
        Assert.Equal("External", part!.SourceType);
        Assert.Equal("Old Supplier", part.ExternalSupplierName);
        Assert.Equal("OLD-PO-001", part.ExternalReference);
    }

    [Fact]
    public async Task RemovePart_HistoricalPartWithoutTransaction_RemovesWithoutReversingStock()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var legacyPart = new MaintenancePart
        {
            Id = Guid.NewGuid(),
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 50m,
            SourceType = "Internal",
            WarehouseId = warehouseId,
            InventoryTransactionId = null, // No linked transaction
            ExternalSupplierName = null,
            ExternalReference = null,
        };
        db.MaintenanceParts.Add(legacyPart);
        await db.SaveChangesAsync();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var removeHandler = new AssetHub.Application.Maintenance.Commands.RemoveMaintenancePartCommandHandler(
            db, postingService);

        await removeHandler.Handle(new AssetHub.Application.Maintenance.Commands.RemoveMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            PartId = legacyPart.Id,
        }, CancellationToken.None);

        var part = await db.MaintenanceParts.FindAsync(legacyPart.Id);
        Assert.Null(part);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(10, stock.QuantityOnHand); // Stock unchanged since no transaction
    }

    [Fact]
    public async Task RemovePart_HistoricalPartWithTransaction_ReversesStock()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

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

    [Fact]
    public async Task QueryParts_MixedHistoricalAndNewParts_AllReturned()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var legacyPart = new MaintenancePart
        {
            Id = Guid.NewGuid(),
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 50m,
            SourceType = "None",
            WarehouseId = null,
            InventoryTransactionId = null,
            ExternalSupplierName = null,
            ExternalReference = null,
        };
        db.MaintenanceParts.Add(legacyPart);
        await db.SaveChangesAsync();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());
        var postingService = new InventoryPostingService(db, resolver, currentUser);

        var addHandler = new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommandHandler(
            db, resolver, postingService);

        var newPartId = await addHandler.Handle(new AssetHub.Application.Maintenance.Commands.AddMaintenancePartCommand
        {
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 3,
            UnitCost = 100m,
            SourceType = "Internal",
            WarehouseId = warehouseId,
        }, CancellationToken.None);

        var parts = await db.MaintenanceParts
            .Where(p => p.MaintenanceOrderId == orderId)
            .ToListAsync();

        Assert.Equal(2, parts.Count);

        var legacy = parts.First(p => p.Id == legacyPart.Id);
        var newPart = parts.First(p => p.Id == newPartId);

        Assert.Null(legacy.WarehouseId);
        Assert.Null(legacy.InventoryTransactionId);
        Assert.Equal("None", legacy.SourceType);

        Assert.NotNull(newPart.WarehouseId);
        Assert.NotNull(newPart.InventoryTransactionId);
        Assert.Equal("Internal", newPart.SourceType);
    }

    [Fact]
    public async Task Migration_AddsNullableInventoryFieldsToExistingParts()
    {
        var (db, tenantId, _, orderId, catalogItemId, warehouseId) = BuildContext();

        var legacyPart = new MaintenancePart
        {
            Id = Guid.NewGuid(),
            MaintenanceOrderId = orderId,
            CatalogItemId = catalogItemId,
            Quantity = 5,
            UnitCost = 50m,
            SourceType = "Internal",
        };
        db.MaintenanceParts.Add(legacyPart);
        await db.SaveChangesAsync();

        var part = await db.MaintenanceParts.FindAsync(legacyPart.Id);

        Assert.NotNull(part);
        Assert.Equal("Internal", part!.SourceType);
        Assert.Null(part.WarehouseId);
        Assert.Null(part.InventoryTransactionId);
        Assert.Null(part.ExternalSupplierName);
        Assert.Null(part.ExternalReference);
    }
}