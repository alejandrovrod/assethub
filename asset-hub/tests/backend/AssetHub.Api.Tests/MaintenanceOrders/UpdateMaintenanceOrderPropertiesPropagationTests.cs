using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.MaintenanceOrders;
using AssetHub.Application.Maintenance.Commands;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.MaintenanceOrders;

/// <summary>
/// UpdateMaintenanceOrderCommand: cascading propagation of PropertiesJson to child work tasks.
/// </summary>
public class UpdateMaintenanceOrderPropertiesPropagationTests
{
    private static (AssetHub.Infrastructure.Persistence.TenantDbContext Db, MaintenanceOrderTestHelper.FakeTenantResolver Resolver) CreateDb(Guid tenantId)
    {
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<AssetHub.Infrastructure.Persistence.TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return (new AssetHub.Infrastructure.Persistence.TenantDbContext(options, resolver), resolver);
    }

    private static WorkTask Task(Guid tenantId, Guid orderId, string state, string propertiesJson)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Tarea hija",
            State = state,
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
            MaintenanceOrderId = orderId,
            PropertiesJson = propertiesJson
        };

    [Fact]
    public async Task UpdateProperties_PropagatesToNonTerminalTasks_WithOrderPrecedence()
    {
        var tenantId = Guid.NewGuid();
        var (db, _) = CreateDb(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-001",
            Name = "Asset",
            State = "Activo",
            Path = "/",
            PropertiesJson = "{}"
        };

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Approved,
            Title = "Orden X",
            AssetId = asset.Id,
            PropertiesJson = "{\"diagnostico\":\"inicial\"}"
        };
        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);

        var openTask = Task(tenantId, order.Id, WorkTaskStates.Todo, "{\"diagnostico\":\"viejo\",\"extra\":\"mantener\"}");
        var inProgressTask = Task(tenantId, order.Id, WorkTaskStates.InProgress, "");
        var doneTask = Task(tenantId, order.Id, WorkTaskStates.Done, "{\"diagnostico\":\"no tocar\"}");
        db.WorkTasks.AddRange(openTask, inProgressTask, doneTask);
        await db.SaveChangesAsync();

        var handler = new UpdateMaintenanceOrderCommandHandler(db);
        await handler.Handle(new UpdateMaintenanceOrderCommand
        {
            MaintenanceOrderId = order.Id,
            PropertiesJson = "{\"diagnostico\":\"nuevo\",\"repartido_a\":\"emp-123\"}"
        }, CancellationToken.None);

        var updatedOpen = await db.WorkTasks.FirstAsync(t => t.Id == openTask.Id);
        var updatedInProgress = await db.WorkTasks.FirstAsync(t => t.Id == inProgressTask.Id);
        var untouchedDone = await db.WorkTasks.FirstAsync(t => t.Id == doneTask.Id);

        // Order values win over task values; unknown task keys are preserved.
        Assert.Contains("\"diagnostico\":\"nuevo\"", updatedOpen.PropertiesJson);
        Assert.Contains("\"repartido_a\":\"emp-123\"", updatedOpen.PropertiesJson);
        Assert.Contains("\"extra\":\"mantener\"", updatedOpen.PropertiesJson);

        // Task with null PropertiesJson gets the order props.
        Assert.Contains("\"diagnostico\":\"nuevo\"", updatedInProgress.PropertiesJson);

        // Terminal tasks are not touched.
        Assert.Equal("{\"diagnostico\":\"no tocar\"}", untouchedDone.PropertiesJson);
    }

    [Fact]
    public async Task UpdateProperties_UnchangedJson_DoesNotTouchTasks()
    {
        var tenantId = Guid.NewGuid();
        var (db, _) = CreateDb(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-002",
            Name = "Asset",
            State = "Activo",
            Path = "/",
            PropertiesJson = "{}"
        };

        var orderJson = "{\"a\":1}";
        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Approved,
            Title = "Orden Y",
            AssetId = asset.Id,
            PropertiesJson = orderJson
        };
        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);

        var task = Task(tenantId, order.Id, WorkTaskStates.Todo, "{\"original\":true}");
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new UpdateMaintenanceOrderCommandHandler(db);
        await handler.Handle(new UpdateMaintenanceOrderCommand
        {
            MaintenanceOrderId = order.Id,
            PropertiesJson = orderJson // same value
        }, CancellationToken.None);

        var updated = await db.WorkTasks.FirstAsync(t => t.Id == task.Id);
        Assert.Equal("{\"original\":true}", updated.PropertiesJson);
    }

    [Fact]
    public async Task UpdateProperties_SemanticallyEqualJson_DifferentFormatting_DoesNotTouchTasks()
    {
        var tenantId = Guid.NewGuid();
        var (db, _) = CreateDb(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-003",
            Name = "Asset",
            State = "Activo",
            Path = "/",
            PropertiesJson = "{}"
        };

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Approved,
            Title = "Orden Z",
            AssetId = asset.Id,
            // compact, one key order
            PropertiesJson = "{\"diagnostico\":\"ok\",\"repartido_a\":\"emp-1\"}"
        };
        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);

        var task = Task(tenantId, order.Id, WorkTaskStates.Todo, "{\"original\":true}");
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new UpdateMaintenanceOrderCommandHandler(db);
        await handler.Handle(new UpdateMaintenanceOrderCommand
        {
            MaintenanceOrderId = order.Id,
            // same data, but pretty-printed with reversed key order
            PropertiesJson = "{\n  \"repartido_a\": \"emp-1\",\n  \"diagnostico\": \"ok\"\n}"
        }, CancellationToken.None);

        // Task untouched: no semantic change in the order's properties.
        var updated = await db.WorkTasks.FirstAsync(t => t.Id == task.Id);
        Assert.Equal("{\"original\":true}", updated.PropertiesJson);
    }

    [Fact]
    public async Task UpdateProperties_SemanticallyDifferentJson_PropagatesToTasks()
    {
        var tenantId = Guid.NewGuid();
        var (db, _) = CreateDb(tenantId);

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-004",
            Name = "Asset",
            State = "Activo",
            Path = "/",
            PropertiesJson = "{}"
        };

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Approved,
            Title = "Orden W",
            AssetId = asset.Id,
            PropertiesJson = "{\"diagnostico\":\"ok\",\"repartido_a\":\"emp-1\"}"
        };
        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);

        var task = Task(tenantId, order.Id, WorkTaskStates.Todo, "{\"original\":true}");
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new UpdateMaintenanceOrderCommandHandler(db);
        await handler.Handle(new UpdateMaintenanceOrderCommand
        {
            MaintenanceOrderId = order.Id,
            // pretty-printed, same keys, but the diagnostic VALUE changed
            PropertiesJson = "{\n  \"repartido_a\": \"emp-1\",\n  \"diagnostico\": \"falla total\"\n}"
        }, CancellationToken.None);

        var updated = await db.WorkTasks.FirstAsync(t => t.Id == task.Id);
        Assert.Contains("\"diagnostico\":\"falla total\"", updated.PropertiesJson);
        // Task's own key survives the merge.
        Assert.Contains("\"original\":true", updated.PropertiesJson);
    }
}
