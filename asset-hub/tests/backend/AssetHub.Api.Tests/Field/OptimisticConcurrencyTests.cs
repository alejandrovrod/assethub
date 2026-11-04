using System;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Api.Configuration;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Application.Tasks.Helpers;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Concurrencia optimista de punta a punta en lo que se puede probar sin SQL Server:
/// el handler compara la versión declarada por el cliente y produce un 412 accionable,
/// y el middleware traduce tanto <see cref="ConcurrencyException"/> como
/// <c>DbUpdateConcurrencyException</c> a problem+json.
///
/// La carrera real (dos UPDATE simultáneos sobre la misma fila) la garantiza el
/// <c>rowversion</c> del motor y necesita SQL Server: ver T014/T023 en tasks.md.
/// </summary>
public class OptimisticConcurrencyTests
{
    private static readonly Guid TenantId = Guid.Parse("44444444-4444-4444-4444-444444444444");

    private static readonly byte[] CurrentVersion = { 1, 2, 3, 4, 5, 6, 7, 8 };
    private static readonly byte[] StaleVersion = { 9, 9, 9, 9, 9, 9, 9, 9 };

    private static async Task<(ChangeWorkTaskStateCommandHandler Handler, TenantDbContext Db, WorkTask Task)> ArrangeAsync()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = "Revisar tablero",
            State = WorkTaskStates.Todo,
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
            RowVersion = CurrentVersion,
        };

        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        // EF InMemory no genera rowversion: se fija el valor después del INSERT para
        // simular la versión que el motor ya emitió.
        task.RowVersion = CurrentVersion;

        var user = new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid());
        var handler = new ChangeWorkTaskStateCommandHandler(
            db,
            user,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeMediator(),
            WorkTaskTestHelper.CreateTaskAccess(db, user));

        return (handler, db, task);
    }

    [Fact]
    public async Task StaleVersion_ThrowsConcurrencyExceptionWithActionablePayload()
    {
        var (handler, _, task) = await ArrangeAsync();

        var exception = await Assert.ThrowsAsync<ConcurrencyException>(() =>
            handler.Handle(
                new ChangeWorkTaskStateCommand
                {
                    WorkTaskId = task.Id,
                    NewState = WorkTaskStates.InProgress,
                    ExpectedRowVersion = StaleVersion,
                },
                default));

        Assert.Equal(WorkTaskStates.Todo, exception.CurrentState);
        Assert.Equal(RowVersionToken.ToToken(CurrentVersion), exception.CurrentETag);
        Assert.NotNull(exception.AllowedTransitions);
        Assert.Contains(WorkTaskStates.InProgress, exception.AllowedTransitions!);
        Assert.Contains(WorkTaskStates.Cancelled, exception.AllowedTransitions!);
    }

    [Fact]
    public async Task MatchingVersion_AppliesTheTransition()
    {
        var (handler, db, task) = await ArrangeAsync();

        await handler.Handle(
            new ChangeWorkTaskStateCommand
            {
                WorkTaskId = task.Id,
                NewState = WorkTaskStates.InProgress,
                ExpectedRowVersion = CurrentVersion,
            },
            default);

        var stored = await db.WorkTasks.AsNoTracking().FirstAsync(t => t.Id == task.Id);
        Assert.Equal(WorkTaskStates.InProgress, stored.State);
        Assert.NotNull(stored.StartedAt);
    }

    [Fact]
    public async Task NoExpectedVersion_SkipsTheCheckForInternalCallers()
    {
        var (handler, db, task) = await ArrangeAsync();

        await handler.Handle(
            new ChangeWorkTaskStateCommand
            {
                WorkTaskId = task.Id,
                NewState = WorkTaskStates.InProgress,
                ExpectedRowVersion = null,
            },
            default);

        var stored = await db.WorkTasks.AsNoTracking().FirstAsync(t => t.Id == task.Id);
        Assert.Equal(WorkTaskStates.InProgress, stored.State);
    }

    [Fact]
    public async Task StaleVersion_DoesNotWriteAnything()
    {
        var (handler, db, task) = await ArrangeAsync();

        await Assert.ThrowsAsync<ConcurrencyException>(() =>
            handler.Handle(
                new ChangeWorkTaskStateCommand
                {
                    WorkTaskId = task.Id,
                    NewState = WorkTaskStates.InProgress,
                    ExpectedRowVersion = StaleVersion,
                },
                default));

        var stored = await db.WorkTasks.AsNoTracking().FirstAsync(t => t.Id == task.Id);
        Assert.Equal(WorkTaskStates.Todo, stored.State);
        Assert.Empty(await db.TaskStatusHistories.AsNoTracking().ToListAsync());
    }

    [Fact]
    public void AllowedTransitions_AreEmptyForTerminalStates()
    {
        Assert.Empty(TaskStateTransitionValidator.GetAllowedTransitions(WorkTaskStates.Done));
        Assert.Empty(TaskStateTransitionValidator.GetAllowedTransitions(WorkTaskStates.Cancelled));
        Assert.Contains(
            WorkTaskStates.Done,
            TaskStateTransitionValidator.GetAllowedTransitions(WorkTaskStates.InProgress));
    }

    // ------------------------------------------------------------------
    // Mapeo HTTP
    // ------------------------------------------------------------------

    [Fact]
    public async Task ConcurrencyException_MapsTo412_WithCurrentStateAndETag()
    {
        var (app, client) = await CreateHarnessAsync(app2 => app2.MapGet("/conflict", _ =>
            throw new ConcurrencyException(
                "La tarea fue modificada por otra persona.",
                currentState: "in_progress",
                allowedTransitions: new[] { "done", "cancelled" },
                currentETag: "AAAAAAAAD8E")));

        await using var _1 = app;
        using var _2 = client;

        var response = await client.GetAsync("/conflict");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(412, (int)response.StatusCode);
        Assert.Contains("version_mismatch", body);
        Assert.Contains("\"currentState\":\"in_progress\"", body);
        Assert.Contains("allowedTransitions", body);
        Assert.Contains("currentETag", body);
        Assert.Equal("\"AAAAAAAAD8E\"", response.Headers.ETag?.ToString());
    }

    [Fact]
    public async Task DbUpdateConcurrencyException_MapsTo412_Never500()
    {
        var (app, client) = await CreateHarnessAsync(app2 => app2.MapGet("/db-conflict", _ =>
            throw new DbUpdateConcurrencyException("The database operation was expected to affect 1 row(s), but actually affected 0 row(s).")));

        await using var _1 = app;
        using var _2 = client;

        var response = await client.GetAsync("/db-conflict");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(412, (int)response.StatusCode);
        Assert.Contains("version_mismatch", body);
    }

    private static async Task<(WebApplication App, System.Net.Http.HttpClient Client)> CreateHarnessAsync(
        Action<WebApplication> mapEndpoint)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRouting();
        builder.Services.AddAssetHubLocalization();

        var app = builder.Build();
        app.UseRequestLocalization();
        app.UseMiddleware<AssetHub.Api.Middleware.ExceptionHandlingMiddleware>();
        mapEndpoint(app);
        await app.StartAsync();

        var server = (TestServer)app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();
        return (app, server.CreateClient());
    }
}
