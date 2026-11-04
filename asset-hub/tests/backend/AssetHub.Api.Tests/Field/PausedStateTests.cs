using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Application.Tasks.Queries;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using MediatR;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Estado <c>paused</c> (022 Fase 7, B9).
///
/// El reloj se mueve a mano: lo que hay que probar no es "que la tarea quede en paused"
/// —eso lo dice el estado— sino la aritmética de <c>TotalPausedSeconds</c> y de la
/// duración neta con pausas múltiples. Con el reloj real esos números serían siempre
/// cero y el test pasaría sin probar nada.
/// </summary>
public class PausedStateTests
{
    private static readonly Guid TenantId = Guid.Parse("e0000000-0000-0000-0000-000000000001");
    private static readonly DateTime T0 = new(2026, 1, 1, 8, 0, 0, DateTimeKind.Utc);

    private sealed class FixedClockHandler : ChangeWorkTaskStateCommandHandler
    {
        public FixedClockHandler(
            ITenantDbContext db,
            ICurrentUser currentUser,
            ITenantResolver tenantResolver,
            IMediator mediator,
            DateTime now,
            AssetHub.Application.Field.FieldTaskAccess access)
            : base(db, currentUser, tenantResolver, mediator, access)
        {
            Now = now;
        }

        public DateTime Now { get; set; }

        protected override DateTime UtcNow => Now;
    }

    private sealed class Harness : IAsyncDisposable
    {
        public Harness(TenantDbContext db, WorkTask task, FixedClockHandler handler)
        {
            Db = db;
            Task = task;
            Handler = handler;
        }

        public TenantDbContext Db { get; }

        public WorkTask Task { get; }

        public FixedClockHandler Handler { get; }

        public async ValueTask DisposeAsync() => await Db.DisposeAsync();
    }

    private static async Task<Harness> CreateAsync(string state = WorkTaskStates.Todo, DateTime? startedAt = null)
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        // Las dos FKs son obligatorias. En SQL Server el FK garantiza que existan; en
        // InMemory no hay FK, pero EF genera INNER JOIN para la navegación requerida y una
        // fila huérfana desaparecería del resultado al leer el detalle.
        var taskType = new AssetHub.Domain.Catalogs.CatalogItem
        {
            Id = Guid.NewGuid(),
            CatalogId = Guid.NewGuid(),
            TenantId = TenantId,
            Code = "general",
            Order = 0,
        };

        var priority = new AssetHub.Domain.Catalogs.CatalogItem
        {
            Id = Guid.NewGuid(),
            CatalogId = Guid.NewGuid(),
            TenantId = TenantId,
            Code = "normal",
            Order = 0,
        };

        db.CatalogItems.Add(taskType);
        db.CatalogItems.Add(priority);

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = "Pause test",
            State = state,
            TaskTypeCatalogItemId = taskType.Id,
            PriorityCatalogItemId = priority.Id,
            StartedAt = startedAt,
        };

        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid());
        var handler = new FixedClockHandler(
            db,
            user,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeMediator(),
            T0,
            WorkTaskTestHelper.CreateTaskAccess(db, user));

        return new Harness(db, task, handler);
    }

    private static Task Change(FixedClockHandler handler, WorkTask task, string state)
        => handler.Handle(new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = state }, CancellationToken.None);

    [Fact]
    public async Task Pause_FromInProgress_SetsPausedAtAndLeavesCompletedAtNull()
    {
        await using var h = await CreateAsync(WorkTaskStates.InProgress, T0);

        h.Handler.Now = T0.AddMinutes(5);
        await Change(h.Handler, h.Task, WorkTaskStates.Paused);

        Assert.Equal(WorkTaskStates.Paused, h.Task.State);
        Assert.Equal(T0.AddMinutes(5), h.Task.PausedAt);
        Assert.Null(h.Task.CompletedAt);
        // La pausa todavía está abierta: no se acumula hasta que salga de `paused`.
        Assert.Equal(0, h.Task.TotalPausedSeconds);
    }

    [Fact]
    public async Task MultiplePauses_AccumulateAndNetDurationExcludesThem()
    {
        await using var h = await CreateAsync();

        h.Handler.Now = T0;
        await Change(h.Handler, h.Task, WorkTaskStates.InProgress);
        Assert.Equal(T0, h.Task.StartedAt);

        // +1 min: pausa de 5 min (60 → 360)
        h.Handler.Now = T0.AddSeconds(60);
        await Change(h.Handler, h.Task, WorkTaskStates.Paused);

        h.Handler.Now = T0.AddSeconds(360);
        await Change(h.Handler, h.Task, WorkTaskStates.InProgress);
        Assert.Equal(300, h.Task.TotalPausedSeconds);
        Assert.Equal(T0.AddSeconds(360), h.Task.ResumedAt);
        Assert.Null(h.Task.PausedAt);

        // +2 min de trabajo y otra pausa de 10 min (480 → 1080)
        h.Handler.Now = T0.AddSeconds(480);
        await Change(h.Handler, h.Task, WorkTaskStates.Paused);

        h.Handler.Now = T0.AddSeconds(1080);
        await Change(h.Handler, h.Task, WorkTaskStates.Done);

        Assert.Equal(WorkTaskStates.Done, h.Task.State);
        Assert.Equal(900, h.Task.TotalPausedSeconds);
        Assert.Null(h.Task.PausedAt);
        Assert.Equal(T0.AddSeconds(1080), h.Task.CompletedAt);

        // 1080 s brutos - 900 s pausados = 180 s de trabajo real.
        var detail = await new GetWorkTaskByIdQueryHandler(h.Db)
            .Handle(new GetWorkTaskByIdQuery(h.Task.Id), CancellationToken.None);

        Assert.NotNull(detail);
        Assert.Equal(180, detail!.DurationSeconds);
        Assert.Equal(900, detail.TotalPausedSeconds);
        Assert.Empty(detail.AllowedTransitions);
        Assert.Equal(5, h.Db.TaskStatusHistories.Count());
    }

    [Fact]
    public async Task PausedToDone_ClosesTheOpenPauseInterval()
    {
        await using var h = await CreateAsync(WorkTaskStates.InProgress, T0);

        h.Handler.Now = T0.AddMinutes(1);
        await Change(h.Handler, h.Task, WorkTaskStates.Paused);

        h.Handler.Now = T0.AddMinutes(11);
        await Change(h.Handler, h.Task, WorkTaskStates.Done);

        // Si sólo se cerrara la pausa al reanudar, estos 600 s se contarían como trabajo.
        Assert.Equal(600, h.Task.TotalPausedSeconds);
        Assert.Null(h.Task.PausedAt);
        Assert.Null(h.Task.ResumedAt);
        Assert.Equal(T0.AddMinutes(11), h.Task.CompletedAt);
    }

    [Fact]
    public async Task TodoToPaused_IsRejectedAsInvalidTransition()
    {
        await using var h = await CreateAsync();

        h.Handler.Now = T0.AddMinutes(1);
        var ex = await Assert.ThrowsAsync<InvalidTransitionException>(
            () => Change(h.Handler, h.Task, WorkTaskStates.Paused));

        Assert.Equal("invalid_transition", ex.Code);
        Assert.Equal(WorkTaskStates.Todo, ex.CurrentState);
        Assert.Equal(new[] { WorkTaskStates.Cancelled, WorkTaskStates.InProgress }, ex.AllowedTransitions);

        // El rechazo no deja rastro: ni estado, ni pausa abierta, ni historial.
        Assert.Equal(WorkTaskStates.Todo, h.Task.State);
        Assert.Null(h.Task.PausedAt);
        Assert.Empty(h.Db.TaskStatusHistories);
    }

    [Fact]
    public async Task PausedTask_ExposesAllowedTransitionsAndReworkReason()
    {
        await using var h = await CreateAsync(WorkTaskStates.Paused, T0);
        h.Task.PausedAt = T0;
        h.Task.ReworkReason = "Falta la pieza del proveedor";
        h.Task.ReworkedAt = T0.AddHours(-2);
        await h.Db.SaveChangesAsync();

        var detail = await new GetWorkTaskByIdQueryHandler(h.Db)
            .Handle(new GetWorkTaskByIdQuery(h.Task.Id), CancellationToken.None);

        Assert.NotNull(detail);
        Assert.Equal(
            new[] { WorkTaskStates.Cancelled, WorkTaskStates.Done, WorkTaskStates.InProgress },
            detail!.AllowedTransitions);
        Assert.Equal("Falta la pieza del proveedor", detail.ReworkReason);
        Assert.Equal(T0, detail.PausedAt);
        // Sin CompletedAt no hay duración que medir.
        Assert.Null(detail.DurationSeconds);
    }
}
