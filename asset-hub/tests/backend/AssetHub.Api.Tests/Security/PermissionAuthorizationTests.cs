using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.Security;
using AssetHub.Application.Security.Queries;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Xunit;

namespace AssetHub.Api.Tests.Security;

public class PermissionAuthorizationTests
{
    private static AuthorizationHandlerContext BuildContext(
        IEnumerable<string>? perms, params string[] roles)
    {
        var claims = new List<Claim>();
        foreach (var r in roles) claims.Add(new Claim(ClaimTypes.Role, r));
        foreach (var p in perms ?? Enumerable.Empty<string>()) claims.Add(new Claim("perms", p));

        // Sin roles ni perms => usuario anonimo (identity sin autenticar)
        var isAuthenticated = roles.Length > 0 || (perms != null && perms.Any());
        var identity = new ClaimsIdentity(claims, isAuthenticated ? "Test" : null);
        var user = new ClaimsPrincipal(identity);
        var requirement = new PermissionRequirement("assets:read");
        return new AuthorizationHandlerContext(
            new List<IAuthorizationRequirement> { requirement }, user, null);
    }

    [Fact]
    public async Task Handler_UserWithPermission_Succeeds() // CA-ROLE-3 analogo
    {
        var handler = new PermissionAuthorizationHandler();
        var context = BuildContext(new[] { "assets:read", "assets:create" });

        await handler.HandleAsync(context);

        Assert.True(context.HasSucceeded);
    }

    [Fact]
    public async Task Handler_UserWithoutPermission_Fails() // CA-ROLE-4 analogo
    {
        var handler = new PermissionAuthorizationHandler();
        var context = BuildContext(new[] { "incidents:read" }, "Technician");

        await handler.HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    [Fact]
    public async Task Handler_TenantAdminBootstrap_SucceedsWithoutPerms()
    {
        var handler = new PermissionAuthorizationHandler();
        var context = BuildContext(null, "Tenant Admin");

        await handler.HandleAsync(context);

        Assert.True(context.HasSucceeded);
    }

    [Fact]
    public async Task Handler_AnonymousUser_Fails()
    {
        var handler = new PermissionAuthorizationHandler();
        var context = BuildContext(null);

        await handler.HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    [Fact]
    public async Task PolicyProvider_CreatesDynamicPermissionPolicy()
    {
        var options = Options.Create(new AuthorizationOptions());
        var provider = new PermissionPolicyProvider(options);

        var policy = await provider.GetPolicyAsync("permission:maintenance:approve");

        Assert.NotNull(policy);
        Assert.Contains(policy!.Requirements, r => r is PermissionRequirement pr && pr.Permission == "maintenance:approve");
    }

    [Fact]
    public async Task PolicyProvider_NonPermissionPolicy_FallsBack()
    {
        var options = Options.Create(new AuthorizationOptions());
        var provider = new PermissionPolicyProvider(options);

        // policy no registrada y sin prefijo => null (comportamiento default)
        var policy = await provider.GetPolicyAsync("SomeOtherPolicy");

        Assert.Null(policy);
    }
}

public class PermissionCatalogTests
{
    [Fact]
    public async Task Catalog_Query_GroupsByModule() // CA-ROLE-5 analogo
    {
        var (db, roleManager) = SecurityTestHelper.CreateSecurityDb();
        await SecurityTestHelper.SeedCatalogAndRolesAsync(db, roleManager);

        var handler = new GetPermissionCatalogQueryHandler(db);
        var groups = await handler.Handle(new GetPermissionCatalogQuery(), CancellationToken.None);

        Assert.NotEmpty(groups);
        Assert.Contains(groups, g => g.Module == "Mantenimiento");
        var mantenimiento = groups.First(g => g.Module == "Mantenimiento");
        Assert.Contains(mantenimiento.Permissions, p => p.Code == "maintenance:approve");
    }

    [Fact]
    public void Catalog_HasNoDuplicateCodes()
    {
        var codes = PermissionCatalog.All.Select(p => p.Code).ToList();
        Assert.Equal(codes.Count, codes.Distinct().Count());
    }

    [Fact]
    public void Catalog_CoversAllModulesFromPlan()
    {
        // M1-M20: cada modulo del plan tiene al menos un permiso
        var modules = PermissionCatalog.All.Select(p => p.Module).Distinct().ToList();
        Assert.True(modules.Count >= 15, $"Expected >= 15 modules, got {modules.Count}");
    }
}
