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
/// Tests for external tenant without stock movement — covers TASK-INV-031.
/// </summary>
public class InventoryExternalModeTests
{
    private static (
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        InventoryPostingService svc,
        Guid tenantId,
        Guid warehouseId,
        Guid catalogItemId
    ) BuildContext(string mode)
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
    public async Task PostTransaction_ExternalMode_ThrowsForAnyTransactionType()
    {
        var (_, svc, _, warehouseId, catalogItemId) = BuildContext(InventoryOperatingMode.External);

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: 10,
                unitCost: 50m,
                type: InventoryTransactionType.Receipt,
                reason: "Should fail in external mode",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            )
        );

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: -5,
                unitCost: 50m,
                type: InventoryTransactionType.Issue,
                reason: "Should fail in external mode",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            )
        );

        await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: 5,
                unitCost: 50m,
                type: InventoryTransactionType.Adjustment,
                reason: "Should fail in external mode",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            )
        );
    }

    [Fact]
    public async Task PostTransaction_ExternalMode_NoStockBalanceCreated()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext(InventoryOperatingMode.External);

        try
        {
            await svc.PostTransactionAsync(
                warehouseId: warehouseId,
                catalogItemId: catalogItemId,
                quantity: 10,
                unitCost: 50m,
                type: InventoryTransactionType.Receipt,
                reason: "Should fail",
                idempotencyKey: Guid.NewGuid().ToString(),
                cancellationToken: CancellationToken.None
            );
        }
        catch (AssetHub.Domain.Exceptions.DomainException)
        {
            // Expected
        }

        var stockBalances = await db.StockBalances.ToListAsync();
        Assert.Empty(stockBalances);

        var transactions = await db.InventoryTransactions.ToListAsync();
        Assert.Empty(transactions);
    }

    [Fact]
    public async Task PostTransaction_InternalMode_AllowsAllTransactionTypes()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext(InventoryOperatingMode.Internal);

        var tx1 = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 50m,
            type: InventoryTransactionType.Receipt,
            reason: "Receipt",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync();

        var tx2 = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: -5,
            unitCost: 50m,
            type: InventoryTransactionType.Issue,
            reason: "Issue",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync();

        var tx3 = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 3,
            unitCost: 55m,
            type: InventoryTransactionType.Adjustment,
            reason: "Adjustment",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync();

        Assert.Equal(InventoryTransactionState.Posted, tx1.State);
        Assert.Equal(InventoryTransactionState.Posted, tx2.State);
        Assert.Equal(InventoryTransactionState.Posted, tx3.State);

        var stock = await db.StockBalances.FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(8, stock.QuantityOnHand); // 10 - 5 + 3
    }

    [Fact]
    public async Task PostTransaction_HybridMode_AllowsInternalTransactions()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext(InventoryOperatingMode.Hybrid);

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 50m,
            type: InventoryTransactionType.Receipt,
            reason: "Hybrid mode receipt",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync();

        Assert.Equal(InventoryTransactionState.Posted, tx.State);

        var stock = await db.StockBalances.FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(10, stock.QuantityOnHand);
    }

    [Fact]
    public async Task EnsureInventoryModeIsActive_ExternalMode_ReturnsFalse()
    {
        var tenantId = Guid.NewGuid();
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
            OperatingMode = InventoryOperatingMode.External,
        });
        await db.SaveChangesAsync();

        var svc = new InventoryPostingService(db, resolver, new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid()));

        var result = await svc.EnsureInventoryModeIsActiveAsync(tenantId, CancellationToken.None);

        Assert.False(result);
    }

    [Fact]
    public async Task EnsureInventoryModeIsActive_InternalMode_ReturnsTrue()
    {
        var tenantId = Guid.NewGuid();
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
        await db.SaveChangesAsync();

        var svc = new InventoryPostingService(db, resolver, new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid()));

        var result = await svc.EnsureInventoryModeIsActiveAsync(tenantId, CancellationToken.None);

        Assert.True(result);
    }

    [Fact]
    public async Task EnsureInventoryModeIsActive_HybridMode_ReturnsTrue()
    {
        var tenantId = Guid.NewGuid();
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
            OperatingMode = InventoryOperatingMode.Hybrid,
        });
        await db.SaveChangesAsync();

        var svc = new InventoryPostingService(db, resolver, new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid()));

        var result = await svc.EnsureInventoryModeIsActiveAsync(tenantId, CancellationToken.None);

        Assert.True(result);
    }

    [Fact]
    public async Task EnsureInventoryModeIsActive_NoSettings_ReturnsFalse()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<AssetHub.Infrastructure.Persistence.TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new AssetHub.Infrastructure.Persistence.TenantDbContext(options, resolver);

        var svc = new InventoryPostingService(db, resolver, new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid()));

        var result = await svc.EnsureInventoryModeIsActiveAsync(tenantId, CancellationToken.None);

        Assert.False(result);
    }

    [Fact]
    public async Task EnsureInventoryModeIsActive_DisabledSettings_ReturnsTrue_WhenModeIsInternal()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<AssetHub.Infrastructure.Persistence.TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new AssetHub.Infrastructure.Persistence.TenantDbContext(options, resolver);

        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = false,
            OperatingMode = InventoryOperatingMode.Internal,
        });
        await db.SaveChangesAsync();

        var svc = new InventoryPostingService(db, resolver, new MaintenanceOrderTestHelper.FakeCurrentUser(Guid.NewGuid()));

        var result = await svc.EnsureInventoryModeIsActiveAsync(tenantId, CancellationToken.None);

        Assert.True(result); // Service only checks mode, not Enabled flag
    }
}