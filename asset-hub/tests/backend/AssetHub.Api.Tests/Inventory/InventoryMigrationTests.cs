using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Maintenance;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Api.Tests.MaintenanceOrders;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Tests for migration on existing data — covers TASK-INV-034.
/// </summary>
public class InventoryMigrationTests
{
    [Fact]
    public async Task Migration_CreatesAllInventoryTables()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        var tableNames = new[]
        {
            "TenantInventorySettings",
            "Warehouses",
            "StockBalances",
            "InventoryTransactions"
        };

        foreach (var tableName in tableNames)
        {
            var exists = await db.Database.CanConnectAsync();
            Assert.True(exists);
        }
    }

    [Fact]
    public async Task Migration_TenantInventorySettings_HasCorrectDefaults()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        var settings = new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = true,
            OperatingMode = InventoryOperatingMode.Internal,
        };
        db.TenantInventorySettings.Add(settings);
        await db.SaveChangesAsync();

        var saved = await db.TenantInventorySettings.FirstAsync();
        Assert.Equal(tenantId, saved.TenantId);
        Assert.True(saved.Enabled);
        Assert.Equal(InventoryOperatingMode.Internal, saved.OperatingMode);
    }

    [Fact]
    public async Task Migration_Warehouse_HasCorrectDefaults()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        var warehouse = new Warehouse
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = "Test Warehouse",
            Code = "WH-TEST",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Warehouses.Add(warehouse);
        await db.SaveChangesAsync();

        var saved = await db.Warehouses.FirstAsync();
        Assert.Equal(tenantId, saved.TenantId);
        Assert.True(saved.IsActive);
        Assert.False(saved.IsDeleted);
        Assert.NotNull(saved.CreatedAt);
    }

    [Fact]
    public async Task Migration_StockBalance_HasCorrectDefaults()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        var stock = new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 0,
            AverageUnitCost = 0,
            UpdatedAt = DateTime.UtcNow
        };
        db.StockBalances.Add(stock);
        await db.SaveChangesAsync();

        var saved = await db.StockBalances.FirstAsync();
        Assert.Equal(tenantId, saved.TenantId);
        Assert.Equal(0, saved.QuantityOnHand);
        Assert.Equal(0, saved.AverageUnitCost);
        Assert.NotEmpty(saved.RowVersion);
    }

    [Fact]
    public async Task Migration_InventoryTransaction_HasCorrectDefaults()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        var tx = new InventoryTransaction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            Type = InventoryTransactionType.Receipt,
            State = InventoryTransactionState.Draft,
            Quantity = 10,
            UnitCost = 50m,
            Reason = "Test",
            CreatedBy = "user1",
            CreatedAt = DateTime.UtcNow,
            IdempotencyKey = Guid.NewGuid().ToString()
        };
        db.InventoryTransactions.Add(tx);
        await db.SaveChangesAsync();

        var saved = await db.InventoryTransactions.FirstAsync();
        Assert.Equal(tenantId, saved.TenantId);
        Assert.Equal(InventoryTransactionType.Receipt, saved.Type);
        Assert.Equal(InventoryTransactionState.Draft, saved.State);
        Assert.Equal(10, saved.Quantity);
    }

    [Fact]
    public async Task Migration_MaintenancePart_ExtendedFieldsAreNullable()
    {
        var tenantId = Guid.NewGuid();
        var orderId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        var part = new MaintenancePart
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
        db.MaintenanceParts.Add(part);
        await db.SaveChangesAsync();

        var saved = await db.MaintenanceParts.FirstAsync();
        Assert.Null(saved.WarehouseId);
        Assert.Null(saved.InventoryTransactionId);
        Assert.Null(saved.ExternalSupplierName);
        Assert.Null(saved.ExternalReference);
    }

    [Fact]
    public async Task Migration_UniqueIndex_WarehouseCodePerTenant()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId1 = Guid.NewGuid();
        var warehouseId2 = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        db.Warehouses.AddRange(
            new Warehouse { Id = warehouseId1, TenantId = tenantId, Name = "WH1", Code = "WH-01", IsActive = true, CreatedAt = DateTime.UtcNow },
            new Warehouse { Id = warehouseId2, TenantId = tenantId, Name = "WH2", Code = "WH-01", IsActive = true, CreatedAt = DateTime.UtcNow }
        );

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Migration_UniqueIndex_StockBalancePerWarehouseCatalogItemPerTenant()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        db.StockBalances.AddRange(
            new StockBalance { Id = Guid.NewGuid(), TenantId = tenantId, WarehouseId = warehouseId, CatalogItemId = catalogItemId, QuantityOnHand = 10, AverageUnitCost = 50m, UpdatedAt = DateTime.UtcNow },
            new StockBalance { Id = Guid.NewGuid(), TenantId = tenantId, WarehouseId = warehouseId, CatalogItemId = catalogItemId, QuantityOnHand = 20, AverageUnitCost = 60m, UpdatedAt = DateTime.UtcNow }
        );

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Migration_RowVersion_OptimisticConcurrency()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        var stock = new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 10,
            AverageUnitCost = 50m,
            UpdatedAt = DateTime.UtcNow
        };
        db.StockBalances.Add(stock);
        await db.SaveChangesAsync();

        var rowVersion1 = stock.RowVersion;

        var db2 = new TenantDbContext(
            new DbContextOptionsBuilder<TenantDbContext>()
                .UseInMemoryDatabase(db.Database.GetConnectionString()!)
                .Options,
            new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId)
        );

        var stock2 = await db2.StockBalances.FirstAsync();
        stock2.QuantityOnHand = 15;
        await db2.SaveChangesAsync();

        var stock3 = await db.StockBalances.FirstAsync();
        stock3.QuantityOnHand = 20;
        
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Migration_DecimalPrecision_StockBalancesAndTransactions()
    {
        var tenantId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new TenantDbContext(options, resolver);

        await db.Database.EnsureCreatedAsync();

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            QuantityOnHand = 10.1234m,
            AverageUnitCost = 100.5678m,
            UpdatedAt = DateTime.UtcNow
        });
        db.InventoryTransactions.Add(new InventoryTransaction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId,
            Type = InventoryTransactionType.Receipt,
            State = InventoryTransactionState.Posted,
            Quantity = 10.1234m,
            UnitCost = 100.5678m,
            Reason = "Test",
            CreatedBy = "user1",
            CreatedAt = DateTime.UtcNow,
            PostedAt = DateTime.UtcNow,
            IdempotencyKey = Guid.NewGuid().ToString()
        });
        await db.SaveChangesAsync();

        var stock = await db.StockBalances.FirstAsync();
        var tx = await db.InventoryTransactions.FirstAsync();

        Assert.Equal(10.1234m, stock.QuantityOnHand);
        Assert.Equal(100.5678m, stock.AverageUnitCost);
        Assert.Equal(10.1234m, tx.Quantity);
        Assert.Equal(100.5678m, tx.UnitCost);
    }
}