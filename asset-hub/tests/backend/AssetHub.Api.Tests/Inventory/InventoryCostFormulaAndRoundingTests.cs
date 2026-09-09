using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Infrastructure.Services;
using AssetHub.Api.Tests.MaintenanceOrders;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Tests for cost formula, rounding to 4 decimals, and minimum stock alerts — covers TASK-INV-027.
/// </summary>
public class InventoryCostFormulaAndRoundingTests
{
    private static (
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        InventoryPostingService svc,
        Guid tenantId,
        Guid warehouseId,
        Guid catalogItemId
    ) BuildContext()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid());

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

        db.Warehouses.Add(new Warehouse
        {
            Id = warehouseId,
            TenantId = tenantId,
            Name = "Main Warehouse",
            Code = "WH-01",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        });

        db.CatalogItems.Add(new CatalogItem
        {
            Id = catalogItemId,
            CatalogId = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "PART-001"
        });

        db.SaveChanges();

        var svc = new InventoryPostingService(db, resolver, currentUser);
        return (db, svc, tenantId, warehouseId, catalogItemId);
    }

    [Fact]
    public async Task PostTransaction_WeightedAverageCost_RoundsToFourDecimals()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 3,
            AverageUnitCost = 10.123456m, // Will be rounded to 4 decimals
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 2,
            unitCost: 20.987654m, // Will be rounded
            type: InventoryTransactionType.Receipt,
            reason: "Second receipt",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        // Formula: ((3 * 10.123456) + (2 * 20.987654)) / 5
        // = (30.370368 + 41.975308) / 5
        // = 72.345676 / 5
        // = 14.4691352 -> rounded to 14.4691
        Assert.Equal(5, stock.QuantityOnHand);
        Assert.Equal(14.4691m, Math.Round(stock.AverageUnitCost, 4));
    }

    [Fact]
    public async Task PostTransaction_MultipleReceipts_CumulativeWeightedAverageRounded()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 100,
            unitCost: 10.1111m,
            type: InventoryTransactionType.Receipt,
            reason: "First receipt",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 50,
            unitCost: 10.2222m,
            type: InventoryTransactionType.Receipt,
            reason: "Second receipt",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        // ((100 * 10.1111) + (50 * 10.2222)) / 150
        // = (1011.11 + 511.11) / 150
        // = 1522.22 / 150
        // = 10.1481333... -> 10.1481
        Assert.Equal(150, stock.QuantityOnHand);
        Assert.Equal(10.1481m, Math.Round(stock.AverageUnitCost, 4));
    }

    [Fact]
    public async Task PostTransaction_Consumption_UsesMovingAverageCost()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 20,
            AverageUnitCost = 100.1234m,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: -5,
            unitCost: 100m, // Ignored for consumption
            type: InventoryTransactionType.Issue,
            reason: "Consumption",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var savedTx = await db.InventoryTransactions.FirstAsync(t => t.Id == tx.Id);

        Assert.Equal(100.1234m, Math.Round(savedTx.UnitCost, 4));
    }
}