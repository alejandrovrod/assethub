using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Incidents.Commands;
using AssetHub.Application.Incidents.EventHandlers;
using AssetHub.Application.Incidents.Events;
using AssetHub.Application.Maintenance.Commands;
using AssetHub.Application.Maintenance.EventHandlers;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Application.Tasks.EventHandlers;
using AssetHub.Domain.Assets;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;
using AssetHub.Domain.WorkflowTemplates;
using Xunit;

namespace AssetHub.Api.Tests.MaintenanceOrders;

public class MaintenanceWorkflowIntegrationTests
{
    private static Asset CreateAsset(Guid tenantId, AssetTemplate template)
    {
        return new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = template.Id,
            AssetTemplate = template,
            Code = "A-001",
            Name = "Test Asset",
            State = template.LifecycleStates.InitialState,
            Path = "/"
        };
    }

    private static AssetTemplate CreateTemplate(Guid tenantId)
    {
        return new AssetTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "T1",
            Name = "Template",
            LifecycleStates = new LifecycleConfig
            {
                InitialState = "Activo",
                Transitions = new System.Collections.Generic.Dictionary<string, System.Collections.Generic.List<string>>
                {
                    ["Activo"] = new() { "EnReparacion" },
                    ["EnReparacion"] = new() { "Activo" }
                },
                States = new System.Collections.Generic.Dictionary<string, StateConfig>
                {
                    ["Activo"] = new(),
                    ["EnReparacion"] = new()
                }
            }
        };
    }

    private static CatalogItem CreateCatalogItem(Guid tenantId, string code)
    {
        return new CatalogItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = code,
            Order = 0
        };
    }

    [Fact]
    public async Task IncidentAssigned_CreatesCorrectiveMaintenanceOrder()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var template = CreateTemplate(tenantId);
        var asset = CreateAsset(tenantId, template);
        var incident = new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Asset = asset,
            Title = "Incident",
            TypeId = Guid.NewGuid(),
            State = IncidentStates.Assigned
        };

        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        db.Incidents.Add(incident);
        await db.SaveChangesAsync();

        var mediator = new MaintenanceOrderTestHelper.DispatchingMediator(
            db,
            new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId));
        var handler = new IncidentAssignedEventHandler(db, mediator);
        await handler.Handle(new AssetHub.Application.Incidents.Events.IncidentAssignedEvent(incident.Id, asset.Id, tenantId), CancellationToken.None);

        var order = db.MaintenanceOrders.FirstOrDefault(o => o.IncidentId == incident.Id);
        Assert.NotNull(order);
        Assert.Equal(MaintenanceOrderKinds.Corrective, order.Kind);
        Assert.Equal(MaintenanceOrderStates.Draft, order.State);

        // The order has to be born with something to execute: an order without tasks never
        // shows up in the technician's journey.
        var task = db.WorkTasks.FirstOrDefault(t => t.MaintenanceOrderId == order.Id);
        Assert.NotNull(task);
        Assert.Equal(WorkTaskStates.Todo, task.State);
        Assert.Equal(incident.Title, task.Title);
    }

    [Fact]
    public async Task IncidentPropertiesChanged_SyncsOpenOrderAndItsTasks()
    {
        var tenantId = Guid.NewGuid();
        var executorId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var template = new WorkflowTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "INC",
            Name = "Incident flow",
            SchemaJson = """
            {
              "properties": {
                "asignar_a":   { "type": "string", "format": "employee", "propagateToWork": true  },
                "diagnostico": { "type": "string",                       "propagateToWork": true  },
                "imagenes":    { "type": "array",                        "propagateToWork": false }
              }
            }
            """
        };

        var incident = new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = Guid.NewGuid(),
            Title = "Incident",
            TypeId = Guid.NewGuid(),
            State = IncidentStates.InProgress,
            WorkflowTemplateId = template.Id,
            WorkflowTemplate = template,
            PropertiesJson = $$"""{"asignar_a":"{{executorId}}","diagnostico":"nuevo","imagenes":["a.jpg"]}"""
        };

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = incident.AssetId,
            IncidentId = incident.Id,
            Incident = incident,
            Title = "Order",
            State = MaintenanceOrderStates.Draft,
            Kind = MaintenanceOrderKinds.Corrective,
            PropertiesJson = """{"diagnostico":"viejo","nota_de_la_orden":"propia"}"""
        };

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MaintenanceOrderId = order.Id,
            MaintenanceOrder = order,
            Title = "Task",
            State = WorkTaskStates.Todo,
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
            PropertiesJson = """{"diagnostico":"viejo","nota_propia":"mia"}"""
        };

        db.WorkflowTemplates.Add(template);
        db.Incidents.Add(incident);
        db.MaintenanceOrders.Add(order);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new IncidentStateChangedEventHandler(
            db,
            new MaintenanceOrderTestHelper.CapturingMediator());

        await handler.Handle(new IncidentPropertiesChangedEvent(incident.Id), CancellationToken.None);

        using (var orderProps = JsonDocument.Parse(order.PropertiesJson))
        {
            Assert.Equal("nuevo", orderProps.RootElement.GetProperty("diagnostico").GetString());
            Assert.True(orderProps.RootElement.TryGetProperty("asignar_a", out _));
            // propagateToWork=false: the incident's attachments never reach the order.
            Assert.False(orderProps.RootElement.TryGetProperty("imagenes", out _));
            // The order's own answers survive the sync.
            Assert.Equal("propia", orderProps.RootElement.GetProperty("nota_de_la_orden").GetString());
        }

        Assert.Equal(executorId, order.AssignedEmployeeId);

        using (var taskProps = JsonDocument.Parse(task.PropertiesJson))
        {
            Assert.Equal("nuevo", taskProps.RootElement.GetProperty("diagnostico").GetString());
            Assert.Equal("mia", taskProps.RootElement.GetProperty("nota_propia").GetString());
            Assert.True(taskProps.RootElement.TryGetProperty("asignar_a", out _));
        }

        Assert.Equal(executorId, task.AssignedEmployeeId);
    }

    [Fact]
    public async Task OrderStarted_MovesChildTasksToInProgress()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var template = CreateTemplate(tenantId);
        var asset = CreateAsset(tenantId, template);
        var taskType = CreateCatalogItem(tenantId, "general");
        var priority = CreateCatalogItem(tenantId, "normal");
        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Title = "Order",
            State = MaintenanceOrderStates.Scheduled,
            Kind = MaintenanceOrderKinds.Corrective
        };
        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MaintenanceOrderId = order.Id,
            MaintenanceOrder = order,
            Title = "Task",
            State = WorkTaskStates.Todo,
            TaskTypeCatalogItemId = taskType.Id,
            PriorityCatalogItemId = priority.Id
        };

        db.CatalogItems.Add(taskType);
        db.CatalogItems.Add(priority);
        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        db.MaintenanceOrders.Add(order);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new MaintenanceOrderStartedEventHandler(db);
        await handler.Handle(new AssetHub.Application.Maintenance.Events.MaintenanceOrderStartedEvent(order.Id, tenantId, asset.Id, null), CancellationToken.None);

        Assert.Equal(WorkTaskStates.InProgress, task.State);
        Assert.NotNull(task.StartedAt);
    }

    [Fact]
    public async Task AllTasksDone_CompletesMaintenanceOrder()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var taskType = CreateCatalogItem(tenantId, "general");
        var priority = CreateCatalogItem(tenantId, "normal");
        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = Guid.NewGuid(),
            Title = "Order",
            State = MaintenanceOrderStates.InProgress,
            Kind = MaintenanceOrderKinds.Corrective
        };
        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MaintenanceOrderId = order.Id,
            MaintenanceOrder = order,
            Title = "Task",
            State = WorkTaskStates.Done,
            CompletedAt = DateTime.UtcNow,
            TaskTypeCatalogItemId = taskType.Id,
            PriorityCatalogItemId = priority.Id
        };

        db.CatalogItems.Add(taskType);
        db.CatalogItems.Add(priority);
        db.MaintenanceOrders.Add(order);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var mediator = new MaintenanceOrderTestHelper.CapturingMediator();
        var handler = new WorkTaskStateChangedEventHandler(db, mediator);
        await handler.Handle(new AssetHub.Application.Tasks.Events.WorkTaskStateChangedEvent(
            task.Id, tenantId, WorkTaskStates.InProgress, WorkTaskStates.Done, null, null, order.Id, null), CancellationToken.None);

        Assert.Equal(MaintenanceOrderStates.Done, order.State);
        Assert.NotNull(order.CompletedAt);
    }

    [Fact]
    public async Task OrderVerified_ClosesLinkedIncident()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var template = CreateTemplate(tenantId);
        var asset = CreateAsset(tenantId, template);
        var incident = new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Asset = asset,
            Title = "Incident",
            TypeId = Guid.NewGuid(),
            State = IncidentStates.Resolved
        };
        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            IncidentId = incident.Id,
            Incident = incident,
            Title = "Order",
            State = MaintenanceOrderStates.Done,
            Kind = MaintenanceOrderKinds.Corrective
        };

        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        db.Incidents.Add(incident);
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        var mediator = new MaintenanceOrderTestHelper.CapturingMediator();
        var handler = new MaintenanceOrderVerifiedEventHandler(db, mediator);
        await handler.Handle(new AssetHub.Application.Maintenance.Events.MaintenanceOrderVerifiedEvent(order.Id, tenantId, asset.Id, incident.Id), CancellationToken.None);

        Assert.Equal(IncidentStates.Closed, incident.State);
        Assert.NotNull(incident.ClosedAt);
    }

    [Fact]
    public async Task PreventivePlan_GeneratesWorkTask_EvenWithActiveIncident()
    {
        var tenantId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        var template = CreateTemplate(tenantId);
        var asset = CreateAsset(tenantId, template);
        var incident = new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Asset = asset,
            Title = "Incident",
            TypeId = Guid.NewGuid(),
            State = IncidentStates.InProgress
        };
        var plan = new PreventivePlan
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Asset = asset,
            Name = "Plan",
            CronExpression = "0 0 1 * *",
            NextRunAt = DateTime.UtcNow.AddMinutes(-5),
            IsActive = true
        };

        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        db.Incidents.Add(incident);
        db.PreventivePlans.Add(plan);
        await db.SaveChangesAsync();

        var handler = new AssetHub.Application.Maintenance.Commands.EvaluatePreventivePlanCommandHandler(
            db,
            new MaintenanceOrderTestHelper.CapturingMediator(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<AssetHub.Application.Maintenance.Commands.EvaluatePreventivePlanCommandHandler>.Instance);

        var result = await handler.Handle(new EvaluatePreventivePlanCommand { PlanId = plan.Id }, CancellationToken.None);

        Assert.Equal(0, result.SkippedAssets);
        Assert.Equal(1, result.GeneratedWorkTasks);
    }
}
