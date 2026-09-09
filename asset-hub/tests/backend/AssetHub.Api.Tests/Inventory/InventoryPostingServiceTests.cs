using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Infrastructure.Services;
using AssetHub.Api.Tests.MaintenanceOrders;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Unit tests for InventoryPostingService — covers the core business rules of M20.
/// Uses EF Core InMemory database. Each test gets an isolated database via Guid name.
/// </summary>
public class InventoryPostingServiceTests
{
    // ─── Helpers ────────────────────────────────────────────────────────────────

    private static (
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        InventoryPostingService svc,
        Guid tenantId,
        Guid warehouseId,
        Guid catalogItemId
    ) BuildContext(string mode = InventoryOperatingMode.Internal)
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

        // Seed TenantInventorySettings
        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = true,
            OperatingMode = mode,
        });

        // Seed Warehouse
        db.Warehouses.Add(new Warehouse
        {
            Id = warehouseId,
            TenantId = tenantId,
            Name = "Main Warehouse",
            Code = "WH-01",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        });

        // Seed CatalogItem
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

    // ─── Tests ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task PostTransaction_Receipt_CreatesStockBalanceAndTransaction()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext();

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 50m,
            type: InventoryTransactionType.Receipt,
            reason: "Initial stock",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );

        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances
            .FirstOrDefaultAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.NotNull(tx);
        Assert.Equal(InventoryTransactionState.Posted, tx.State);
        Assert.NotNull(stock);
        Assert.Equal(10, stock!.QuantityOnHand);
        Assert.Equal(50m, stock.AverageUnitCost);
    }

    [Fact]
    public async Task PostTransaction_Consumption_ReducesStock()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        // Seed stock directly
        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 20,
            AverageUnitCost = 100m,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: -5,
            unitCost: 100m,
            type: InventoryTransactionType.Issue,
            reason: "Consumption on order",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.Equal(15, stock.QuantityOnHand);
    }

    [Fact]
    public async Task PostTransaction_InsufficientStock_ThrowsDomainException()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        // Only 3 units in stock
        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 3,
            AverageUnitCost = 50m,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: -10,
                unitCost: 50m,
                type: InventoryTransactionType.Issue,
                reason: "Over-consumption",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            )
        );
    }

    [Fact]
    public async Task PostTransaction_Idempotency_ReturnsSameTransactionOnDuplicate()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext();
        var key = Guid.NewGuid().ToString();

        var tx1 = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 20m,
            type: InventoryTransactionType.Receipt,
            reason: "First call",
            idempotencyKey: key,
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        // Second call with same key — should return the existing transaction
        var tx2 = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 20m,
            type: InventoryTransactionType.Receipt,
            reason: "Duplicate call",
            idempotencyKey: key,
            cancellationToken: CancellationToken.None
        );

        Assert.Equal(tx1.Id, tx2.Id);

        // Stock should not have doubled
        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(10, stock.QuantityOnHand);
    }

    [Fact]
    public async Task PostTransaction_WeightedAverageCost_CalculatesCorrectly()
    {
        // Formula: ((OldQty * OldCost) + (NewQty * NewCost)) / TotalQty
        // 10 units @ $50 + 10 units @ $70 = 20 units @ $60 avg
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 10,
            AverageUnitCost = 50m,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 70m,
            type: InventoryTransactionType.Receipt,
            reason: "Second receipt",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.Equal(20, stock.QuantityOnHand);
        Assert.Equal(60m, stock.AverageUnitCost);
    }

    [Fact]
    public async Task PostTransaction_ExternalMode_ThrowsDomainException()
    {
        // External mode should never allow posting stock transactions
        var (_, svc, _, warehouseId, catalogItemId) = BuildContext(mode: InventoryOperatingMode.External);

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: 10,
                unitCost: 50m,
                type: InventoryTransactionType.Receipt,
                reason: "Should fail",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            )
        );
    }

    [Fact]
    public async Task PostTransaction_ConsumeFromEmptyStock_ThrowsDomainException()
    {
        // No StockBalance seeded — attempting to consume should throw
        var (_, svc, _, warehouseId, catalogItemId) = BuildContext();

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: -1,
                unitCost: 50m,
                type: InventoryTransactionType.Issue,
                reason: "Nothing in stock",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            )
        );
    }
}
