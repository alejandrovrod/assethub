using System;
using System.Threading.Tasks;
using AssetHub.Application.Tasks.Queries;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;
using Xunit;

namespace AssetHub.Api.Tests.WorkTasks;

/// <summary>
/// Una tarea tiene un padre único (ver <c>CreateWorkTaskCommand</c>), así que las tareas
/// de reparación cuelgan de la orden y no de la incidencia. El filtro <c>?incidentId=</c>
/// igual tiene que devolver todo lo que se hizo en la incidencia, incluidas las tareas de
/// sus órdenes: si no, el widget de la incidencia sale vacío apenas se crea la orden.
/// </summary>
public class GetWorkTasksIncidentFilterTests
{
    private static readonly Guid TenantId = Guid.Parse("99999999-9999-9999-9999-999999999999");

    [Fact]
    public async Task IncidentFilter_IncludesTasksOfItsMaintenanceOrders()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var incident = NewIncident("Incidencia con orden");
        var order = NewOrder(incident.Id, "Orden de la incidencia");
        var diagnosisTask = NewTask("Diagnóstico", incidentId: incident.Id);
        var repairTask = NewTask("Reparación", maintenanceOrderId: order.Id);

        db.Incidents.Add(incident);
        db.MaintenanceOrders.Add(order);
        db.WorkTasks.AddRange(diagnosisTask, repairTask);
        await db.SaveChangesAsync();

        var handler = new GetWorkTasksQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(null));
        var result = await handler.Handle(new GetWorkTasksQuery { IncidentId = incident.Id }, default);

        Assert.Equal(2, result.TotalCount);
        Assert.Contains(result.Items, i => i.Id == diagnosisTask.Id);
        Assert.Contains(result.Items, i => i.Id == repairTask.Id);
    }

    [Fact]
    public async Task IncidentFilter_ExcludesTasksOfOtherIncidents()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var incident = NewIncident("Incidencia A");
        var otherIncident = NewIncident("Incidencia B");
        var otherOrder = NewOrder(otherIncident.Id, "Orden de B");
        var foreignTask = NewTask("Tarea ajena", maintenanceOrderId: otherOrder.Id);

        db.Incidents.AddRange(incident, otherIncident);
        db.MaintenanceOrders.Add(otherOrder);
        db.WorkTasks.Add(foreignTask);
        await db.SaveChangesAsync();

        var handler = new GetWorkTasksQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(null));
        var result = await handler.Handle(new GetWorkTasksQuery { IncidentId = incident.Id }, default);

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task IncidentFilter_ExcludesTasksOfDeletedOrders()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var incident = NewIncident("Incidencia con orden borrada");
        var deletedOrder = NewOrder(incident.Id, "Orden borrada");
        deletedOrder.IsDeleted = true;
        var orphanTask = NewTask("Tarea de la orden borrada", maintenanceOrderId: deletedOrder.Id);

        db.Incidents.Add(incident);
        db.MaintenanceOrders.Add(deletedOrder);
        db.WorkTasks.Add(orphanTask);
        await db.SaveChangesAsync();

        var handler = new GetWorkTasksQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(null));
        var result = await handler.Handle(new GetWorkTasksQuery { IncidentId = incident.Id }, default);

        Assert.Empty(result.Items);
    }

    private static Incident NewIncident(string title) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        Title = title,
        AssetId = Guid.NewGuid(),
        TypeId = Guid.NewGuid(),
        State = IncidentStates.Reported,
        PropertiesJson = "{}",
        ReportedAt = DateTime.UtcNow,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    private static MaintenanceOrder NewOrder(Guid incidentId, string title) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        Kind = MaintenanceOrderKinds.Corrective,
        State = MaintenanceOrderStates.InProgress,
        Title = title,
        AssetId = Guid.NewGuid(),
        IncidentId = incidentId,
        PropertiesJson = "{}",
        CreatedAt = DateTime.UtcNow,
    };

    private static WorkTask NewTask(
        string title,
        Guid? incidentId = null,
        Guid? maintenanceOrderId = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        Title = title,
        State = WorkTaskStates.Todo,
        TaskTypeCatalogItemId = Guid.NewGuid(),
        PriorityCatalogItemId = Guid.NewGuid(),
        IncidentId = incidentId,
        MaintenanceOrderId = maintenanceOrderId,
        PropertiesJson = "{}",
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };
}
