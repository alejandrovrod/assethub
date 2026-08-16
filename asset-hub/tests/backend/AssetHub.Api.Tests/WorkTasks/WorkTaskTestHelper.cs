using System;
using AssetHub.Application.Interfaces;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Tests.WorkTasks;

public static class WorkTaskTestHelper
{
    public sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    public sealed class FakeCurrentUser : Application.Interfaces.ICurrentUser
    {
        public FakeCurrentUser(Guid? id) => Id = id;
        public Guid? Id { get; }
    }

    public static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var resolver = new FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }
}
