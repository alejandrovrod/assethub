using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Field;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Security;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// 022 T076 — restricciones del rol de campo, caso por caso.
///
/// Cada regla negativa va acompañada de su control positivo (mismo escenario, otro rol o
/// misma tarea propia): sin eso, un 403 podría deberse a un handler roto y el test pasaría
/// igual. Ese es el error clásico al testear autorización.
/// </summary>
public class FieldRoleTests
{
    private static readonly Guid TenantId = Guid.Parse("c2000000-0000-0000-0000-000000000001");
    private static readonly Guid FieldUserId = Guid.Parse("c2000000-0000-0000-0000-00000000aa01");
    private static readonly Guid FieldEmployeeId = Guid.Parse("c2000000-0000-0000-0000-00000000ee01");
    private static readonly Guid OtherEmployeeId = Guid.Parse("c2000000-0000-0000-0000-00000000ee02");

    // ---------------------------------------------------------------------
    // Transición de estado
    // ---------------------------------------------------------------------

    [Fact]
    public async Task FieldTechnician_CannotCancel_EvenAnOwnTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var employeeId = await SeedFieldEmployeeAsync(db);

        var task = NewTask(WorkTaskStates.InProgress, employeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            StateHandler(db, FieldUser()).Handle(
                new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = WorkTaskStates.Cancelled },
                CancellationToken.None));

        Assert.Equal(FieldTaskAccess.CannotCancelKey, ex.Message);
        Assert.Equal(WorkTaskStates.InProgress, task.State);
    }

    [Fact]
    public async Task FieldTechnician_OnForeignTask_IsForbidden_BeforeTheEtagCheck()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);

        var task = NewTask(WorkTaskStates.InProgress, OtherEmployeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var command = new ChangeWorkTaskStateCommand
        {
            WorkTaskId = task.Id,
            NewState = WorkTaskStates.Done,
            // Un ETag viejo a propósito: si el handler comparara antes de autorizar,
            // devolvería 412 y filtraría que la tarea existe y cambió.
            ExpectedRowVersion = new byte[] { 9, 9, 9, 9, 9, 9, 9, 9 },
        };

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            StateHandler(db, FieldUser()).Handle(command, CancellationToken.None));

        Assert.Equal(FieldTaskAccess.TaskNotAssignedKey, ex.Message);
    }

    [Fact]
    public async Task FieldTechnician_CanComplete_AnOwnTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var employeeId = await SeedFieldEmployeeAsync(db);

        var task = NewTask(WorkTaskStates.InProgress, employeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        await StateHandler(db, FieldUser()).Handle(
            new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = WorkTaskStates.Done },
            CancellationToken.None);

        Assert.Equal(WorkTaskStates.Done, task.State);
        Assert.NotNull(task.CompletedAt);
    }

    [Fact]
    public async Task NonFieldUser_CanStillCancel()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        // Sin ficha de empleado y sin rol de campo: es el camino que usa apps/web hoy.
        var task = NewTask(WorkTaskStates.Todo, employeeId: null);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        await StateHandler(db, new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid())).Handle(
            new ChangeWorkTaskStateCommand { WorkTaskId = task.Id, NewState = WorkTaskStates.Cancelled },
            CancellationToken.None);

        Assert.Equal(WorkTaskStates.Cancelled, task.State);
    }

    // ---------------------------------------------------------------------
    // Asignación
    // ---------------------------------------------------------------------

    [Fact]
    public async Task FieldTechnician_CannotReassign()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var employeeId = await SeedFieldEmployeeAsync(db);

        var task = NewTask(WorkTaskStates.Todo, employeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new AssignWorkTaskCommandHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            WorkTaskTestHelper.CreateTaskAccess(db, FieldUser()));

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            handler.Handle(
                new AssignWorkTaskCommand { WorkTaskId = task.Id, AssignedEmployeeId = OtherEmployeeId },
                CancellationToken.None));

        Assert.Equal(FieldTaskAccess.CannotReassignKey, ex.Message);
        Assert.Equal(employeeId, task.AssignedEmployeeId);
    }

    [Fact]
    public async Task NonFieldUser_CanReassign()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var employeeId = await SeedFieldEmployeeAsync(db);

        var task = NewTask(WorkTaskStates.Todo, employeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var user = new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid());
        var handler = new AssignWorkTaskCommandHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            WorkTaskTestHelper.CreateTaskAccess(db, user));

        await handler.Handle(
            new AssignWorkTaskCommand { WorkTaskId = task.Id, AssignedEmployeeId = OtherEmployeeId },
            CancellationToken.None);

        Assert.Equal(OtherEmployeeId, task.AssignedEmployeeId);
    }

    // ---------------------------------------------------------------------
    // Consumo de materiales
    // ---------------------------------------------------------------------

    [Fact]
    public async Task FieldTechnician_CannotConsume_OnAForeignTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);
        var stock = await SeedStockAsync(db);

        var task = NewTask(WorkTaskStates.InProgress, OtherEmployeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var user = FieldUser();
        var handler = ConsumeHandler(db, user);

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            handler.Handle(NewConsumeCommand(task.Id, stock), CancellationToken.None));

        Assert.Equal(FieldTaskAccess.TaskNotAssignedKey, ex.Message);

        var quantityOnHand = await db.StockBalances
            .AsNoTracking()
            .Where(s => s.Id == stock.BalanceId)
            .Select(s => s.QuantityOnHand)
            .SingleAsync();

        Assert.Equal(10m, quantityOnHand);
    }

    [Fact]
    public async Task FieldTechnician_CanConsume_OnAnOwnTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var employeeId = await SeedFieldEmployeeAsync(db);
        var stock = await SeedStockAsync(db);

        var task = NewTask(WorkTaskStates.InProgress, employeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var user = FieldUser();
        var result = await ConsumeHandler(db, user).Handle(
            NewConsumeCommand(task.Id, stock),
            CancellationToken.None);

        Assert.False(result.WasReplay);
        Assert.Equal(8m, result.QuantityOnHand);
    }

    // ---------------------------------------------------------------------
    // Evidencias
    // ---------------------------------------------------------------------

    [Fact]
    public async Task FieldTechnician_CannotAttachEvidence_ToAForeignTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        await SeedFieldEmployeeAsync(db);

        var task = NewTask(WorkTaskStates.InProgress, OtherEmployeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var user = FieldUser();
        var handler = new AddTaskEvidenceCommandHandler(
            db,
            user,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            WorkTaskTestHelper.CreateTaskAccess(db, user));

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            handler.Handle(
                new AddTaskEvidenceCommand { WorkTaskId = task.Id, Type = "note", Note = "no debería entrar" },
                CancellationToken.None));
    }

    [Fact]
    public async Task FieldTechnician_CanAttachEvidence_ToAnOwnTask()
    {
        await using var db = WorkTaskTestHelper.CreateDbContext(TenantId);
        var employeeId = await SeedFieldEmployeeAsync(db);

        var task = NewTask(WorkTaskStates.InProgress, employeeId);
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var user = FieldUser();
        var handler = new AddTaskEvidenceCommandHandler(
            db,
            user,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            WorkTaskTestHelper.CreateTaskAccess(db, user));

        var id = await handler.Handle(
            new AddTaskEvidenceCommand { WorkTaskId = task.Id, Type = "note", Note = "filtro cambiado" },
            CancellationToken.None);

        Assert.NotEqual(Guid.Empty, id);
    }

    // ---------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------

    private static WorkTaskTestHelper.FakeCurrentUser FieldUser()
        => new(FieldUserId, new[] { FieldTechnicianRole.Name });

    private static ChangeWorkTaskStateCommandHandler StateHandler(TenantDbContext db, WorkTaskTestHelper.FakeCurrentUser user)
        => new(db, user, new WorkTaskTestHelper.FakeTenantResolver(TenantId), new WorkTaskTestHelper.FakeMediator(),
            WorkTaskTestHelper.CreateTaskAccess(db, user));

    private static ConsumeStockCommandHandler ConsumeHandler(TenantDbContext db, WorkTaskTestHelper.FakeCurrentUser user)
    {
        var resolver = new WorkTaskTestHelper.FakeTenantResolver(TenantId);
        return new ConsumeStockCommandHandler(
            db,
            new InventoryPostingService(db, resolver, user),
            resolver,
            new WorkTaskTestHelper.FakeMediator(),
            WorkTaskTestHelper.CreateTaskAccess(db, user));
    }

    private static ConsumeStockCommand NewConsumeCommand(Guid taskId, StockSeed stock) => new()
    {
        WarehouseId = stock.WarehouseId,
        CatalogItemId = stock.CatalogItemId,
        WorkTaskId = taskId,
        Quantity = 2,
        Reason = "Reemplazo de filtro",
        IdempotencyKey = Guid.NewGuid().ToString(),
    };

    private readonly record struct StockSeed(Guid WarehouseId, Guid CatalogItemId, Guid BalanceId);

    private static async Task<StockSeed> SeedStockAsync(TenantDbContext db)
    {
        var warehouse = new Warehouse
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Name = "Depósito",
            Code = "WH-1",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        var item = new CatalogItem
        {
            Id = Guid.NewGuid(),
            CatalogId = Guid.NewGuid(),
            TenantId = TenantId,
            Code = "FILTER-1",
        };

        var balance = new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            WarehouseId = warehouse.Id,
            CatalogItemId = item.Id,
            QuantityOnHand = 10m,
            AverageUnitCost = 10m,
            UpdatedAt = DateTime.UtcNow,
            RowVersion = new byte[] { 1, 1, 1, 1, 1, 1, 1, 1 },
        };

        db.Warehouses.Add(warehouse);
        db.CatalogItems.Add(item);
        db.StockBalances.Add(balance);
        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Enabled = true,
            OperatingMode = InventoryOperatingMode.Internal,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync();

        return new StockSeed(warehouse.Id, item.Id, balance.Id);
    }

    private static async Task<Guid> SeedFieldEmployeeAsync(TenantDbContext db)
    {
        db.Employees.AddRange(
            new Employee
            {
                Id = FieldEmployeeId,
                TenantId = TenantId,
                FirstName = "Ana",
                LastName = "Técnica",
                Email = "ana@example.com",
                RoleCatalogItemId = Guid.NewGuid(),
                UserId = FieldUserId,
            },
            new Employee
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
        return FieldEmployeeId;
    }

    private static WorkTask NewTask(string state, Guid? employeeId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        Title = "Cambiar filtro",
        State = state,
        AssignedEmployeeId = employeeId,
        TaskTypeCatalogItemId = Guid.NewGuid(),
        PriorityCatalogItemId = Guid.NewGuid(),
    };
}
