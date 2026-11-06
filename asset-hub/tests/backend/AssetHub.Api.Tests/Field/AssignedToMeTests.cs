using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Incidents.Queries;
using AssetHub.Application.Maintenance.Queries;
using AssetHub.Application.Sync.Queries;
using AssetHub.Application.Tasks.Queries;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// `assignedToMe` resolves the executor from <c>PropertiesJson</c> (asignar_a / asignado_a),
/// never from the follow-up keys. A technician must not receive work they only watch, and a
/// user without a staff record must receive nothing at all.
/// </summary>
public class AssignedToMeTests
{
    private static readonly Guid TenantId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid UserId = Guid.Parse("a0000000-0000-0000-0000-0000000000aa");
    private static readonly Guid EmployeeId = Guid.Parse("a0000000-0000-0000-0000-0000000000ee");
    private static readonly Guid OtherEmployeeId = Guid.Parse("a0000000-0000-0000-0000-0000000000ff");

    private static string Executor(Guid employeeId) => JsonSerializer.Serialize(new { asignar_a = employeeId });
    private static string Follower(Guid employeeId) => JsonSerializer.Serialize(new { reportar_a = employeeId });

    private static Asset NewAsset() => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        AssetTemplateId = Guid.NewGuid(),
        Code = "A-001",
        Name = "Activo",
        Path = "/",
        State = "Activo",
    };

    private static Incident NewIncident(string title, Guid assetId, string? propertiesJson) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        AssetId = assetId,
        Title = title,
        TypeId = Guid.NewGuid(),
        State = IncidentStates.Reported,
        ReportedAt = new DateTime(2026, 1, 1, 8, 0, 0, DateTimeKind.Utc),
        PropertiesJson = propertiesJson ?? "{}",
    };

    private static WorkTask NewTask(string title, string? propertiesJson, Guid? assignedEmployeeId = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        Title = title,
        State = WorkTaskStates.Todo,
        TaskTypeCatalogItemId = Guid.NewGuid(),
        PriorityCatalogItemId = Guid.NewGuid(),
        AssignedEmployeeId = assignedEmployeeId,
        PropertiesJson = propertiesJson ?? "{}",
    };

    private static MaintenanceOrder NewOrder(string title, Guid assetId, string? propertiesJson, Guid? assignedEmployeeId = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = TenantId,
        AssetId = assetId,
        Kind = MaintenanceOrderKinds.Corrective,
        State = MaintenanceOrderStates.Draft,
        Title = title,
        PropertiesJson = propertiesJson ?? "{}",
        AssignedEmployeeId = assignedEmployeeId,
    };

    private static async Task<TenantDbContext> CreateDbAsync(bool withEmployee = true)
    {
        var db = WorkTaskTestHelper.CreateDbContext(TenantId);

        if (withEmployee)
        {
            db.Employees.Add(new Employee
            {
                Id = EmployeeId,
                TenantId = TenantId,
                FirstName = "Tecnico",
                LastName = "De Campo",
                Email = "tecnico@example.com",
                RoleCatalogItemId = Guid.NewGuid(),
                UserId = UserId,
            });
            await db.SaveChangesAsync();
        }

        return db;
    }

    // ── Incidents ───────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Incidents_AssignedToMe_KeepsOnlyTheExecutor()
    {
        await using var db = await CreateDbAsync();

        var asset = NewAsset();
        db.Assets.Add(asset);
        db.Incidents.AddRange(
            NewIncident("mine", asset.Id, Executor(EmployeeId)),
            NewIncident("follower", asset.Id, Follower(EmployeeId)),
            NewIncident("someone-else", asset.Id, Executor(OtherEmployeeId)));
        await db.SaveChangesAsync();

        var handler = new SearchIncidentsQueryHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeCurrentUser(UserId));

        var result = await handler.Handle(
            new SearchIncidentsQuery(null, null, AssignedToMe: true),
            CancellationToken.None);

        Assert.Equal(["mine"], result.Items.Select(i => i.Title).ToArray());
        Assert.Equal(1, result.TotalCount);
    }

    [Fact]
    public async Task Incidents_AssignedToMe_IncludesIncidentWithAssignedOrder()
    {
        await using var db = await CreateDbAsync();

        var asset = NewAsset();
        db.Assets.Add(asset);

        var viaOrder = NewIncident("via-order", asset.Id, propertiesJson: null);
        db.Incidents.Add(viaOrder);
        await db.SaveChangesAsync();

        var order = NewOrder("corrective", asset.Id, propertiesJson: null, assignedEmployeeId: EmployeeId);
        order.IncidentId = viaOrder.Id;
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        var handler = new SearchIncidentsQueryHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeCurrentUser(UserId));

        var result = await handler.Handle(
            new SearchIncidentsQuery(null, null, AssignedToMe: true),
            CancellationToken.None);

        Assert.Equal(["via-order"], result.Items.Select(i => i.Title).ToArray());
    }

    [Fact]
    public async Task Incidents_AssignedToMe_WithoutEmployeeRecord_ReturnsEmpty()
    {
        await using var db = await CreateDbAsync(withEmployee: false);

        var asset = NewAsset();
        db.Assets.Add(asset);
        db.Incidents.Add(NewIncident("mine", asset.Id, Executor(EmployeeId)));
        await db.SaveChangesAsync();

        var handler = new SearchIncidentsQueryHandler(
            db,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId),
            new WorkTaskTestHelper.FakeCurrentUser(UserId));

        var result = await handler.Handle(
            new SearchIncidentsQuery(null, null, AssignedToMe: true),
            CancellationToken.None);

        Assert.Empty(result.Items);
        Assert.Equal(0, result.TotalCount);
    }

    // ── Maintenance orders ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Orders_AssignedToMe_ChecksColumnAndProperties()
    {
        await using var db = await CreateDbAsync();

        var asset = NewAsset();
        db.Assets.Add(asset);

        db.MaintenanceOrders.AddRange(
            NewOrder("by-column", asset.Id, propertiesJson: null, assignedEmployeeId: EmployeeId),
            NewOrder("by-property", asset.Id, Executor(EmployeeId)),
            NewOrder("follower", asset.Id, Follower(EmployeeId)),
            NewOrder("someone-else", asset.Id, Executor(OtherEmployeeId)));
        await db.SaveChangesAsync();

        var handler = new GetMaintenanceOrdersQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(UserId));

        var result = await handler.Handle(
            new GetMaintenanceOrdersQuery { AssignedToMe = true },
            CancellationToken.None);

        Assert.Equal(
            ["by-column", "by-property"],
            result.Items.Select(o => o.Title).OrderBy(t => t).ToArray());
        Assert.Equal(2, result.TotalCount);
    }

    // ── Work tasks ──────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Tasks_AssignedToMe_ChecksColumnAndProperties()
    {
        await using var db = await CreateDbAsync();

        db.WorkTasks.AddRange(
            NewTask("by-column", propertiesJson: null, assignedEmployeeId: EmployeeId),
            NewTask("by-property", Executor(EmployeeId)),
            NewTask("follower", Follower(EmployeeId)),
            NewTask("someone-else", Executor(OtherEmployeeId)));
        await db.SaveChangesAsync();

        var handler = new GetWorkTasksQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(UserId));

        var result = await handler.Handle(
            new GetWorkTasksQuery { AssignedToMe = true },
            CancellationToken.None);

        Assert.Equal(
            ["by-column", "by-property"],
            result.Items.Select(t => t.Title).OrderBy(t => t).ToArray());
        Assert.Equal(2, result.TotalCount);
    }

    [Fact]
    public async Task Tasks_AssignedToMe_WithoutEmployeeRecord_ReturnsEmpty()
    {
        await using var db = await CreateDbAsync(withEmployee: false);

        db.WorkTasks.Add(NewTask("by-column", propertiesJson: null, assignedEmployeeId: EmployeeId));
        await db.SaveChangesAsync();

        var handler = new GetWorkTasksQueryHandler(db, new WorkTaskTestHelper.FakeCurrentUser(UserId));

        var result = await handler.Handle(
            new GetWorkTasksQuery { AssignedToMe = true },
            CancellationToken.None);

        Assert.Empty(result.Items);
    }

    // ── Delta sync ──────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task IncidentChanges_AssignedToMe_SkipsForeignRows()
    {
        await using var fixture = DeltaSyncTestHelper.Create();

        fixture.Db.Employees.Add(new Employee
        {
            Id = EmployeeId,
            TenantId = DeltaSyncTestHelper.TenantId,
            FirstName = "Tecnico",
            LastName = "De Campo",
            Email = "tecnico@example.com",
            RoleCatalogItemId = Guid.NewGuid(),
            UserId = UserId,
        });

        var mine = DeltaSyncTestHelper.NewIncident("mine");
        mine.PropertiesJson = Executor(EmployeeId);
        var foreign = DeltaSyncTestHelper.NewIncident("foreign");
        foreign.PropertiesJson = Follower(EmployeeId);

        fixture.Db.Incidents.AddRange(mine, foreign);
        await fixture.SaveAsync();

        var page = await fixture.IncidentChanges(UserId).Handle(
            new GetIncidentChangesQuery { AssignedToMe = true, Limit = 100 },
            CancellationToken.None);

        Assert.Equal([mine.Id], page.Items.Select(i => i.Id).ToArray());
        Assert.False(page.HasMore);
    }

    [Fact]
    public async Task IncidentChanges_AssignedToMe_AdvancesCursorOverForeignPage()
    {
        await using var fixture = DeltaSyncTestHelper.Create();

        fixture.Db.Employees.Add(new Employee
        {
            Id = EmployeeId,
            TenantId = DeltaSyncTestHelper.TenantId,
            FirstName = "Tecnico",
            LastName = "De Campo",
            Email = "tecnico@example.com",
            RoleCatalogItemId = Guid.NewGuid(),
            UserId = UserId,
        });

        var first = DeltaSyncTestHelper.NewIncident("foreign-1");
        first.PropertiesJson = Follower(EmployeeId);
        fixture.Db.Incidents.Add(first);
        await fixture.SaveAsync();

        fixture.Now = DeltaSyncTestHelper.Base.AddMinutes(1);
        var second = DeltaSyncTestHelper.NewIncident("foreign-2");
        second.PropertiesJson = Follower(EmployeeId);
        fixture.Db.Incidents.Add(second);
        await fixture.SaveAsync();

        var page = await fixture.IncidentChanges(UserId).Handle(
            new GetIncidentChangesQuery { AssignedToMe = true, Limit = 1 },
            CancellationToken.None);

        // La página quedó vacía, pero el cursor tiene que avanzar igual: si se quedara en
        // null el cliente re-escanearía la misma fila para siempre.
        Assert.Empty(page.Items);
        Assert.True(page.HasMore);
        Assert.NotNull(page.NextCursor);
    }
}
