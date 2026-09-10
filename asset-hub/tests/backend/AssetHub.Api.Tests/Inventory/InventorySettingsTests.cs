using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Api.Tests.MaintenanceOrders;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Inventory;

/// <summary>
/// Tests for GET/PUT inventory settings handlers.
/// </summary>
public class InventorySettingsTests
{
    private static AssetHub.Infrastructure.Persistence.TenantDbContext CreateDb(Guid tenantId)
    {
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<AssetHub.Infrastructure.Persistence.TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AssetHub.Infrastructure.Persistence.TenantDbContext(options, resolver);
    }

    [Fact]
    public async Task GetSettings_NoRow_ReturnsExternalDefaults()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var handler = new GetInventorySettingsQueryHandler(db, new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId));

        var result = await handler.Handle(new GetInventorySettingsQuery(), CancellationToken.None);

        Assert.Equal(tenantId, result.TenantId);
        Assert.Equal(InventoryOperatingMode.External, result.OperatingMode);
        Assert.False(result.AllowNegativeStock);
    }

    [Fact]
    public async Task UpdateSettings_CreatesRow_WhenMissing()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var handler = new UpdateInventorySettingsCommandHandler(db, new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId));

        var result = await handler.Handle(new UpdateInventorySettingsCommand
        {
            OperatingMode = "hybrid",
            AllowNegativeStock = true
        }, CancellationToken.None);

        Assert.Equal(tenantId, result.TenantId);
        Assert.Equal(InventoryOperatingMode.Hybrid, result.OperatingMode);
        Assert.True(result.AllowNegativeStock);

        var saved = await db.TenantInventorySettings.FirstAsync(s => s.TenantId == tenantId);
        Assert.Equal(InventoryOperatingMode.Hybrid, saved.OperatingMode);
        Assert.True(saved.AllowNegativeStock);
        Assert.True(saved.Enabled);
    }

    [Fact]
    public async Task UpdateSettings_UpdatesExistingRow()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Enabled = true,
            OperatingMode = InventoryOperatingMode.Internal,
            AllowNegativeStock = true
        });
        await db.SaveChangesAsync();

        var handler = new UpdateInventorySettingsCommandHandler(db, new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId));

        var result = await handler.Handle(new UpdateInventorySettingsCommand
        {
            OperatingMode = "internal",
            AllowNegativeStock = false
        }, CancellationToken.None);

        Assert.Equal(InventoryOperatingMode.Internal, result.OperatingMode);
        Assert.False(result.AllowNegativeStock);

        var saved = await db.TenantInventorySettings.FirstAsync(s => s.TenantId == tenantId);
        Assert.False(saved.AllowNegativeStock);
    }

    [Theory]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("externals")]
    public async Task UpdateSettings_InvalidMode_Throws(string mode)
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var handler = new UpdateInventorySettingsCommandHandler(db, new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId));

        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            handler.Handle(new UpdateInventorySettingsCommand
            {
                OperatingMode = mode,
                AllowNegativeStock = false
            }, CancellationToken.None));

        Assert.Equal("invalid_inventory_mode", ex.Code);
    }

    [Fact]
    public async Task UpdateSettings_NormalizesModeCase()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var handler = new UpdateInventorySettingsCommandHandler(db, new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId));

        var result = await handler.Handle(new UpdateInventorySettingsCommand
        {
            OperatingMode = " Internal ",
            AllowNegativeStock = false
        }, CancellationToken.None);

        Assert.Equal(InventoryOperatingMode.Internal, result.OperatingMode);
    }

    [Fact]
    public async Task GetSettings_AfterUpdate_ReturnsUpdatedValues()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var updateHandler = new UpdateInventorySettingsCommandHandler(db, resolver);
        await updateHandler.Handle(new UpdateInventorySettingsCommand
        {
            OperatingMode = "internal",
            AllowNegativeStock = true
        }, CancellationToken.None);

        var getHandler = new GetInventorySettingsQueryHandler(db, resolver);
        var result = await getHandler.Handle(new GetInventorySettingsQuery(), CancellationToken.None);

        Assert.Equal(InventoryOperatingMode.Internal, result.OperatingMode);
        Assert.True(result.AllowNegativeStock);
    }
}
