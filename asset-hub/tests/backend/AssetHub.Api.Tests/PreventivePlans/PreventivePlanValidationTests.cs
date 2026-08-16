using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.Commands;
using AssetHub.Domain.Maintenance;
using Cronos;
using Xunit;

namespace AssetHub.Api.Tests.PreventivePlans;

public class PreventivePlanValidationTests
{
    [Theory]
    [InlineData("0 0 1 * *")]
    [InlineData("0 0 * * 1")]
    [InlineData("0 * * * *")]
    public void CronExpression_ParsesSuccessfully(string cron)
    {
        var expression = CronExpression.Parse(cron);
        var next = expression.GetNextOccurrence(DateTime.UtcNow);
        Assert.NotNull(next);
    }

    [Fact]
    public void CronExpression_InvalidExpression_Throws()
    {
        Assert.ThrowsAny<Exception>(() => CronExpression.Parse("not-a-cron"));
    }

    [Fact]
    public async Task CreatePreventivePlan_RejectsBothTargets()
    {
        var tenantId = Guid.NewGuid();
        var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var handler = new CreatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.FakeTenantResolver(tenantId));

        var command = new CreatePreventivePlanCommand
        {
            Name = "Invalid Plan",
            AssetId = Guid.NewGuid(),
            AssetTemplateId = Guid.NewGuid(),
            CronExpression = "0 0 1 * *",
        };

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task CreatePreventivePlan_RejectsNoTarget()
    {
        var tenantId = Guid.NewGuid();
        var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var handler = new CreatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.FakeTenantResolver(tenantId));

        var command = new CreatePreventivePlanCommand
        {
            Name = "Invalid Plan",
            CronExpression = "0 0 1 * *",
        };

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task CreatePreventivePlan_RejectsNegativeDueDateOffset()
    {
        var tenantId = Guid.NewGuid();
        var db = PreventivePlanTestHelper.CreateDbContext(tenantId);
        var handler = new CreatePreventivePlanCommandHandler(db, new PreventivePlanTestHelper.FakeTenantResolver(tenantId));

        var command = new CreatePreventivePlanCommand
        {
            Name = "Invalid Plan",
            AssetId = Guid.NewGuid(),
            CronExpression = "0 0 1 * *",
            DueDateOffsetDays = -1,
        };

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(command, CancellationToken.None));
    }
}
