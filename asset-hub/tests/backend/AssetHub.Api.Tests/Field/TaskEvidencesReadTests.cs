using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Tasks.Queries;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Security;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// 022 T073 — lectura de evidencias (`GET /api/v1/work-tasks/{taskId}/evidences`).
///
/// Cubre las tres respuestas que el cliente de campo necesita distinguir: lista, 404
/// (la tarea no existe o es de otro tenant) y 403 (existe, pero no es suya).
/// </summary>
public class TaskEvidencesReadTests
{
    private static readonly Guid TenantId = Guid.Parse("c1000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherTenantId = Guid.Parse("c1000000-0000-0000-0000-000000000002");

    private static readonly Guid FieldUserId = Guid.Parse("c1000000-0000-0000-0000-00000000aa01");
    private static readonly Guid FieldEmployeeId = Guid.Parse("c1000000-0000-0000-0000-00000000ee01");
    private static readonly Guid TeamId = Guid.Parse("c1000000-0000-0000-0000-000000007777");
    private static readonly Guid TeamMateEmployeeId = Guid.Parse("c1000000-0000-0000-0000-00000000ee02");

    [Fact]
    public async Task ReturnsOnlyTheEvidencesOfTheTask_OrderedByCaptureTime()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var ownTask = NewTask("Cambiar filtro");
        var otherTask = NewTask("Revisar tablero");
        db.WorkTasks.AddRange(ownTask, otherTask);

        var later = NewEvidence(ownTask.Id, "note", new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Utc));
        var earlier = NewEvidence(ownTask.Id, "photo", new DateTime(2026, 1, 1, 9, 0, 0, DateTimeKind.Utc));
        db.TaskEvidences.AddRange(later, earlier, NewEvidence(otherTask.Id, "signature", later.CapturedAt));
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid());
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        var result = await handler.Handle(new GetTaskEvidencesQuery(ownTask.Id), CancellationToken.None);

        Assert.Equal(new[] { earlier.Id, later.Id }, result.Select(e => e.Id));
        Assert.Equal("photo", result[0].Type);
        Assert.All(result, e => Assert.Equal(FieldUserId, e.CapturedByUserId));
    }

    [Fact]
    public async Task MissingTask_Returns404()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var user = new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid());
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new GetTaskEvidencesQuery(Guid.NewGuid()), CancellationToken.None));
    }

    [Fact]
    public async Task TaskOfAnotherTenant_Returns404_NotForbidden()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var foreignTaskId = Guid.NewGuid();
        await using (var foreign = WorkTaskTestHelper.CreateDbContext(OtherTenantId))
        {
            foreign.WorkTasks.Add(NewTask("Tarea de otro tenant", foreignTaskId, OtherTenantId));
            await foreign.SaveChangesAsync();
        }

        var user = new WorkTaskTestHelper.FakeCurrentUser(FieldUserId);
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        // 404 y no 403: decir "existe pero no es tuya" en otro tenant es una fuga.
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new GetTaskEvidencesQuery(foreignTaskId), CancellationToken.None));
    }

    [Fact]
    public async Task FieldTechnician_OnAssignedTask_ReadsEvidences()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);

        var task = NewTask("Cambiar filtro");
        task.AssignedEmployeeId = FieldEmployeeId;
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(NewEvidence(task.Id, "photo", DateTime.UtcNow));
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(FieldUserId, new[] { FieldTechnicianRole.Name });
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        var result = await handler.Handle(new GetTaskEvidencesQuery(task.Id), CancellationToken.None);

        Assert.Single(result);
        Assert.Equal("photo", result[0].Type);
    }

    [Fact]
    public async Task FieldTechnician_OnTaskOfOwnTeam_ReadsEvidences()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);

        var task = NewTask("Mantenimiento de sala");
        task.AssignedTeamId = TeamId;
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(FieldUserId, new[] { FieldTechnicianRole.Name });
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        var result = await handler.Handle(new GetTaskEvidencesQuery(task.Id), CancellationToken.None);

        Assert.Empty(result);
    }

    [Fact]
    public async Task FieldTechnician_OnForeignTask_IsForbidden()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);

        var foreignTask = NewTask("Tarea de otro técnico");
        foreignTask.AssignedEmployeeId = TeamMateEmployeeId;
        db.WorkTasks.Add(foreignTask);
        db.TaskEvidences.Add(NewEvidence(foreignTask.Id, "photo", DateTime.UtcNow));
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(FieldUserId, new[] { FieldTechnicianRole.Name });
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            handler.Handle(new GetTaskEvidencesQuery(foreignTask.Id), CancellationToken.None));

        Assert.Equal(FieldTaskAccessMessageKeys.TaskNotAssigned, ex.Message);
    }

    [Fact]
    public async Task FieldTechnician_WithoutEmployeeRecord_IsForbidden()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = NewTask("Cambiar filtro");
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        // Tiene el rol pero no ficha de empleado: no puede probar que la tarea es suya.
        var user = new WorkTaskTestHelper.FakeCurrentUser(FieldUserId, new[] { FieldTechnicianRole.Name });
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            handler.Handle(new GetTaskEvidencesQuery(task.Id), CancellationToken.None));
    }

    [Fact]
    public async Task NonFieldUser_ReadsAnyTaskOfTheTenant()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        var task = NewTask("Tarea de un tercero");
        task.AssignedEmployeeId = FieldEmployeeId;
        db.WorkTasks.Add(task);
        db.TaskEvidences.Add(NewEvidence(task.Id, "note", DateTime.UtcNow));
        await db.SaveChangesAsync();

        // Un planificador o un admin conserva el comportamiento previo (plan §11).
        var user = new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid(), new[] { "Tenant Admin" });
        var handler = new GetTaskEvidencesQueryHandler(db, WorkTaskTestHelper.CreateTaskAccess(db, user));

        var result = await handler.Handle(new GetTaskEvidencesQuery(task.Id), CancellationToken.None);

        Assert.Single(result);
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
            Id = TeamMateEmployeeId,
            TenantId = TenantId,
            FirstName = "Beto",
            LastName = "Técnico",
            Email = "beto@example.com",
            RoleCatalogItemId = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
        });

        db.Teams.Add(new Team
        {
            Id = TeamId,
            TenantId = TenantId,
            Name = "Cuadrilla noche",
        });

        db.TeamMembers.Add(new TeamMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            TeamId = TeamId,
            EmployeeId = FieldEmployeeId,
        });

        await db.SaveChangesAsync();
    }

    private static WorkTask NewTask(string title, Guid? id = null, Guid? tenantId = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        TenantId = tenantId ?? TenantId,
        Title = title,
        State = WorkTaskStates.Todo,
        TaskTypeCatalogItemId = Guid.NewGuid(),
        PriorityCatalogItemId = Guid.NewGuid(),
    };

    private static TaskEvidence NewEvidence(Guid taskId, string type, DateTime capturedAt) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        WorkTaskId = taskId,
        Type = type,
        CapturedByUserId = FieldUserId,
        CapturedAt = capturedAt,
    };
}

/// <summary>Claves de recursos de los 403 del rol de campo, compartidas por los tests.</summary>
internal static class FieldTaskAccessMessageKeys
{
    public const string TaskNotAssigned = "field_role_task_not_assigned";
    public const string CannotCancel = "field_role_cannot_cancel";
    public const string CannotReassign = "field_role_cannot_reassign";
}
