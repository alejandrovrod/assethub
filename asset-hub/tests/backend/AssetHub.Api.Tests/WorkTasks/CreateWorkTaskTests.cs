using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Tasks;
using Xunit;

namespace AssetHub.Api.Tests.WorkTasks;

public class CreateWorkTaskTests
{
    [Fact]
    public async Task CreateWorkTask_FromAsset_SetsAssetId()
    {
        var tenantId = Guid.NewGuid();
        await using var db = WorkTaskTestHelper.CreateDbContext(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-001",
            Name = "Test Asset",
            State = "Activo",
            Path = "/",
            PropertiesJson = "{}",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var taskType = new CatalogItem
        {
            Id = Guid.NewGuid(),
            CatalogId = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "general",
            Order = 0,
        };

        var priority = new CatalogItem
        {
            Id = Guid.NewGuid(),
            CatalogId = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "normal",
            Order = 0,
        };

        db.Assets.Add(asset);
        db.CatalogItems.Add(taskType);
        db.CatalogItems.Add(priority);
        await db.SaveChangesAsync();

        var handler = new CreateWorkTaskCommandHandler(db, new WorkTaskTestHelper.FakeTenantResolver(tenantId));
        var id = await handler.Handle(new CreateWorkTaskCommand
        {
            Title = "Review asset",
            TaskTypeCatalogItemId = taskType.Id,
            PriorityCatalogItemId = priority.Id,
            AssetId = asset.Id,
        }, CancellationToken.None);

        var task = await db.WorkTasks.FindAsync(id);
        Assert.NotNull(task);
        Assert.Equal(asset.Id, task.AssetId);
        Assert.False(task.IsIndependent);
    }

    [Fact]
    public async Task CreateWorkTask_WithoutLink_RequiresIndependentFlag()
    {
        var tenantId = Guid.NewGuid();
        await using var db = WorkTaskTestHelper.CreateDbContext(tenantId);

        var handler = new CreateWorkTaskCommandHandler(db, new WorkTaskTestHelper.FakeTenantResolver(tenantId));

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(new CreateWorkTaskCommand
        {
            Title = "Standalone task",
            IsIndependent = false,
        }, CancellationToken.None));
    }

    [Fact]
    public async Task CreateWorkTask_IndependentTask_SetsIsIndependent()
    {
        var tenantId = Guid.NewGuid();
        await using var db = WorkTaskTestHelper.CreateDbContext(tenantId);

        var handler = new CreateWorkTaskCommandHandler(db, new WorkTaskTestHelper.FakeTenantResolver(tenantId));
        var id = await handler.Handle(new CreateWorkTaskCommand
        {
            Title = "Standalone task",
            IsIndependent = true,
        }, CancellationToken.None);

        var task = await db.WorkTasks.FindAsync(id);
        Assert.NotNull(task);
        Assert.True(task.IsIndependent);
    }
}
