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
/// Tests for tenant isolation basics.
/// </summary>
public class InventoryTenantIsolationTests
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
    public async Task PostTransaction_SetsCorrectTenantIdOnTransaction()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 15m,
            type: InventoryTransactionType.Receipt,
            reason: "Test",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        Assert.Equal(tenantId, tx.TenantId);
    }

    [Fact]
    public async Task StockBalance_BelongsToCorrectTenant()
    {
        var (db, svc, tenantId, warehouseId, catalogItemId) = BuildContext();

        var tx = await svc.PostTransactionAsync(
            warehouseId: warehouseId,
            catalogItemId: catalogItemId,
            quantity: 10,
            unitCost: 15m,
            type: InventoryTransactionType.Receipt,
            reason: "Test",
            idempotencyKey: Guid.NewGuid().ToString(),
            cancellationToken: CancellationToken.None
        );
        await db.SaveChangesAsync(CancellationToken.None);

        var stock = await db.StockBalances.FirstAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == catalogItemId);
        Assert.Equal(tenantId, stock.TenantId);
    }
}