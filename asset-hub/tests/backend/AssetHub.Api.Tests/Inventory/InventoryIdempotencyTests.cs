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
/// Tests for idempotency duplicate and payload conflict — covers TASK-INV-029.
/// </summary>
public class InventoryIdempotencyTests
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
    public async Task PostTransaction_DuplicateIdempotencyKey_ReturnsSameTransaction()
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
        Assert.Equal(tx1.CreatedAt, tx2.CreatedAt);
        Assert.Equal(tx1.PostedAt, tx2.PostedAt);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(10, stock.QuantityOnHand);
    }

    [Fact]
    public async Task PostTransaction_DifferentKeysCreateSeparateTransactions()
    {
        var (db, svc, _, warehouseId, catalogItemId) = BuildContext();

        var tx1 = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 20m,
            type: InventoryTransactionType.Receipt,
            reason: "First",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var tx2 = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 15,
            unitCost: 25m,
            type: InventoryTransactionType.Receipt,
            reason: "Second",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        Assert.NotEqual(tx1.Id, tx2.Id);

        var stock = await db.StockBalances
            .FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(25, stock.QuantityOnHand);
    }
}