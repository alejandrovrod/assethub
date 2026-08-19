using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Maintenance.Commands;
using AssetHub.Application.Maintenance.Helpers;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Maintenance;
using Xunit;

namespace AssetHub.Api.Tests.MaintenanceOrders;

public class MaintenanceOrderStateTransitionTests
{
    [Theory]
    [InlineData(MaintenanceOrderStates.Draft, MaintenanceOrderStates.Approved, true)]
    [InlineData(MaintenanceOrderStates.Draft, MaintenanceOrderStates.Scheduled, true)]
    [InlineData(MaintenanceOrderStates.Draft, MaintenanceOrderStates.Cancelled, true)]
    [InlineData(MaintenanceOrderStates.Approved, MaintenanceOrderStates.Scheduled, true)]
    [InlineData(MaintenanceOrderStates.Approved, MaintenanceOrderStates.Cancelled, true)]
    [InlineData(MaintenanceOrderStates.Scheduled, MaintenanceOrderStates.InProgress, true)]
    [InlineData(MaintenanceOrderStates.Scheduled, MaintenanceOrderStates.Cancelled, true)]
    [InlineData(MaintenanceOrderStates.InProgress, MaintenanceOrderStates.Done, true)]
    [InlineData(MaintenanceOrderStates.InProgress, MaintenanceOrderStates.Cancelled, true)]
    [InlineData(MaintenanceOrderStates.Done, MaintenanceOrderStates.Verified, true)]
    [InlineData(MaintenanceOrderStates.Draft, MaintenanceOrderStates.Done, false)]
    [InlineData(MaintenanceOrderStates.Done, MaintenanceOrderStates.InProgress, false)]
    [InlineData(MaintenanceOrderStates.Verified, MaintenanceOrderStates.Done, false)]
    [InlineData(MaintenanceOrderStates.Cancelled, MaintenanceOrderStates.Draft, false)]
    public void IsValidTransition_ReturnsExpectedResult(string fromState, string toState, bool expected)
    {
        var result = MaintenanceOrderStateTransitionValidator.IsValidTransition(fromState, toState);
        Assert.Equal(expected, result);
    }

    [Fact]
    public async Task StartOrder_FromScheduled_TransitionsToInProgress()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-001",
            Name = "Asset",
            State = "Activo",
            Path = "/"
        };

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Title = "Order",
            State = MaintenanceOrderStates.Scheduled,
            Kind = MaintenanceOrderKinds.Corrective
        };

        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        var handler = new StartMaintenanceOrderCommandHandler(db, new MaintenanceOrderTestHelper.CapturingMediator());
        await handler.Handle(new StartMaintenanceOrderCommand { MaintenanceOrderId = order.Id }, CancellationToken.None);

        Assert.Equal(MaintenanceOrderStates.InProgress, order.State);
    }

    [Fact]
    public async Task CompleteOrder_FromInProgress_TransitionsToDone()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-001",
            Name = "Asset",
            State = "Activo",
            Path = "/"
        };

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Title = "Order",
            State = MaintenanceOrderStates.InProgress,
            Kind = MaintenanceOrderKinds.Corrective
        };

        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        var handler = new CompleteMaintenanceOrderCommandHandler(db, new MaintenanceOrderTestHelper.CapturingMediator());
        await handler.Handle(new CompleteMaintenanceOrderCommand { MaintenanceOrderId = order.Id }, CancellationToken.None);

        Assert.Equal(MaintenanceOrderStates.Done, order.State);
        Assert.NotNull(order.CompletedAt);
    }

    [Fact]
    public async Task CancelOrder_FromApproved_TransitionsToCancelled()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-001",
            Name = "Asset",
            State = "Activo",
            Path = "/"
        };

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Title = "Order",
            State = MaintenanceOrderStates.Approved,
            Kind = MaintenanceOrderKinds.Corrective
        };

        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        var handler = new CancelMaintenanceOrderCommandHandler(db, new MaintenanceOrderTestHelper.CapturingMediator());
        await handler.Handle(new CancelMaintenanceOrderCommand { MaintenanceOrderId = order.Id }, CancellationToken.None);

        Assert.Equal(MaintenanceOrderStates.Cancelled, order.State);
    }
}
