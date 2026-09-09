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
/// Tests for negative balance rejection and atomic rollback — covers TASK-INV-028.
/// </summary>
public class InventoryNegativeBalanceAndRollbackTests
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
    public async Task PostTransaction_InsufficientStock_ThrowsDomainExceptionAndDoesNotCreateTransaction()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

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

        var ex = await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
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

        Assert.Equal("insufficient_stock", ex.Code);

        var transactions = await db.InventoryTransactions.ToListAsync();
        Assert.Empty(transactions);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(3, stock.QuantityOnHand);
    }

    [Fact]
    public async Task PostTransaction_ConsumeFromNonExistentStock_ThrowsDomainException()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext();

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

        var transactions = await db.InventoryTransactions.ToListAsync();
        Assert.Empty(transactions);
    }

    [Fact]
    public async Task PostTransaction_AdjustmentThatWouldMakeNegative_ThrowsDomainException()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 5,
            AverageUnitCost = 50m,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        var ex = await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: -10,
                unitCost: 50m,
                type: InventoryTransactionType.Adjustment,
                reason: "Negative adjustment",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            )
        );

        Assert.Equal("insufficient_stock", ex.Code);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(5, stock.QuantityOnHand);
    }

    [Fact]
    public async Task PostTransaction_ExactStockConsumption_Works()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 5,
            AverageUnitCost = 50m,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: -5,
            unitCost: 50m,
            type: InventoryTransactionType.Issue,
            reason: "Exact consumption",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(0, stock.QuantityOnHand);
        Assert.Equal(InventoryTransactionState.Posted, tx.State);
    }

    [Fact]
    public async Task PostTransaction_Atomicity_TransactionAndStockUpdatedTogether()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

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
        await db.SaveChangesAsync(CancellationToken.None);

        await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: -3,
            unitCost: 100m,
            type: InventoryTransactionType.Issue,
            reason: "Consumption",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        var transaction = await db.InventoryTransactions.FirstAsync();

        Assert.Equal(7, stock.QuantityOnHand);
        Assert.Equal(InventoryTransactionState.Posted, transaction.State);
        Assert.Equal(-3, transaction.Quantity);
    }
}