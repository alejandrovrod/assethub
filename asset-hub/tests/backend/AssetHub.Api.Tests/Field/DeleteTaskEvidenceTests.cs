using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Security;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Eliminación de evidencias (`DELETE /api/v1/work-tasks/{taskId}/evidences/{evidenceId}`).
///
/// El caso crítico no es el borrado feliz: es el reintento del outbox. Un DELETE repetido
/// tiene que seguir siendo 204, y una tarea cerrada tiene que seguir siendo un error de
/// negocio aunque la evidencia ya no exista.
/// </summary>
public class DeleteTaskEvidenceTests
{
    private static readonly Guid TenantId = Guid.Parse("c3000000-0000-0000-0000-000000000001");
    private static readonly Guid FieldUserId = Guid.Parse("c3000000-0000-0000-0000-00000000aa01");
    private static readonly Guid FieldEmployeeId = Guid.Parse("c3000000-0000-0000-0000-00000000ee01");
    private static readonly Guid OtherEmployeeId = Guid.Parse("c3000000-0000-0000-0000-00000000ee02");

    [Fact]
    public async Task DeletesTheEvidenceOfTheTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = NewTask();
        var evidence = NewEvidence(task.Id);
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(evidence);
        await db.SaveChangesAsync();

        await Handler(db).Handle(new DeleteTaskEvidenceCommand(task.Id, evidence.Id), CancellationToken.None);

        Assert.Empty(await db.TaskEvidences.Where(e => e.WorkTaskId == task.Id).ToListAsync());
    }

    [Fact]
    public async Task DeletingTwice_IsIdempotent()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = NewTask();
        var evidence = NewEvidence(task.Id);
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(evidence);
        await db.SaveChangesAsync();

        var handler = Handler(db);
        await handler.Handle(new DeleteTaskEvidenceCommand(task.Id, evidence.Id), CancellationToken.None);

        // Reintento del outbox: la respuesta original se perdió en el camino.
        var ex = await Record.ExceptionAsync(() =>
            handler.Handle(new DeleteTaskEvidenceCommand(task.Id, evidence.Id), CancellationToken.None));

        Assert.Null(ex);
    }

    [Fact]
    public async Task EvidenceOfAnotherTask_IsNotDeleted()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = NewTask();
        var otherTask = NewTask();
        var foreignEvidence = NewEvidence(otherTask.Id);
        db.WorkTasks.AddRange(task, otherTask);
        db.TaskEvidences.Add(foreignEvidence);
        await db.SaveChangesAsync();

        // El id de la evidencia no pertenece a {taskId}: no se borra nada, pero tampoco
        // se rompe el reintento (idempotente).
        await Handler(db).Handle(
            new DeleteTaskEvidenceCommand(task.Id, foreignEvidence.Id),
            CancellationToken.None);

        Assert.Single(await db.TaskEvidences.Where(e => e.Id == foreignEvidence.Id).ToListAsync());
    }

    [Fact]
    public async Task MissingTask_Returns404()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            Handler(db).Handle(new DeleteTaskEvidenceCommand(Guid.NewGuid(), Guid.NewGuid()), CancellationToken.None));
    }

    [Theory]
    [InlineData(WorkTaskStates.Done)]
    [InlineData(WorkTaskStates.Cancelled)]
    public async Task ClosedTask_IsRejected(string state)
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = NewTask(state);
        var evidence = NewEvidence(task.Id);
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(evidence);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Handler(db).Handle(new DeleteTaskEvidenceCommand(task.Id, evidence.Id), CancellationToken.None));

        Assert.Single(await db.TaskEvidences.Where(e => e.Id == evidence.Id).ToListAsync());
    }

    [Theory]
    [InlineData(MaintenanceOrderStates.Done)]
    [InlineData(MaintenanceOrderStates.Verified)]
    [InlineData(MaintenanceOrderStates.Cancelled)]
    public async Task TaskOfAClosedMaintenanceOrder_IsRejected(string orderState)
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var order = NewOrder(orderState);
        var task = NewTask(orderId: order.Id);
        var evidence = NewEvidence(task.Id);
        db.MaintenanceOrders.Add(order);
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(evidence);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Handler(db).Handle(new DeleteTaskEvidenceCommand(task.Id, evidence.Id), CancellationToken.None));
    }

    [Fact]
    public async Task TaskOfAnOpenMaintenanceOrder_IsAllowed()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var order = NewOrder(MaintenanceOrderStates.InProgress);
        var task = NewTask(orderId: order.Id);
        var evidence = NewEvidence(task.Id);
        db.MaintenanceOrders.Add(order);
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(evidence);
        await db.SaveChangesAsync();

        await Handler(db).Handle(new DeleteTaskEvidenceCommand(task.Id, evidence.Id), CancellationToken.None);

        Assert.Empty(await db.TaskEvidences.Where(e => e.WorkTaskId == task.Id).ToListAsync());
    }

    [Fact]
    public async Task FieldTechnician_CanDeleteOnAnOwnTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);

        var task = NewTask(assignedEmployeeId: FieldEmployeeId);
        var evidence = NewEvidence(task.Id);
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(evidence);
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(FieldUserId, new[] { FieldTechnicianRole.Name });

        await Handler(db, user).Handle(
            new DeleteTaskEvidenceCommand(task.Id, evidence.Id),
            CancellationToken.None);

        Assert.Empty(await db.TaskEvidences.Where(e => e.WorkTaskId == task.Id).ToListAsync());
    }

    [Fact]
    public async Task FieldTechnician_CannotDeleteOnAForeignTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);

        var task = NewTask(assignedEmployeeId: OtherEmployeeId);
        var evidence = NewEvidence(task.Id);
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(evidence);
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(FieldUserId, new[] { FieldTechnicianRole.Name });

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            Handler(db, user).Handle(new DeleteTaskEvidenceCommand(task.Id, evidence.Id), CancellationToken.None));

        Assert.Equal("field_role_task_not_assigned", ex.Message);
        Assert.Single(await db.TaskEvidences.Where(e => e.Id == evidence.Id).ToListAsync());
    }

    private static DeleteTaskEvidenceCommandHandler Handler(
        TenantDbContext db,
        WorkTaskTestHelper.FakeCurrentUser? user = null)
    {
        var currentUser = user ?? new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid());
        return new DeleteTaskEvidenceCommandHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, currentUser));
    }

    private static async Task SeedFieldEmployeeAsync(TenantDbContext db)
    {
        db.Employees.Add(new Employee
        {
            Id = FieldEmployeeId,
            TenantId = TenantId,
            FirstName = "Ana",
            LastName = "Técnica",
            Email = "ana@example.com",
            RoleCatalogItemId = Guid.NewGuid(),
            UserId = FieldUserId,
        });

        db.Employees.Add(new Employee
        {
            Id = OtherEmployeeId,
            TenantId = TenantId,
            FirstName = "Beto",
            LastName = "Técnico",
            Email = "beto@example.com",
            RoleCatalogItemId = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
        });

        await db.SaveChangesAsync();
    }

    private static WorkTask NewTask(
        string state = WorkTaskStates.InProgress,
        Guid? orderId = null,
        Guid? assignedEmployeeId = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        Title = "Cambiar filtro",
        State = state,
        MaintenanceOrderId = orderId,
        AssignedEmployeeId = assignedEmployeeId,
        TaskTypeCatalogItemId = Guid.NewGuid(),
        PriorityCatalogItemId = Guid.NewGuid(),
    };

    private static TaskEvidence NewEvidence(Guid taskId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        WorkTaskId = taskId,
        Type = "photo",
        BlobUri = $"https://blob.example.com/{Guid.NewGuid():N}.jpg",
        CapturedByUserId = FieldUserId,
        CapturedAt = DateTime.UtcNow,
    };

    private static MaintenanceOrder NewOrder(string state) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        Title = "Orden de mantenimiento",
        State = state,
        AssetId = Guid.NewGuid(),
    };
}
