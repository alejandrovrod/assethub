using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.Security;
using AssetHub.Application.Security.Commands;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Security;

public class RoleCommandsTests
{
    private static (CreateRoleCommandHandler Create, UpdateRoleCommandHandler Update, DeleteRoleCommandHandler Delete, SecurityDbContext Db, PlatformDbWrapper Platform)
        BuildHandlers(Guid tenantId, string enabledModulesJson = "[\"assets\", \"maintenance\"]")
    {
        var (db, roleManager) = SecurityTestHelper.CreateSecurityDb();
        SecurityTestHelper.SeedCatalogAndRolesAsync(db, roleManager).GetAwaiter().GetResult();
        var platformTask = SecurityTestHelper.CreatePlatformDbWithTenantAsync(tenantId, "pro", enabledModulesJson);
        platformTask.Wait();
        var platformDb = platformTask.Result;

        var resolver = new SecurityTestHelper.FakeTenantResolver(tenantId);
        var currentUser = new SecurityTestHelper.FakeCurrentUser();

        var create = new CreateRoleCommandHandler(db, platformDb, resolver, roleManager, currentUser);
        var update = new UpdateRoleCommandHandler(db, platformDb, resolver, roleManager, currentUser);
        var delete = new DeleteRoleCommandHandler(db, resolver);
        return (create, update, delete, db, new PlatformDbWrapper(platformDb));
    }

    public sealed class PlatformDbWrapper
    {
        public AssetHub.Infrastructure.Persistence.PlatformDbContext Db { get; }
        public PlatformDbWrapper(AssetHub.Infrastructure.Persistence.PlatformDbContext db) => Db = db;
    }

    [Fact]
    public async Task CreateRole_AssignsValidatedPermissions()
    {
        var tenantId = Guid.NewGuid();
        var (create, _, _, db, _) = BuildHandlers(tenantId);

        var roleId = await create.Handle(new CreateRoleCommand
        {
            Name = "Supervisor",
            Description = "Supervisa mantenimiento",
            PermissionCodes = new List<string> { "maintenance:read", "maintenance:approve", "assets:read" }
        }, CancellationToken.None);

        var perms = await db.RolePermissions
            .Where(rp => rp.TenantId == tenantId && rp.RoleId == roleId)
            .Join(db.Permissions, rp => rp.PermissionId, p => p.Id, (rp, p) => p.Code)
            .ToListAsync();

        Assert.Equal(3, perms.Count);
        Assert.Contains("maintenance:approve", perms);
    }

    [Fact]
    public async Task CreateRole_UnknownPermissionCode_Throws()
    {
        var tenantId = Guid.NewGuid();
        var (create, _, _, _, _) = BuildHandlers(tenantId);

        await Assert.ThrowsAsync<ArgumentException>(() => create.Handle(new CreateRoleCommand
        {
            Name = "Bad Role",
            PermissionCodes = new List<string> { "no-existe:permiso" }
        }, CancellationToken.None));
    }

    [Fact]
    public async Task CreateRole_ModuleNotInPlan_Throws() // R-ROLE-4 / CA-ROLE-8
    {
        var tenantId = Guid.NewGuid();
        // plan free: solo "assets"
        var (create, _, _, _, _) = BuildHandlers(tenantId, "[\"assets\"]");

        await Assert.ThrowsAsync<ArgumentException>(() => create.Handle(new CreateRoleCommand
        {
            Name = "Mantenedor",
            PermissionCodes = new List<string> { "maintenance:read" } // requiere modulo maintenance
        }, CancellationToken.None));
    }

    [Fact]
    public async Task UpdateRole_ReplacesPermissionSet()
    {
        var tenantId = Guid.NewGuid();
        var (create, update, _, db, _) = BuildHandlers(tenantId);

        var roleId = await create.Handle(new CreateRoleCommand
        {
            Name = "Supervisor",
            PermissionCodes = new List<string> { "maintenance:read", "assets:read" }
        }, CancellationToken.None);

        await update.Handle(new UpdateRoleCommand
        {
            RoleId = roleId,
            Name = "Supervisor Sr",
            PermissionCodes = new List<string> { "maintenance:read", "maintenance:approve" }
        }, CancellationToken.None);

        var perms = await db.RolePermissions
            .Where(rp => rp.TenantId == tenantId && rp.RoleId == roleId)
            .Join(db.Permissions, rp => rp.PermissionId, p => p.Id, (rp, p) => p.Code)
            .ToListAsync();

        Assert.Equal(2, perms.Count);
        Assert.Contains("maintenance:approve", perms);
        Assert.DoesNotContain("assets:read", perms);
    }

    [Fact]
    public async Task UpdateRole_RemovingLastRolesManage_Throws() // R-ROLE-3 / CA-ROLE-7
    {
        var tenantId = Guid.NewGuid();
        var (create, update, _, db, _) = BuildHandlers(tenantId);

        var roleId = await create.Handle(new CreateRoleCommand
        {
            Name = "Unico Admin",
            PermissionCodes = new List<string> { "roles:manage", "roles:read" }
        }, CancellationToken.None);

        // Intentar quitar roles:manage del unico rol que lo tiene
        await Assert.ThrowsAsync<InvalidOperationException>(() => update.Handle(new UpdateRoleCommand
        {
            RoleId = roleId,
            Name = "Unico Admin",
            PermissionCodes = new List<string> { "roles:read" }
        }, CancellationToken.None));
    }

    [Fact]
    public async Task UpdateRole_RemovingRolesManage_AllowedWhenOtherRoleHasIt()
    {
        var tenantId = Guid.NewGuid();
        var (create, update, _, db, _) = BuildHandlers(tenantId);

        var adminRoleId = await create.Handle(new CreateRoleCommand
        {
            Name = "Admin A",
            PermissionCodes = new List<string> { "roles:manage", "roles:read" }
        }, CancellationToken.None);

        await create.Handle(new CreateRoleCommand
        {
            Name = "Admin B",
            PermissionCodes = new List<string> { "roles:manage", "roles:read" }
        }, CancellationToken.None);

        // Ahora A puede soltar roles:manage porque B lo conserva
        await update.Handle(new UpdateRoleCommand
        {
            RoleId = adminRoleId,
            Name = "Admin A",
            PermissionCodes = new List<string> { "roles:read" }
        }, CancellationToken.None);

        var rolesManagePermissionId = await db.Permissions
            .Where(p => p.Code == "roles:manage")
            .Select(p => p.Id)
            .FirstAsync();
        var count = await db.RolePermissions
            .Where(rp => rp.TenantId == tenantId && rp.PermissionId == rolesManagePermissionId)
            .Select(rp => rp.RoleId)
            .Distinct()
            .CountAsync();
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task DeleteRole_SystemDefault_Throws()
    {
        var tenantId = Guid.NewGuid();
        var (_, _, delete, db, _) = BuildHandlers(tenantId);

        var systemRole = await db.Roles.FirstAsync(r => r.Name == "Tenant Admin");

        await Assert.ThrowsAsync<InvalidOperationException>(() => delete.Handle(new DeleteRoleCommand
        {
            RoleId = systemRole.Id
        }, CancellationToken.None));
    }

    [Fact]
    public async Task DeleteRole_LastRolesManage_Throws()
    {
        var tenantId = Guid.NewGuid();
        var (create, _, delete, db, _) = BuildHandlers(tenantId);

        var roleId = await create.Handle(new CreateRoleCommand
        {
            Name = "Solo Admin",
            PermissionCodes = new List<string> { "roles:manage" }
        }, CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() => delete.Handle(new DeleteRoleCommand
        {
            RoleId = roleId
        }, CancellationToken.None));
    }

    [Fact]
    public async Task DeleteRole_CustomRole_RemovesMatrixEntries()
    {
        var tenantId = Guid.NewGuid();
        var (create, _, delete, db, _) = BuildHandlers(tenantId);

        var roleId = await create.Handle(new CreateRoleCommand
        {
            Name = "Temporal",
            PermissionCodes = new List<string> { "assets:read", "assets:create" }
        }, CancellationToken.None);

        // Darle roles:manage a otro rol para que el delete pase R-ROLE-3
        await create.Handle(new CreateRoleCommand
        {
            Name = "Otro Admin",
            PermissionCodes = new List<string> { "roles:manage" }
        }, CancellationToken.None);

        await delete.Handle(new DeleteRoleCommand { RoleId = roleId }, CancellationToken.None);

        var matrixCount = await db.RolePermissions
            .Where(rp => rp.RoleId == roleId)
            .CountAsync();
        Assert.Equal(0, matrixCount);

        var roleExists = await db.Roles.AnyAsync(r => r.Id == roleId);
        Assert.False(roleExists);
    }

    [Fact]
    public async Task Matrix_IsTenantIsolated() // CA-ROLE-10
    {
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var (createA, _, _, dbA, _) = BuildHandlers(tenantA);
        var (createB, _, _, dbB, _) = BuildHandlers(tenantB);

        var roleA = await createA.Handle(new CreateRoleCommand
        {
            Name = "Rol A",
            PermissionCodes = new List<string> { "assets:read" }
        }, CancellationToken.None);

        var roleB = await createB.Handle(new CreateRoleCommand
        {
            Name = "Rol B",
            PermissionCodes = new List<string> { "assets:read", "assets:create" }
        }, CancellationToken.None);

        var permsA = await dbA.RolePermissions.Where(rp => rp.TenantId == tenantA).CountAsync();
        var permsB = await dbB.RolePermissions.Where(rp => rp.TenantId == tenantB).CountAsync();

        Assert.Equal(1, permsA);
        Assert.Equal(2, permsB);
    }
}
