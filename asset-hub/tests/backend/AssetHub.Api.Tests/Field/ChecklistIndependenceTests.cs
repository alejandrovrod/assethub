using System;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Tasks.Checklists;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Application.Tasks.Queries;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Regresión del motivo por el que el checklist es una tabla aparte (022 T034).
///
/// SQL Server permite una sola columna <c>rowversion</c> por tabla. Si el checklist
/// viviera en <c>WorkTasks</c>, mover la tarea a "en progreso" cambiaría el ETag del
/// formulario y el técnico recibiría un <c>412</c> al enviarlo — por un cambio que no
/// tiene nada que ver con lo que está enviando. El técnico no puede resolver ese 412:
/// no hay conflicto real, sólo un token compartido.
/// </summary>
public class ChecklistIndependenceTests
{
    private static readonly Guid TenantId = Guid.Parse("77777777-7777-7777-7777-777777777777");
    private static readonly Guid UserId = Guid.Parse("88888888-8888-8888-8888-888888888888");

    private static readonly byte[] TaskVersion = { 1, 1, 1, 1, 1, 1, 1, 1 };
    private static readonly byte[] ChecklistVersion = { 2, 2, 2, 2, 2, 2, 2, 2 };

    [Fact]
    public async Task CompletingTheTask_DoesNotChangeTheChecklistETag()
    {
        var (db, task, checklist) = await ArrangeAsync();

        var etagBefore = await ReadChecklistETagAsync(db, checklist.Id);
        Assert.NotNull(etagBefore);

        var user = new WorkTaskTestHelper.FakeCurrentUser(UserId);
        var handler = new ChangeWorkTaskStateCommandHandler(
            db,
            user,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeMediator(),
            WorkTaskTestHelper.CreateTaskAccess(db, user));

        await handler.Handle(
            new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = WorkTaskStates.InProgress, ExpectedRowVersion = TaskVersion },
            default);

        await handler.Handle(
            new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = WorkTaskStates.Done, ExpectedRowVersion = TaskVersion },
            default);

        Assert.Equal(WorkTaskStates.Done, (await db.WorkTasks.AsNoTracking().FirstAsync(t => t.Id == task.Id)).State);
        Assert.Equal(etagBefore, await ReadChecklistETagAsync(db, checklist.Id));

        var stored = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.Id == checklist.Id);
        Assert.Equal(1, stored.Version);
        Assert.Equal(TaskChecklistStates.Pending, stored.State);
    }

    [Fact]
    public async Task SubmittingTheChecklist_DoesNotChangeTheTaskETag()
    {
        var (db, task, checklist) = await ArrangeAsync();

        var handler = new SubmitTaskChecklistCommandHandler(
            db,
            new WorkTaskTestHelper.FakeCurrentUser(UserId));

        await handler.Handle(
            new SubmitTaskChecklistCommand
            {
                TaskId = task.Id,
                ResponseJson = """{"item_0":true}""",
                ExpectedRowVersion = ChecklistVersion,
            },
            default);

        var storedTask = await db.WorkTasks.AsNoTracking().FirstAsync(t => t.Id == task.Id);
        Assert.Equal(WorkTaskStates.Todo, storedTask.State);
        Assert.Equal(RowVersionToken.ToToken(TaskVersion), RowVersionToken.ToToken(storedTask.RowVersion));

        var storedChecklist = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.Id == checklist.Id);
        Assert.Equal(2, storedChecklist.Version);
        Assert.Equal(TaskChecklistStates.Submitted, storedChecklist.State);
    }

    [Fact]
    public async Task TaskAndChecklistExposeDifferentTokens()
    {
        var (db, task, _) = await ArrangeAsync();

        var query = new GetTaskChecklistQueryHandler(db);
        var result = await query.Handle(new GetTaskChecklistQuery(task.Id), default);

        Assert.True(result.TaskExists);
        Assert.NotNull(result.Checklist);

        var taskToken = RowVersionToken.ToToken(
            (await db.WorkTasks.AsNoTracking().FirstAsync(t => t.Id == task.Id)).RowVersion);

        Assert.NotEqual(taskToken, result.Checklist!.ETag);
    }

    [Fact]
    public async Task Query_ReturnsNoChecklistForATaskWithoutForm()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = "Tarea suelta",
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
        };
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var result = await new GetTaskChecklistQueryHandler(db)
            .Handle(new GetTaskChecklistQuery(task.Id), default);

        Assert.True(result.TaskExists);
        Assert.Null(result.Checklist);
    }

    [Fact]
    public async Task Query_ReturnsNothingWhenTheTaskDoesNotExist()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var result = await new GetTaskChecklistQueryHandler(db)
            .Handle(new GetTaskChecklistQuery(Guid.NewGuid()), default);

        Assert.False(result.TaskExists);
        Assert.Null(result.Checklist);
    }

    [Fact]
    public async Task SummaryList_ExposesTheChecklistTokenSeparatelyFromTheTaskToken()
    {
        var (db, task, _) = await ArrangeAsync();

        var handler = new GetWorkTasksQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(UserId));
        var result = await handler.Handle(new GetWorkTasksQuery(), default);

        var item = Assert.Single(result.Items, i => i.Id == task.Id);
        Assert.True(item.HasChecklist);
        Assert.Equal(RowVersionToken.ToToken(ChecklistVersion), item.ChecklistETag);
        Assert.Equal(RowVersionToken.ToToken(TaskVersion), item.ETag);
        Assert.NotEqual(item.ETag, item.ChecklistETag);
    }

    [Fact]
    public async Task SummaryList_ReportsNoChecklistForATaskWithoutForm()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = "Tarea suelta",
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
        };
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new GetWorkTasksQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(UserId));
        var result = await handler.Handle(new GetWorkTasksQuery(), default);

        var item = Assert.Single(result.Items, i => i.Id == task.Id);
        Assert.False(item.HasChecklist);
        Assert.Null(item.ChecklistETag);
    }

    // ------------------------------------------------------------------

    private static async Task<string?> ReadChecklistETagAsync(
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        Guid checklistId)
    {
        var rowVersion = await db.TaskChecklists
            .AsNoTracking()
            .Where(c => c.Id == checklistId)
            .Select(c => c.RowVersion)
            .FirstAsync();

        return RowVersionToken.ToToken(rowVersion);
    }

    private static async Task<(
        AssetHub.Infrastructure.Persistence.TenantDbContext Db,
        WorkTask Task,
        TaskChecklist Checklist)> ArrangeAsync()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = "Revisar equipo",
            State = WorkTaskStates.Todo,
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
            RowVersion = TaskVersion,
        };

        var checklist = new TaskChecklist
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            WorkTaskId = task.Id,
            SchemaJson = ChecklistSchemaFactory
                .FromLegacyChecklist("""{"tasks": [{"title": "Inspección visual externa"}]}""")!
                .SchemaJson,
            UiSchemaJson = "{}",
            RowVersion = ChecklistVersion,
        };

        db.WorkTasks.Add(task);
        db.TaskChecklists.Add(checklist);
        await db.SaveChangesAsync();

        return (db, task, checklist);
    }
}
