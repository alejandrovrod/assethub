using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.Commands;
using AssetHub.Application.Maintenance.Events;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Maintenance;
using AssetHub.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AssetHub.Api.Tests.PreventivePlans;

public static class PreventivePlanTestHelper
{
    public sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    public sealed class CapturingMediator : IMediator
    {
        public List<PreventivePlanExecutedEvent> PublishedEvents { get; } = new();

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
            => Task.FromResult(default(TResponse)!);

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default) where TRequest : IRequest
            => Task.CompletedTask;

        public Task<object?> Send(object request, CancellationToken cancellationToken = default)
            => Task.FromResult<object?>(null);

        public Task Publish(object notification, CancellationToken cancellationToken = default)
        {
            if (notification is PreventivePlanExecutedEvent evt)
                PublishedEvents.Add(evt);
            return Task.CompletedTask;
        }

        public Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = default) where TNotification : INotification
        {
            if (notification is PreventivePlanExecutedEvent evt)
                PublishedEvents.Add(evt);
            return Task.CompletedTask;
        }

        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = default)
            => AsyncEnumerable.Empty<TResponse>();

        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default)
            => AsyncEnumerable.Empty<object?>();
    }

    public static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var resolver = new FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }

    public static Asset CreateAsset(Guid tenantId, Guid templateId, string state = "Activo")
    {
        return new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = templateId,
            Code = "A-001",
            Name = "Test Asset",
            State = state,
            Path = "/",
            PropertiesJson = "{}",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
    }

    public static PreventivePlan CreatePlan(Guid tenantId, Guid? assetId = null, Guid? templateId = null)
    {
        return new PreventivePlan
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = "Test Plan",
            AssetId = assetId,
            AssetTemplateId = templateId,
            GeneratedEntityType = PreventivePlanConstants.GeneratedEntityTypeWorkTask,
            CronExpression = "0 0 1 * *",
            DueDateOffsetDays = 7,
            NextRunAt = DateTime.UtcNow.AddMinutes(-5),
            IsActive = true,
        };
    }
}

public class EvaluatePreventivePlanTests
{
    [Fact]
    public async Task EvaluatePlan_ForSingleAsset_GeneratesWorkTask()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var asset = PreventivePlanTestHelper.CreateAsset(tenantId, templateId);
        var plan = PreventivePlanTestHelper.CreatePlan(tenantId, assetId: asset.Id);

        db.Assets.Add(asset);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var mediator = new PreventivePlanTestHelper.CapturingMediator();
        var handler = new EvaluatePreventivePlanCommandHandler(db, mediator, NullLogger<EvaluatePreventivePlanCommandHandler>.Instance);

        var result = await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        Assert.Equal(1, result.ProcessedPlans);
        Assert.Equal(1, result.GeneratedWorkTasks);
        Assert.Equal(1, await db.WorkTasks.CountAsync());
    }

    [Fact]
    public async Task EvaluatePlan_ForTemplate_GeneratesOneWorkTaskPerAsset()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var asset1 = PreventivePlanTestHelper.CreateAsset(tenantId, templateId, "Activo");
        var asset2 = PreventivePlanTestHelper.CreateAsset(tenantId, templateId, "Activo");
        asset2.Code = "A-002";
        asset2.Name = "Test Asset 2";
        var plan = PreventivePlanTestHelper.CreatePlan(tenantId, templateId: templateId);

        db.Assets.AddRange(asset1, asset2);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var handler = new EvaluatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.CapturingMediator(), NullLogger<EvaluatePreventivePlanCommandHandler>.Instance);

        var result = await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        Assert.Equal(2, result.GeneratedWorkTasks);
        Assert.Equal(2, await db.WorkTasks.CountAsync());
    }

    [Fact]
    public async Task EvaluatePlan_SkipsExcludedAssetState_AndLogsReason()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var asset = PreventivePlanTestHelper.CreateAsset(tenantId, templateId, "Obsoleta");
        var plan = PreventivePlanTestHelper.CreatePlan(tenantId, assetId: asset.Id);
        plan.ConditionRuleJson = """{"excludedStates":["Obsoleta"]}""";

        db.Assets.Add(asset);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var handler = new EvaluatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.CapturingMediator(), NullLogger<EvaluatePreventivePlanCommandHandler>.Instance);

        var result = await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        Assert.Equal(1, result.SkippedAssets);
        Assert.Equal(0, result.GeneratedWorkTasks);
        var log = await db.PreventivePlanExecutionLogs.FirstAsync();
        Assert.Equal(PreventivePlanConstants.ExecutionStatusSkipped, log.Status);
        Assert.Contains("excluded", log.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task EvaluatePlan_GeneratesBothTaskAndOrder()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var asset = PreventivePlanTestHelper.CreateAsset(tenantId, templateId);
        var plan = PreventivePlanTestHelper.CreatePlan(tenantId, assetId: asset.Id);
        plan.GeneratedEntityType = PreventivePlanConstants.GeneratedEntityTypeBoth;

        db.Assets.Add(asset);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var handler = new EvaluatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.CapturingMediator(), NullLogger<EvaluatePreventivePlanCommandHandler>.Instance);

        var result = await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        Assert.Equal(1, result.GeneratedWorkTasks);
        Assert.Equal(1, result.GeneratedMaintenanceOrders);
        var task = await db.WorkTasks.FirstAsync();
        Assert.NotNull(task.MaintenanceOrderId);
    }

    [Fact]
    public async Task EvaluatePlan_IsIdempotent_ForSameOccurrence()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var asset = PreventivePlanTestHelper.CreateAsset(tenantId, templateId);
        var occurrence = DateTime.UtcNow.AddMinutes(-5);
        var plan = PreventivePlanTestHelper.CreatePlan(tenantId, assetId: asset.Id);
        plan.NextRunAt = occurrence;

        db.Assets.Add(asset);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var handler = new EvaluatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.CapturingMediator(), NullLogger<EvaluatePreventivePlanCommandHandler>.Instance);

        await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);
        plan.NextRunAt = occurrence;
        await db.SaveChangesAsync();

        var secondResult = await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        Assert.Equal(1, await db.WorkTasks.CountAsync());
        Assert.Equal(0, secondResult.GeneratedWorkTasks);
    }

    [Fact]
    public async Task PausePlan_PreventsGeneration()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var asset = PreventivePlanTestHelper.CreateAsset(tenantId, templateId);
        var plan = PreventivePlanTestHelper.CreatePlan(tenantId, assetId: asset.Id);
        plan.IsActive = false;

        db.Assets.Add(asset);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var handler = new EvaluatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.CapturingMediator(), NullLogger<EvaluatePreventivePlanCommandHandler>.Instance);

        var result = await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        Assert.Equal(0, result.GeneratedWorkTasks);
        Assert.Equal(0, await db.WorkTasks.CountAsync());
    }

    [Fact]
    public async Task EvaluatePlan_SetsDueDateRelativeToExecution()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var asset = PreventivePlanTestHelper.CreateAsset(tenantId, templateId);
        var occurrence = DateTime.UtcNow.AddMinutes(-5);
        var plan = PreventivePlanTestHelper.CreatePlan(tenantId, assetId: asset.Id);
        plan.NextRunAt = occurrence;
        plan.DueDateOffsetDays = 10;

        db.Assets.Add(asset);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var handler = new EvaluatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.CapturingMediator(), NullLogger<EvaluatePreventivePlanCommandHandler>.Instance);
        await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        var task = await db.WorkTasks.FirstAsync();
        Assert.NotNull(task.DueAt);
        var expectedDue = occurrence.AddDays(10);
        Assert.True(Math.Abs((task.DueAt!.Value - expectedDue).TotalSeconds) < 1);
    }

    [Fact]
    public async Task CreatePreventivePlan_ReturnsIdAndSetsNextRunAt()
    {
        var tenantId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var assetId = Guid.NewGuid();

        var handler = new CreatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.FakeTenantResolver(tenantId));
        var id = await handler.Handle(new CreatePreventivePlanCommand
        {
            Name = "Monthly Check",
            AssetId = assetId,
            CronExpression = "0 0 1 * *",
            DueDateOffsetDays = 7,
        }, CancellationToken.None);

        var plan = await db.PreventivePlans.FirstAsync(p => p.Id == id);
        Assert.NotEqual(Guid.Empty, id);
        Assert.NotNull(plan.NextRunAt);
    }
}
