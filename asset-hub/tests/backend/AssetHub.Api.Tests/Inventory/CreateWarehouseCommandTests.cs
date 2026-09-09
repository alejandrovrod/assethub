using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Domain.Inventory;
using AssetHub.Infrastructure.Services;
using AssetHub.Api.Tests.MaintenanceOrders;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Tests for CreateWarehouseCommand — covers uniqueness validation and persistence.
/// </summary>
public class CreateWarehouseCommandTests
{
    private static (
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        CreateWarehouseCommandHandler handler,
        Guid tenantId
    ) BuildContext()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<AssetHub.Infrastructure.Persistence.TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new AssetHub.Infrastructure.Persistence.TenantDbContext(options, resolver);
        var handler = new CreateWarehouseCommandHandler(db, resolver);
        return (db, handler, tenantId);
    }

    [Fact]
    public async Task CreateWarehouse_ValidData_PersistsWarehouse()
    {
        var (db, handler, _) = BuildContext();

        var id = await handler.Handle(new CreateWarehouseCommand
        {
            Name = "Central",
            Code = "WH-C01",
            Description = "Main central warehouse"
        }, CancellationToken.None);

        var wh = await db.Warehouses.FindAsync(id);

        Assert.NotEqual(Guid.Empty, id);
        Assert.NotNull(wh);
        Assert.Equal("Central", wh!.Name);
        Assert.Equal("WH-C01", wh.Code);
        Assert.True(wh.IsActive);
    }

    [Fact]
    public async Task CreateWarehouse_DuplicateCode_ThrowsException()
    {
        var (db, handler, tenantId) = BuildContext();

        // Pre-seed a warehouse with the same code
        db.Warehouses.Add(new Warehouse
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = "Existing",
            Code = "WH-DUP",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new CreateWarehouseCommand
            {
                Name = "Duplicate",
                Code = "WH-DUP",
            }, CancellationToken.None)
        );
    }
}
