using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Application.Common.Cursors;
using AssetHub.Application.Sync;
using AssetHub.Application.Sync.Queries;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Paginación del delta sync (022 T055).
///
/// El caso que rompe una paginación ingenua es el empate: cientos de filas escritas en el
/// mismo milisegundo (una importación, un cambio masivo de estado). Con <c>OFFSET</c> la
/// segunda página saltea filas; sin desempate por <c>Id</c>, la frontera entre páginas es
/// inestable. El test siembra exactamente eso: 250 filas repartidas en 3 timestamps, con
/// un límite que corta en medio de un grupo.
/// </summary>
public class DeltaPaginationTests
{
    private const int Limit = 80;
    private const int Page1 = 100;
    private const int Page2 = 100;
    private const int Page3 = 50;

    [Fact]
    public async Task IdenticalTimestamps_ArePagedWithoutDuplicatesOrGaps()
    {
        await using var f = DeltaSyncTestHelper.Create();
        await SeedAsync(f);

        var seen = new HashSet<Guid>();
        var received = new List<Guid>();

        string? cursor = null;
        var pages = 0;

        while (true)
        {
            var page = await f.TaskChanges().Handle(
                new GetWorkTaskChangesQuery { Since = cursor, Limit = Limit },
                default);

            pages++;
            Assert.True(page.Items.Count <= Limit, "la página excedió el límite pedido");

            foreach (var item in page.Items)
            {
                Assert.True(seen.Add(item.Id), $"la fila {item.Id} viajó dos veces");
                received.Add(item.Id);
            }

            // Dentro de una página el orden es el del stream.
            for (var i = 1; i < page.Items.Count; i++)
            {
                Assert.True(
                    page.Items[i - 1].UpdatedAt < page.Items[i].UpdatedAt
                    || (page.Items[i - 1].UpdatedAt == page.Items[i].UpdatedAt
                        && page.Items[i - 1].Id != page.Items[i].Id),
                    "las filas no vienen ordenadas por (UpdatedAt, Id)");
            }

            if (!page.HasMore)
            {
                // Aun en la última página el cursor sirve para reanudar el próximo pull.
                Assert.NotNull(page.NextCursor);
                Assert.Equal(KeysetCursor.Encode(page.Items[^1].UpdatedAt, page.Items[^1].Id), page.NextCursor);
                break;
            }

            Assert.NotNull(page.NextCursor);
            cursor = page.NextCursor;
        }

        Assert.Equal(Page1 + Page2 + Page3, received.Count);
        Assert.Equal(received.Count, seen.Count);
        Assert.Equal(expected: 4, actual: pages);
    }

    [Fact]
    public async Task EveryTimestampGroupIsServedCompletely()
    {
        await using var f = DeltaSyncTestHelper.Create();
        await SeedAsync(f);

        var byTimestamp = new Dictionary<DateTime, int>();
        string? cursor = null;

        while (true)
        {
            var page = await f.TaskChanges().Handle(
                new GetWorkTaskChangesQuery { Since = cursor, Limit = 37 },
                default);

            foreach (var item in page.Items)
            {
                byTimestamp[item.UpdatedAt] = byTimestamp.GetValueOrDefault(item.UpdatedAt) + 1;
            }

            if (!page.HasMore)
            {
                break;
            }

            cursor = page.NextCursor;
        }

        Assert.Equal(3, byTimestamp.Count);
        Assert.Equal(Page1, byTimestamp[DeltaSyncTestHelper.Base]);
        Assert.Equal(Page2, byTimestamp[DeltaSyncTestHelper.Base.AddHours(1)]);
        Assert.Equal(Page3, byTimestamp[DeltaSyncTestHelper.Base.AddHours(2)]);
    }

    [Fact]
    public async Task EmptyStore_ReturnsAnEmptyPageWithoutCursor()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var page = await f.TaskChanges().Handle(new GetWorkTaskChangesQuery(), default);

        Assert.Empty(page.Items);
        Assert.False(page.HasMore);
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task InvalidCursor_IsRejectedWithInvalidCursor()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var error = await Assert.ThrowsAsync<DomainException>(() =>
            f.TaskChanges().Handle(new GetWorkTaskChangesQuery { Since = "basura" }, default));

        Assert.Equal("invalid_cursor", error.Code);
    }

    [Theory]
    [InlineData(null, 100)]
    [InlineData(1, 1)]
    [InlineData(200, 200)]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(5000, 200)]
    public void LimitIsClamped(int? requested, int expected)
    {
        Assert.Equal(expected, DeltaSync.NormalizeLimit(requested));
    }

    [Fact]
    public async Task AssignedToMe_ReturnsOwnAndTeamTasksOnly()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var userId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        var otherEmployeeId = Guid.NewGuid();
        var teamId = Guid.NewGuid();

        f.Db.Employees.Add(new Employee
        {
            Id = employeeId,
            TenantId = DeltaSyncTestHelper.TenantId,
            FirstName = "Ana",
            LastName = "Pérez",
            Email = "ana@example.com",
            RoleCatalogItemId = Guid.NewGuid(),
            UserId = userId,
        });

        f.Db.Teams.Add(new Team { Id = teamId, TenantId = DeltaSyncTestHelper.TenantId, Name = "Cuadrilla Norte" });
        f.Db.TeamMembers.Add(new TeamMember
        {
            Id = Guid.NewGuid(),
            TenantId = DeltaSyncTestHelper.TenantId,
            TeamId = teamId,
            EmployeeId = employeeId,
        });

        var mine = DeltaSyncTestHelper.NewTask("Mía", employeeId: employeeId);
        var team = DeltaSyncTestHelper.NewTask("Del equipo", teamId: teamId);
        var someoneElse = DeltaSyncTestHelper.NewTask("De otro", employeeId: otherEmployeeId);
        var unassigned = DeltaSyncTestHelper.NewTask("Sin asignar");

        f.Db.WorkTasks.AddRange(mine, team, someoneElse, unassigned);
        await f.SaveAsync();

        var page = await f.TaskChanges(userId).Handle(
            new GetWorkTaskChangesQuery { AssignedToMe = true },
            default);

        Assert.Equal(2, page.Items.Count);
        Assert.Contains(page.Items, i => i.Id == mine.Id);
        Assert.Contains(page.Items, i => i.Id == team.Id);
        Assert.DoesNotContain(page.Items, i => i.Id == someoneElse.Id);
        Assert.DoesNotContain(page.Items, i => i.Id == unassigned.Id);
    }

    [Fact]
    public async Task AssignedToMe_WithoutAnEmployeeRecord_ReturnsNothing()
    {
        await using var f = DeltaSyncTestHelper.Create();

        f.Db.WorkTasks.Add(DeltaSyncTestHelper.NewTask("Sin dueño"));
        await f.SaveAsync();

        var page = await f.TaskChanges(Guid.NewGuid()).Handle(
            new GetWorkTaskChangesQuery { AssignedToMe = true },
            default);

        // Devolver el tenant completo ante un usuario sin ficha sería una fuga de datos
        // disfrazada de "no encontré el filtro".
        Assert.Empty(page.Items);
    }

    private static async Task SeedAsync(DeltaSyncTestHelper.Fixture f)
    {
        var batches = new (DateTime At, int Count)[]
        {
            (DeltaSyncTestHelper.Base, Page1),
            (DeltaSyncTestHelper.Base.AddHours(1), Page2),
            (DeltaSyncTestHelper.Base.AddHours(2), Page3),
        };

        foreach (var (at, count) in batches)
        {
            f.Now = at;

            for (var i = 0; i < count; i++)
            {
                f.Db.WorkTasks.Add(DeltaSyncTestHelper.NewTask($"Tarea {at:HH}-{i}"));
            }

            await f.SaveAsync();
        }

        Assert.Equal(Page1 + Page2 + Page3, await f.Db.WorkTasks.CountAsync());
    }
}
