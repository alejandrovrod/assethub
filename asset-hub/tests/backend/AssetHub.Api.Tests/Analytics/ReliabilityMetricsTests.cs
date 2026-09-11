using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.MaintenanceOrders;
using AssetHub.Application.Analytics.Queries;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

namespace AssetHub.Api.Tests.Analytics;

/// <summary>
/// Reliability metrics tests: MTBF (SCN-R-001), date coalescence (DEC-001, DEC-002),
/// preventive exclusion, and global vs asset scope.
/// </summary>
public class ReliabilityMetricsTests
{
    private static TenantDbHarness CreateHarness(Guid tenantId)
    {
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<AssetHub.Infrastructure.Persistence.TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new AssetHub.Infrastructure.Persistence.TenantDbContext(options, resolver);
        return new TenantDbHarness(db, resolver);
    }

    private static GetAssetReliabilityMetricsQueryHandler CreateHandler(
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        MaintenanceOrderTestHelper.FakeTenantResolver resolver)
        => new(db, resolver, new MemoryCache(new MemoryCacheOptions()));

    private static MaintenanceOrder CorrectiveOrder(
        Guid tenantId,
        Guid assetId,
        DateTime? failureOccurredAt = null,
        DateTime? repairStartedAt = null,
        DateTime? scheduledStart = null,
        DateTime? scheduledEnd = null,
        DateTime? completedAt = null,
        Guid? incidentId = null,
        bool isDeleted = false)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Verified,
            AssetId = assetId,
            FailureOccurredAt = failureOccurredAt,
            RepairStartedAt = repairStartedAt,
            ScheduledStart = scheduledStart,
            ScheduledEnd = scheduledEnd,
            CompletedAt = completedAt,
            IncidentId = incidentId,
            IsDeleted = isDeleted
        };

    [Fact]
    public async Task Mtbf_TwoCorrectiveOrders50HoursApart_Returns50()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate,
            repairStartedAt: baseDate.AddHours(2),
            completedAt: baseDate.AddHours(6)));
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate.AddHours(50),
            repairStartedAt: baseDate.AddHours(52),
            completedAt: baseDate.AddHours(56)));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = assetId }, CancellationToken.None);

        Assert.Equal(50m, result.MtbfHours);
        Assert.Equal(2, result.CorrectiveOrderCount);
        Assert.Equal("asset", result.Scope);
    }

    [Fact]
    public async Task Mtbf_ExcludesPreventiveOrders()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate,
            completedAt: baseDate.AddHours(5)));
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate.AddHours(100),
            completedAt: baseDate.AddHours(105)));
        // Preventive orders must not count as failures.
        db.MaintenanceOrders.Add(new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = MaintenanceOrderKinds.Preventive,
            State = MaintenanceOrderStates.Verified,
            AssetId = assetId,
            FailureOccurredAt = baseDate.AddHours(10), // Even with a physical failure date set
            CompletedAt = baseDate.AddHours(12)
        });
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = assetId }, CancellationToken.None);

        Assert.Equal(2, result.CorrectiveOrderCount);
        Assert.Equal(100m, result.MtbfHours);
    }

    [Fact]
    public async Task FailureStart_Dec001_FallsBackToIncidentReportedAt()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        var incidentId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        db.Incidents.Add(new Incident
        {
            Id = incidentId,
            TenantId = tenantId,
            AssetId = assetId,
            Title = "Failure A",
            ReportedAt = baseDate
        });
        // No FailureOccurredAt: DEC-001 resolves to Incident.ReportedAt.
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            completedAt: baseDate.AddHours(4),
            incidentId: incidentId));
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate.AddHours(50),
            completedAt: baseDate.AddHours(54)));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = assetId }, CancellationToken.None);

        Assert.Equal(50m, result.MtbfHours);
    }

    [Fact]
    public async Task MttrRestore_UsesFailureStart_AndMttrRepair_UsesRepairStart()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        // failure at 0, repair starts at 10h, completed at 20h
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate,
            repairStartedAt: baseDate.AddHours(10),
            completedAt: baseDate.AddHours(20)));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = assetId }, CancellationToken.None);

        Assert.Equal(20m, result.MttrRestoreHours); // failure -> completed
        Assert.Equal(10m, result.MttrRepairHours);  // repair start -> completed
    }

    [Fact]
    public async Task RepairStart_Dec002_FallsBackToScheduledStart()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        // No RepairStartedAt: DEC-002 resolves to ScheduledStart.
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate,
            scheduledStart: baseDate.AddHours(3),
            scheduledEnd: baseDate.AddHours(8),
            completedAt: baseDate.AddHours(8)));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = assetId }, CancellationToken.None);

        Assert.Equal(8m, result.MttrRestoreHours);
        Assert.Equal(5m, result.MttrRepairHours);
    }

    [Fact]
    public async Task GlobalScope_CoversWholeTenant()
    {
        var tenantId = Guid.NewGuid();
        var assetA = Guid.NewGuid();
        var assetB = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetA,
            failureOccurredAt: baseDate, completedAt: baseDate.AddHours(5)));
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetB,
            failureOccurredAt: baseDate.AddHours(40), completedAt: baseDate.AddHours(45)));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = null }, CancellationToken.None);

        Assert.Equal("global", result.Scope);
        Assert.Equal(40m, result.MtbfHours);
    }

    [Fact]
    public async Task SoftDeletedOrders_AreExcluded()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var baseDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate, completedAt: baseDate.AddHours(5)));
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate.AddHours(60),
            completedAt: baseDate.AddHours(65),
            isDeleted: true));
        db.MaintenanceOrders.Add(CorrectiveOrder(tenantId, assetId,
            failureOccurredAt: baseDate.AddHours(120), completedAt: baseDate.AddHours(125)));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = assetId }, CancellationToken.None);

        Assert.Equal(2, result.CorrectiveOrderCount);
        Assert.Equal(120m, result.MtbfHours);
    }

    [Fact]
    public async Task NoData_ReturnsMessageInsteadOfZero()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetReliabilityMetricsQuery { AssetId = assetId }, CancellationToken.None);

        Assert.Equal(0, result.CorrectiveOrderCount);
        Assert.Null(result.MtbfHours);
        Assert.NotNull(result.MtbfMessage);
    }

    private sealed class TenantDbHarness : IAsyncDisposable
    {
        public TenantDbHarness(AssetHub.Infrastructure.Persistence.TenantDbContext db, MaintenanceOrderTestHelper.FakeTenantResolver resolver)
        {
            Db = db;
            Resolver = resolver;
        }

        public AssetHub.Infrastructure.Persistence.TenantDbContext Db { get; }
        public MaintenanceOrderTestHelper.FakeTenantResolver Resolver { get; }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
