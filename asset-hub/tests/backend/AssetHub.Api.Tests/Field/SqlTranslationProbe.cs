using System;
using System.Linq;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Common.Workflow;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Guards that the assignment prefilters stay translatable to SQL Server.
///
/// They combine a <c>LIKE</c> over <c>PropertiesJson</c> with a correlated <c>EXISTS</c>
/// over the child orders. Both work today, but a refactor to something EF cannot translate
/// (or that silently evaluates client-side) would only surface in production, because the
/// functional tests run on the in-memory provider.
/// </summary>
public class SqlTranslationProbe
{
    private static TenantDbContext SqlServerContext()
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseSqlServer(
                "Server=localhost;Database=probe;User Id=probe;Password=probe;TrustServerCertificate=True",
                o => o.UseNetTopologySuite())
            .Options;
        return new TenantDbContext(options, new WorkTaskTestHelper.FakeTenantResolver(Guid.NewGuid()));
    }

    [Fact]
    public void IncidentPrefilter_Translates()
    {
        using var db = SqlServerContext();
        var sql = db.Incidents.WhereAssignedCandidates(db, Guid.NewGuid()).ToQueryString();
        Assert.Contains("LIKE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("EXISTS", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void OrderPrefilter_Translates()
    {
        using var db = SqlServerContext();
        var sql = db.MaintenanceOrders.WhereAssignedCandidates(Guid.NewGuid()).ToQueryString();
        Assert.Contains("LIKE", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TaskPrefilter_Translates()
    {
        using var db = SqlServerContext();
        var sql = db.WorkTasks.WhereAssignedCandidates(Guid.NewGuid(), [Guid.NewGuid()]).ToQueryString();
        Assert.Contains("LIKE", sql, StringComparison.OrdinalIgnoreCase);
    }
}
