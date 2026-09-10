using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Maintenance.Queries;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Maintenance;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.MaintenanceOrders;

/// <summary>
/// Tests for GetMaintenanceOrdersQuery ordering — most recent CreatedAt first,
/// consistent across pages.
/// </summary>
public class GetMaintenanceOrdersOrderingTests
{
    private static Asset CreateAsset(Guid tenantId, Guid assetId)
    {
        return new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-001",
            Name = "Test Asset",
            Path = "/",
            State = "Activo"
        };
    }

    private static MaintenanceOrder CreateOrder(Guid tenantId, Guid assetId, DateTime createdAt, string title)
    {
        return new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Draft,
            Title = title,
            CreatedAt = createdAt
        };
    }

    [Fact]
    public async Task GetOrders_OrdersByMostRecentFirst()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        db.Assets.Add(CreateAsset(tenantId, assetId));
        db.MaintenanceOrders.AddRange(
            CreateOrder(tenantId, assetId, new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc), "Oldest"),
            CreateOrder(tenantId, assetId, new DateTime(2026, 9, 5, 18, 30, 0, DateTimeKind.Utc), "Newest"),
            CreateOrder(tenantId, assetId, new DateTime(2026, 8, 20, 12, 0, 0, DateTimeKind.Utc), "Middle"));
        await db.SaveChangesAsync();

        var handler = new GetMaintenanceOrdersQueryHandler(db);

        var result = await handler.Handle(new GetMaintenanceOrdersQuery(), CancellationToken.None);

        Assert.Equal(3, result.Items.Count);
        Assert.Equal("Newest", result.Items[0].Title);
        Assert.Equal("Middle", result.Items[1].Title);
        Assert.Equal("Oldest", result.Items[2].Title);
    }

    [Fact]
    public async Task GetOrders_PaginationKeepsOrderingAcrossPages()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var db = MaintenanceOrderTestHelper.CreateDbContext(tenantId);

        db.Assets.Add(CreateAsset(tenantId, assetId));
        for (var i = 1; i <= 5; i++)
        {
            db.MaintenanceOrders.Add(CreateOrder(
                tenantId, assetId,
                new DateTime(2026, 9, i, 10, 0, 0, DateTimeKind.Utc),
                $"Order {i}"));
        }
        await db.SaveChangesAsync();

        var handler = new GetMaintenanceOrdersQueryHandler(db);

        var page1 = await handler.Handle(new GetMaintenanceOrdersQuery { Page = 1, PageSize = 2 }, CancellationToken.None);
        var page2 = await handler.Handle(new GetMaintenanceOrdersQuery { Page = 2, PageSize = 2 }, CancellationToken.None);
        var page3 = await handler.Handle(new GetMaintenanceOrdersQuery { Page = 3, PageSize = 2 }, CancellationToken.None);

        Assert.Equal(new[] { "Order 5", "Order 4" }, page1.Items.Select(i => i.Title).ToArray());
        Assert.Equal(new[] { "Order 3", "Order 2" }, page2.Items.Select(i => i.Title).ToArray());
        Assert.Equal(new[] { "Order 1" }, page3.Items.Select(i => i.Title).ToArray());
        Assert.All(page1.Items.Concat(page2.Items).Concat(page3.Items), item => Assert.True(item.CreatedAt > DateTime.MinValue));
    }
}
