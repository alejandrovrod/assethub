using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Inventory;
using AssetHub.Infrastructure.Services;
using AssetHub.Api.Tests.MaintenanceOrders;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Tests for the AllowNegativeStock tenant policy in InventoryPostingService.
/// </summary>
public class InventoryAllowNegativeStockTests
{
    private static (
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        InventoryPostingService svc,
        Guid warehouseId,
        Guid catalogItemId
    ) BuildContext(bool allowNegative)
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
            AllowNegativeStock = allowNegative
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
        return (db, svc, warehouseId, catalogItemId);
    }

    [Fact]
    public async Task PostTransaction_NegativeResult_Rejected_WhenAllowNegativeIsFalse()
    {
        var (db, svc, warehouseId, catalogItemId) = BuildContext(allowNegative: false);

        // Seed 5 units first
        await svc.PostTransactionAsync(
            warehouseId, catalogItemId,
            quantity: 5, unitCost: 10m,
            type: InventoryTransactionType.Receipt,
            reason: "Initial stock",
            idempotencyKey: Guid.NewGuid().ToString());
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            svc.PostTransactionAsync(
                warehouseId, catalogItemId,
                quantity: -8, unitCost: 10m,
                type: InventoryTransactionType.Issue,
                reason: "Over-consumption",
                idempotencyKey: Guid.NewGuid().ToString()));

        Assert.Equal("insufficient_stock", ex.Code);
    }

    [Fact]
    public async Task PostTransaction_NegativeResult_Allowed_WhenAllowNegativeIsTrue()
    {
        var (db, svc, warehouseId, catalogItemId) = BuildContext(allowNegative: true);

        await svc.PostTransactionAsync(
            warehouseId, catalogItemId,
            quantity: 5, unitCost: 10m,
            type: InventoryTransactionType.Receipt,
            reason: "Initial stock",
            idempotencyKey: Guid.NewGuid().ToString());
        await db.SaveChangesAsync();

        // Consume 8 with only 5 on hand -> negative balance permitted by policy
        var tx = await svc.PostTransactionAsync(
            warehouseId, catalogItemId,
            quantity: -8, unitCost: 10m,
            type: InventoryTransactionType.Issue,
            reason: "Over-consumption allowed by policy",
            idempotencyKey: Guid.NewGuid().ToString());
        await db.SaveChangesAsync();

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);

        Assert.Equal(-3, stock.QuantityOnHand);
        Assert.Equal(InventoryTransactionState.Posted, tx.State);
    }
}
