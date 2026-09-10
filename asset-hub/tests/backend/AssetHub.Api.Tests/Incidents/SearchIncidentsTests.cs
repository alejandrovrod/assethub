using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Incidents.Queries;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Incidents;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Incidents;

/// <summary>
/// Tests for SearchIncidentsQuery â€” verifies that each incident's own
/// ReportedAt is returned instead of a request-time timestamp.
/// </summary>
public class SearchIncidentsTests
{
    private sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    private static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var resolver = new FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }

    private static Asset CreateAsset(Guid tenantId)
    {
        return new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "A-001",
            Name = "Test Asset",
            Path = "/",
            State = "Activo"
        };
    }

    private static Incident CreateIncident(Guid tenantId, Guid assetId, DateTime reportedAt)
    {
        return new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            Title = "Incident",
            TypeId = Guid.NewGuid(),
            State = IncidentStates.Reported,
            ReportedAt = reportedAt
        };
    }

    [Fact]
    public async Task Search_ReturnsIndividualReportedAt_PerIncident()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDbContext(tenantId);

        var asset = CreateAsset(tenantId);
        var older = CreateIncident(tenantId, asset.Id, new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc));
        var newer = CreateIncident(tenantId, asset.Id, new DateTime(2026, 9, 5, 18, 30, 0, DateTimeKind.Utc));
        db.Assets.Add(asset);
        db.Incidents.AddRange(older, newer);
        await db.SaveChangesAsync();

        var handler = new SearchIncidentsQueryHandler(db, new FakeTenantResolver(tenantId));

        var result = await handler.Handle(new SearchIncidentsQuery(null, null), CancellationToken.None);

        Assert.Equal(2, result.Items.Count);
        Assert.All(result.Items, item => Assert.NotEqual(default, item.ReportedAt));
        Assert.Contains(result.Items, i => i.Id == older.Id && i.ReportedAt == older.ReportedAt);
        Assert.Contains(result.Items, i => i.Id == newer.Id && i.ReportedAt == newer.ReportedAt);
    }

    [Fact]
    public async Task Search_OrdersByMostRecentFirst()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDbContext(tenantId);

        var asset = CreateAsset(tenantId);
        var older = CreateIncident(tenantId, asset.Id, new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc));
        var newer = CreateIncident(tenantId, asset.Id, new DateTime(2026, 9, 5, 18, 30, 0, DateTimeKind.Utc));
        db.Assets.Add(asset);
        db.Incidents.AddRange(older, newer);
        await db.SaveChangesAsync();

        var handler = new SearchIncidentsQueryHandler(db, new FakeTenantResolver(tenantId));

        var result = await handler.Handle(new SearchIncidentsQuery(null, null), CancellationToken.None);

        Assert.Equal(newer.Id, result.Items.First().Id);
        Assert.Equal(older.Id, result.Items.Last().Id);
    }
}
