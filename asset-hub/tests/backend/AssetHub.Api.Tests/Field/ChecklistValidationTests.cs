using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using AssetHub.Api.Configuration;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Tasks.Checklists;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Validación server-side del checklist (022 T030/T033).
///
/// El cliente valida con Ajv para dar feedback inmediato, pero eso no es una garantía:
/// el PWA puede estar semanas sin actualizar el esquema cacheado. El servidor valida
/// contra el snapshot que él mismo guardó, y si no cumple, no escribe nada.
/// </summary>
public class ChecklistValidationTests
{
    private static readonly Guid TenantId = Guid.Parse("55555555-5555-5555-5555-555555555555");
    private static readonly Guid UserId = Guid.Parse("66666666-6666-6666-6666-666666666666");

    private const string LegacyChecklist = """
        {"tasks": [{"title": "Inspección visual externa", "description": "Revisar golpes.", "frequency": "Al ingreso"}, {"title": "Verificar encendido básico", "description": "Comprobar que encienda.", "frequency": "Al ingreso"}]}
        """;

    private const string CompleteResponse = """{"item_0":true,"item_1":true}""";

    private static string Schema =>
        ChecklistSchemaFactory.FromLegacyChecklist(LegacyChecklist)!.SchemaJson;

    // ------------------------------------------------------------------
    // Validador puro
    // ------------------------------------------------------------------

    [Fact]
    public async Task MissingRequiredItem_IsReportedOnThatField()
    {
        var errors = await TaskChecklistValidator.ValidateAsync(Schema, """{"item_0":true}""");

        var error = Assert.Single(errors);
        Assert.Equal("item_1", error.Field);
        Assert.Equal("This field is required.", error.Message);
    }

    [Fact]
    public async Task UnknownField_IsReportedOnThatField()
    {
        var errors = await TaskChecklistValidator.ValidateAsync(
            Schema,
            """{"item_0":true,"item_1":true,"item_2":true}""");

        var error = Assert.Single(errors);
        Assert.Equal("item_2", error.Field);
        Assert.Equal("Unknown field for this checklist.", error.Message);
    }

    [Fact]
    public async Task WrongType_IsReportedOnThatField()
    {
        var errors = await TaskChecklistValidator.ValidateAsync(
            Schema,
            """{"item_0":"sí","item_1":true}""");

        var error = Assert.Single(errors);
        Assert.Equal("item_0", error.Field);
        Assert.Equal("Expected true or false.", error.Message);
    }

    [Theory]
    [InlineData("no es json")]
    [InlineData("[true, false]")]
    [InlineData("42")]
    [InlineData("")]
    public async Task BodyThatIsNotAJsonObject_FailsOnResponseJson(string response)
    {
        var errors = await TaskChecklistValidator.ValidateAsync(Schema, response);

        Assert.NotEmpty(errors);
        Assert.All(errors, e => Assert.Equal("responseJson", e.Field));
    }

    [Fact]
    public async Task CompleteResponse_HasNoErrors()
    {
        var errors = await TaskChecklistValidator.ValidateAsync(Schema, CompleteResponse);

        Assert.Empty(errors);
    }

    [Fact]
    public async Task CanonicalForm_IsStableRegardlessOfFormatting()
    {
        var compact = await TaskChecklistValidator.ValidateAsync(
            Schema,
            """{"item_0":true,"item_1":false}""");

        var spaced = await TaskChecklistValidator.ValidateAsync(
            Schema,
            """
            {
              "item_0": true,
              "item_1": false
            }
            """);

        Assert.Empty(compact);
        Assert.Empty(spaced);

        Assert.True(TaskChecklistValidator.TryCanonicalizeObject(
            """{ "item_0" : true, "item_1" : false }""", out var first, out _));
        Assert.True(TaskChecklistValidator.TryCanonicalizeObject(
            """{"item_0":true,"item_1":false}""", out var second, out _));
        Assert.Equal(first, second);
    }

    // ------------------------------------------------------------------
    // Handler
    // ------------------------------------------------------------------

    [Fact]
    public async Task InvalidResponse_DoesNotTouchTheStoredRow()
    {
        var (handler, db, checklist) = await ArrangeAsync();

        var error = await Assert.ThrowsAsync<ChecklistValidationException>(() =>
            handler.Handle(
                new SubmitTaskChecklistCommand
                {
                    TaskId = checklist.WorkTaskId,
                    ResponseJson = """{"item_0":true}""",
                    ExpectedRowVersion = checklist.RowVersion,
                },
                default));

        Assert.Equal("item_1", Assert.Single(error.FieldErrors).Field);

        var stored = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.Id == checklist.Id);
        Assert.Equal(TaskChecklistStates.Pending, stored.State);
        Assert.Equal(1, stored.Version);
        Assert.Equal("{}", stored.ResponseJson);
        Assert.Null(stored.SubmittedAt);
        Assert.Null(stored.SubmittedByUserId);
    }

    [Fact]
    public async Task ValidResponse_BumpsVersionAndRecordsSubmission()
    {
        var (handler, db, checklist) = await ArrangeAsync();

        var result = await handler.Handle(
            new SubmitTaskChecklistCommand
            {
                TaskId = checklist.WorkTaskId,
                ResponseJson = CompleteResponse,
                ExpectedRowVersion = checklist.RowVersion,
            },
            default);

        Assert.Equal(2, result.Version);
        Assert.Equal(TaskChecklistStates.Submitted, result.State);
        Assert.Equal(CompleteResponse, result.ResponseJson);
        Assert.NotNull(result.SubmittedAt);

        var stored = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.Id == checklist.Id);
        Assert.Equal(TaskChecklistStates.Submitted, stored.State);
        Assert.Equal(2, stored.Version);
        Assert.Equal(UserId, stored.SubmittedByUserId);
        Assert.NotNull(stored.UpdatedAt);
    }

    [Fact]
    public async Task SecondSubmission_IncrementsVersionAgain()
    {
        var (handler, _, checklist) = await ArrangeAsync();

        var first = await handler.Handle(
            new SubmitTaskChecklistCommand { TaskId = checklist.WorkTaskId, ResponseJson = CompleteResponse },
            default);

        var second = await handler.Handle(
            new SubmitTaskChecklistCommand
            {
                TaskId = checklist.WorkTaskId,
                ResponseJson = """{"item_0":false,"item_1":true}""",
                ExpectedRowVersion = checklist.RowVersion,
            },
            default);

        Assert.Equal(2, first.Version);
        Assert.Equal(3, second.Version);
    }

    [Fact]
    public async Task StaleVersion_IsRejectedBeforeValidatingTheBody()
    {
        var (handler, db, checklist) = await ArrangeAsync();

        var error = await Assert.ThrowsAsync<ConcurrencyException>(() =>
            handler.Handle(
                new SubmitTaskChecklistCommand
                {
                    TaskId = checklist.WorkTaskId,
                    ResponseJson = "no es json",
                    ExpectedRowVersion = new byte[] { 9, 9, 9, 9 },
                },
                default));

        Assert.Equal(TaskChecklistStates.Pending, error.CurrentState);
        Assert.NotNull(error.CurrentETag);

        var stored = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.Id == checklist.Id);
        Assert.Equal(1, stored.Version);
    }

    [Fact]
    public async Task MissingChecklist_Is404AndMissingTaskIs404Too()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = "Sin formulario",
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
        };
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new SubmitTaskChecklistCommandHandler(
            db,
            new WorkTaskTestHelper.FakeCurrentUser(UserId));

        var withoutChecklist = await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.NotFoundException>(() =>
            handler.Handle(
                new SubmitTaskChecklistCommand { TaskId = task.Id, ResponseJson = "{}" },
                default));

        var withoutTask = await Assert.ThrowsAsync<AssetHub.Domain.Exceptions.NotFoundException>(() =>
            handler.Handle(
                new SubmitTaskChecklistCommand { TaskId = Guid.NewGuid(), ResponseJson = "{}" },
                default));

        Assert.Contains("no tiene checklist", withoutChecklist.Message);
        Assert.Contains("Tarea no encontrada", withoutTask.Message);
    }

    // ------------------------------------------------------------------
    // Mapeo HTTP
    // ------------------------------------------------------------------

    [Fact]
    public async Task ChecklistValidationException_MapsTo422WithFieldErrors()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRouting();
        builder.Services.AddAssetHubLocalization();

        var app = builder.Build();
        app.UseRequestLocalization();
        app.UseMiddleware<AssetHub.Api.Middleware.ExceptionHandlingMiddleware>();
        app.MapGet("/checklist", _ => throw new ChecklistValidationException(new List<ChecklistFieldError>
        {
            new("item_3", "This field is required."),
            new("item_7", "Unknown field for this checklist."),
        }));
        await app.StartAsync();

        await using var _app = app;
        var server = (TestServer)app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();
        using var client = server.CreateClient();

        var response = await client.GetAsync("/checklist");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(422, (int)response.StatusCode);
        Assert.Contains("checklist_validation_failed", body);
        Assert.Contains("\"field\":\"item_3\"", body);
        Assert.Contains("\"message\":\"This field is required.\"", body);
        Assert.Contains("\"field\":\"item_7\"", body);
    }

    // ------------------------------------------------------------------

    private static async Task<(SubmitTaskChecklistCommandHandler Handler, TenantDbContext Db, TaskChecklist Checklist)> ArrangeAsync()
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
        };

        var checklist = new TaskChecklist
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            WorkTaskId = task.Id,
            SchemaJson = Schema,
            UiSchemaJson = "{}",
            State = TaskChecklistStates.Pending,
            Version = 1,
            // EF InMemory no genera rowversion: se fija a mano para poder probar el
            // pre-check explícito de versión.
            RowVersion = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 },
        };

        db.WorkTasks.Add(task);
        db.TaskChecklists.Add(checklist);
        await db.SaveChangesAsync();

        var handler = new SubmitTaskChecklistCommandHandler(
            db,
            new WorkTaskTestHelper.FakeCurrentUser(UserId));

        return (handler, db, checklist);
    }
}
