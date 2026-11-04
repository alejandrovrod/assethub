using System;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Snapshot del checklist al crear la tarea (022 T032).
///
/// El punto que se prueba no es "se guarda un JSON": es que se guarda **una copia**.
/// Si la tarea leyera la plantilla al abrir el formulario, editar la plantilla cambiaría
/// el formulario de tareas que el técnico ya está completando, y las respuestas viejas
/// dejarían de significar lo mismo.
/// </summary>
public class ChecklistSnapshotTests
{
    private static readonly Guid TenantId = Guid.Parse("AAAAAAAA-0000-0000-0000-000000000001");

    private const string TemplateChecklist = """
        {"tasks": [{"title": "Inspección visual externa", "frequency": "Al ingreso"}, {"title": "Pruebas finales"}]}
        """;

    [Fact]
    public async Task TaskLinkedToAnAsset_CopiesTheTemplateChecklist()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var asset = await SeedAssetAsync(db);

        var handler = new CreateWorkTaskCommandHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeMediator());

        var taskId = await handler.Handle(
            new CreateWorkTaskCommand
            {
                Title = "Revisar equipo",
                AssetId = asset.Id,
                TaskTypeCatalogItemId = Guid.NewGuid(),
                PriorityCatalogItemId = Guid.NewGuid(),
            },
            default);

        var checklist = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.WorkTaskId == taskId);

        Assert.Equal(1, checklist.Version);
        Assert.Equal(TaskChecklistStates.Pending, checklist.State);
        Assert.Equal("{}", checklist.ResponseJson);
        Assert.Contains("\"item_0\"", checklist.SchemaJson);
        Assert.Contains("\"item_1\"", checklist.SchemaJson);
        Assert.Contains("Inspección visual externa", checklist.SchemaJson);
    }

    [Fact]
    public async Task EditingTheTemplateAfterwards_DoesNotRewriteTheSnapshot()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var asset = await SeedAssetAsync(db);

        var handler = new CreateWorkTaskCommandHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeMediator());

        var taskId = await handler.Handle(
            new CreateWorkTaskCommand
            {
                Title = "Revisar equipo",
                AssetId = asset.Id,
                TaskTypeCatalogItemId = Guid.NewGuid(),
                PriorityCatalogItemId = Guid.NewGuid(),
            },
            default);

        var before = (await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.WorkTaskId == taskId)).SchemaJson;

        var template = await db.AssetTemplates.FirstAsync();
        template.MaintenanceChecklist = """{"tasks": [{"title": "Checklist nuevo"}]}""";
        await db.SaveChangesAsync();

        var after = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.WorkTaskId == taskId);
        Assert.Equal(before, after.SchemaJson);
        Assert.DoesNotContain("Checklist nuevo", after.SchemaJson);
    }

    [Fact]
    public async Task ExplicitChecklistJson_SnapshotsEvenWithoutAnAsset()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var handler = new CreateWorkTaskCommandHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeMediator());

        var taskId = await handler.Handle(
            new CreateWorkTaskCommand
            {
                Title = "Tarea suelta con formulario",
                IsIndependent = true,
                TaskTypeCatalogItemId = Guid.NewGuid(),
                PriorityCatalogItemId = Guid.NewGuid(),
                ChecklistJson = """{"tasks": [{"title": "Verificar batería"}]}""",
            },
            default);

        var checklist = await db.TaskChecklists.AsNoTracking().FirstAsync(c => c.WorkTaskId == taskId);
        Assert.Contains("Verificar batería", checklist.SchemaJson);
    }

    [Fact]
    public async Task AssetWithoutChecklist_DoesNotCreateAnEmptyRow()
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var template = new AssetTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Code = "TPL-EMPTY",
            Name = "Sin checklist",
            SchemaJson = "{}",
            MaintenanceChecklist = string.Empty,
        };
        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            AssetTemplateId = template.Id,
            AssetTemplate = template,
            Code = "A-EMPTY",
            Name = "Equipo sin formulario",
            Path = "/A-EMPTY",
            State = "active",
        };
        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        await db.SaveChangesAsync();

        var handler = new CreateWorkTaskCommandHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeMediator());

        var taskId = await handler.Handle(
            new CreateWorkTaskCommand
            {
                Title = "Revisar equipo",
                AssetId = asset.Id,
                TaskTypeCatalogItemId = Guid.NewGuid(),
                PriorityCatalogItemId = Guid.NewGuid(),
            },
            default);

        Assert.False(await db.TaskChecklists.AsNoTracking().AnyAsync(c => c.WorkTaskId == taskId));
    }

    private static async Task<Asset> SeedAssetAsync(AssetHub.Infrastructure.Persistence.TenantDbContext db)
    {
        var template = new AssetTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Code = "TPL-LAPTOP",
            Name = "Laptop",
            SchemaJson = "{}",
            MaintenanceChecklist = TemplateChecklist,
        };

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            AssetTemplateId = template.Id,
            AssetTemplate = template,
            Code = "A-001",
            Name = "Laptop 01",
            Path = "/A-001",
            State = "active",
        };

        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        await db.SaveChangesAsync();

        return asset;
    }
}
