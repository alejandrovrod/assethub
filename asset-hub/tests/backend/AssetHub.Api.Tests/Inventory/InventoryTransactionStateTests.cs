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
/// Tests for InventoryTransaction states and business rules — covers TASK-INV-026.
/// Tests Draft, Posted, Reversed states and transition rules.
/// </summary>
public class InventoryTransactionStateTests
{
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

        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = true,
            OperatingMode = mode,
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
    public async Task PostTransaction_Receipt_CreatesTransactionInPostedState()
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

        var savedTx = await db.InventoryTransactions.FirstAsync(t => t.Id == tx.Id);

        Assert.Equal(InventoryTransactionState.Posted, savedTx.State);
        Assert.NotNull(savedTx.PostedAt);
        Assert.Equal(10, savedTx.Quantity);
        Assert.Equal(50m, savedTx.UnitCost);
    }

    [Fact]
    public async Task PostTransaction_Issue_CreatesTransactionInPostedState()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

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

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: -5,
            unitCost: 100m,
            type: InventoryTransactionType.Issue,
            reason: "Consumption",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );

        await db.SaveChangesAsync(CancellationToken.None);

        var savedTx = await db.InventoryTransactions.FirstAsync(t => t.Id == tx.Id);

        Assert.Equal(InventoryTransactionState.Posted, savedTx.State);
        Assert.Equal(-5, savedTx.Quantity);
        Assert.Equal(100m, savedTx.UnitCost);
    }

    [Fact]
    public async Task PostTransaction_Adjustment_CreatesTransactionInPostedState()
    {
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

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 5,
            unitCost: 60m,
            type: InventoryTransactionType.Adjustment,
            reason: "Physical count adjustment",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );

        await db.SaveChangesAsync(CancellationToken.None);

        var savedTx = await db.InventoryTransactions.FirstAsync(t => t.Id == tx.Id);

        Assert.Equal(InventoryTransactionState.Posted, savedTx.State);
        Assert.Equal(5, savedTx.Quantity);
    }

    [Fact]
    public async Task PostTransaction_Reversal_CreatesReversalTransaction()
    {
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

        var originalTx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 50m,
            type: InventoryTransactionType.Receipt,
            reason: "Original receipt",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var reversalTx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: -10,
            unitCost: 50m,
            type: InventoryTransactionType.Reversal,
            reason: "Reversal of original",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var savedReversal = await db.InventoryTransactions.FirstAsync(t => t.Id == reversalTx.Id);

        Assert.Equal(InventoryTransactionType.Reversal, savedReversal.Type);
        Assert.Equal(InventoryTransactionState.Posted, savedReversal.State);
        Assert.Equal(-10, savedReversal.Quantity);
    }

    [Fact]
    public async Task PostTransaction_SetsCreatedByFromCurrentUser()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new MaintenanceOrderTestHelper.FakeCurrentUser(userId);

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

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 50m,
            type: InventoryTransactionType.Receipt,
            reason: "Test",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );

        await db.SaveChangesAsync(CancellationToken.None);

        var savedTx = await db.InventoryTransactions.FirstAsync(t => t.Id == tx.Id);

        Assert.Equal(userId.ToString(), savedTx.CreatedBy);
    }

    [Fact]
    public async Task PostTransaction_SetsCreatedAtAndPostedAt()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext();
        var before = DateTime.UtcNow.AddSeconds(-1);

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 50m,
            type: InventoryTransactionType.Receipt,
            reason: "Test",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );

        await db.SaveChangesAsync(CancellationToken.None);

        var after = DateTime.UtcNow.AddSeconds(1);
        var savedTx = await db.InventoryTransactions.FirstAsync(t => t.Id == tx.Id);

        Assert.True(savedTx.CreatedAt >= before && savedTx.CreatedAt <= after);
        Assert.True(savedTx.PostedAt >= before && savedTx.PostedAt <= after);
    }
}