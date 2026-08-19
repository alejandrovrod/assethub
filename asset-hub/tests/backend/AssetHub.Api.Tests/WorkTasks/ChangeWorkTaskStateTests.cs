using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Tasks;
using Xunit;

namespace AssetHub.Api.Tests.WorkTasks;

public class ChangeWorkTaskStateTests
{
    private static WorkTask CreateTask(Guid tenantId, Guid taskTypeId, Guid priorityId, string state = "todo")
    {
        return new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Test task",
            State = state,
            TaskTypeCatalogItemId = taskTypeId,
            PriorityCatalogItemId = priorityId,
        };
    }

    [Fact]
    public async Task ChangeWorkTaskState_FollowsAllowedTransitions()
    {
        var tenantId = Guid.NewGuid();
        await using var db = WorkTaskTestHelper.CreateDbContext(tenantId);

        var taskType = new CatalogItem { Id = Guid.NewGuid(), CatalogId = Guid.NewGuid(), TenantId = tenantId, Code = "general", Order = 0 };
        var priority = new CatalogItem { Id = Guid.NewGuid(), CatalogId = Guid.NewGuid(), TenantId = tenantId, Code = "normal", Order = 0 };
        db.CatalogItems.Add(taskType);
        db.CatalogItems.Add(priority);

        var task = CreateTask(tenantId, taskType.Id, priority.Id);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new ChangeWorkTaskStateCommandHandler(
            db,
            new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid()),
            new WorkTaskTestHelper.FakeTenantResolver(tenantId),
            new WorkTaskTestHelper.FakeMediator());

        await handler.Handle(new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = "in_progress" }, CancellationToken.None);

        Assert.Equal("in_progress", task.State);
        Assert.NotNull(task.StartedAt);
        Assert.Single(db.TaskStatusHistories);
    }

    [Fact]
    public async Task ChangeWorkTaskState_RejectsInvalidTransition()
    {
        var tenantId = Guid.NewGuid();
        await using var db = WorkTaskTestHelper.CreateDbContext(tenantId);

        var taskType = new CatalogItem { Id = Guid.NewGuid(), CatalogId = Guid.NewGuid(), TenantId = tenantId, Code = "general", Order = 0 };
        var priority = new CatalogItem { Id = Guid.NewGuid(), CatalogId = Guid.NewGuid(), TenantId = tenantId, Code = "normal", Order = 0 };
        db.CatalogItems.Add(taskType);
        db.CatalogItems.Add(priority);

        var task = CreateTask(tenantId, taskType.Id, priority.Id, "todo");
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new ChangeWorkTaskStateCommandHandler(
            db,
            new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid()),
            new WorkTaskTestHelper.FakeTenantResolver(tenantId),
            new WorkTaskTestHelper.FakeMediator());

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(
            new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = "done" },
            CancellationToken.None));
    }

    [Fact]
    public async Task ChangeWorkTaskState_ToDone_SetsCompletedAt()
    {
        var tenantId = Guid.NewGuid();
        await using var db = WorkTaskTestHelper.CreateDbContext(tenantId);

        var taskType = new CatalogItem { Id = Guid.NewGuid(), CatalogId = Guid.NewGuid(), TenantId = tenantId, Code = "general", Order = 0 };
        var priority = new CatalogItem { Id = Guid.NewGuid(), CatalogId = Guid.NewGuid(), TenantId = tenantId, Code = "normal", Order = 0 };
        db.CatalogItems.Add(taskType);
        db.CatalogItems.Add(priority);

        var task = CreateTask(tenantId, taskType.Id, priority.Id, "in_progress");
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new ChangeWorkTaskStateCommandHandler(
            db,
            new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid()),
            new WorkTaskTestHelper.FakeTenantResolver(tenantId),
            new WorkTaskTestHelper.FakeMediator());

        await handler.Handle(new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = "done" }, CancellationToken.None);

        Assert.Equal("done", task.State);
        Assert.NotNull(task.CompletedAt);
    }
}
