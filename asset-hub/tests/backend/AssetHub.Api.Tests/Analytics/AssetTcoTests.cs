using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.MaintenanceOrders;
using AssetHub.Application.Analytics.Queries;
using AssetHub.Domain.Analytics;
using AssetHub.Domain.Assets;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

namespace AssetHub.Api.Tests.Analytics;

/// <summary>
/// TCO tests: CostEntry sum, annualization thresholds (30/364 days), subtree mode,
/// and tenant isolation (SCN-R-002).
/// </summary>
public class AssetTcoTests
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

    private static GetAssetTcoQueryHandler CreateHandler(
        AssetHub.Infrastructure.Persistence.TenantDbContext db,
        MaintenanceOrderTestHelper.FakeTenantResolver resolver)
        => new(db, resolver, new MemoryCache(new MemoryCacheOptions()));

    private static Asset CreateAsset(Guid tenantId, Guid id, DateTime createdAt)
        => new()
        {
            Id = id,
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "AST-" + id.ToString()[..8],
            Name = "Asset " + id,
            State = "operational",
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };

    private static CostEntry Cost(Guid tenantId, Guid? assetId, string type, decimal amount, bool isDeleted = false)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            CostType = type,
            Amount = amount,
            OccurredAt = DateTime.UtcNow,
            IsDeleted = isDeleted
        };

    [Fact]
    public async Task Tco_SumsCostEntries_ByType()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        db.Assets.Add(CreateAsset(tenantId, assetId, DateTime.UtcNow.AddDays(-400)));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Labor, 100m));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Parts, 200m));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Downtime, 50m));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetTcoQuery { AssetId = assetId }, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(350m, result!.TotalCost);
        Assert.Equal(100m, result.CostByType[CostTypes.Labor]);
        Assert.Equal(200m, result.CostByType[CostTypes.Parts]);
        Assert.Equal(50m, result.CostByType[CostTypes.Downtime]);
        Assert.Equal(3, result.EntryCount);
    }

    [Fact]
    public async Task Tco_YoungerThan30Days_ReportsInsufficientData()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        db.Assets.Add(CreateAsset(tenantId, assetId, DateTime.UtcNow.AddDays(-10)));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Labor, 100m));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetTcoQuery { AssetId = assetId }, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("insufficient_data", result!.AnnualizationStatus);
        Assert.Null(result.AnnualizedCost);
        Assert.NotNull(result.AnnualizationMessage);
    }

    [Fact]
    public async Task Tco_Between30And364Days_ProjectsAnnualized()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        var ageDays = 100;
        db.Assets.Add(CreateAsset(tenantId, assetId, DateTime.UtcNow.AddDays(-ageDays)));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Labor, 1000m));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetTcoQuery { AssetId = assetId }, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("projected", result!.AnnualizationStatus);
        // 1000 / 100 * 365 = 3650 (age floored to 100 days)
        Assert.Equal(3650m, result.AnnualizedCost);
    }

    [Fact]
    public async Task Tco_MatureAsset_ReportsSufficientData()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        db.Assets.Add(CreateAsset(tenantId, assetId, DateTime.UtcNow.AddDays(-730)));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Labor, 7300m));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetTcoQuery { AssetId = assetId }, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("sufficient_data", result!.AnnualizationStatus);
        Assert.NotNull(result.AnnualizedCost);
    }

    [Fact]
    public async Task Tco_ExcludesSoftDeletedEntries()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        db.Assets.Add(CreateAsset(tenantId, assetId, DateTime.UtcNow.AddDays(-400)));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Labor, 100m));
        db.CostEntries.Add(Cost(tenantId, assetId, CostTypes.Labor, 999m, isDeleted: true));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetTcoQuery { AssetId = assetId }, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(100m, result!.TotalCost);
        Assert.Equal(1, result.EntryCount);
    }

    [Fact]
    public async Task Tco_AssetFromOtherTenant_ReturnsNull_ScnR002()
    {
        var tenantIdA = Guid.NewGuid();
        var tenantIdB = Guid.NewGuid();
        var assetB = Guid.NewGuid();
        await using var harness = CreateHarness(tenantIdA);
        var db = harness.Db;

        // Tenant B's asset: invisible to tenant A's DbContext through the global query filter.
        db.Assets.Add(CreateAsset(tenantIdB, assetB, DateTime.UtcNow.AddDays(-400)));
        db.CostEntries.Add(Cost(tenantIdB, assetB, CostTypes.Labor, 500m));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetTcoQuery { AssetId = assetB }, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Tco_IncludeSubtree_SumsDescendantCosts()
    {
        var tenantId = Guid.NewGuid();
        var parentAssetId = Guid.NewGuid();
        var childAssetId = Guid.NewGuid();
        await using var harness = CreateHarness(tenantId);
        var db = harness.Db;

        db.Assets.Add(CreateAsset(tenantId, parentAssetId, DateTime.UtcNow.AddDays(-400)));
        db.Assets.Add(CreateAsset(tenantId, childAssetId, DateTime.UtcNow.AddDays(-400)));
        db.AssetHierarchies.Add(new AssetHierarchy
        {
            AncestorId = parentAssetId,
            DescendantId = childAssetId,
            Depth = 1
        });
        db.CostEntries.Add(Cost(tenantId, parentAssetId, CostTypes.Labor, 100m));
        db.CostEntries.Add(Cost(tenantId, childAssetId, CostTypes.Parts, 80m));
        await db.SaveChangesAsync();

        var handler = CreateHandler(db, harness.Resolver);
        var result = await handler.Handle(new GetAssetTcoQuery { AssetId = parentAssetId, IncludeSubtree = true }, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(180m, result!.TotalCost);
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
