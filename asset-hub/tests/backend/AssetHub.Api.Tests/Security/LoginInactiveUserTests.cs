using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.Security;
using AssetHub.Application.Auth.Commands;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AssetHub.Api.Tests.Security;

public class LoginInactiveUserTests
{
    private static async Task<(LoginCommandHandler Handler, SecurityDbContext Db, UserManager<ApplicationUser> UserManager)> BuildAsync()
    {
        var (db, roleManager) = SecurityTestHelper.CreateSecurityDb();
        await SecurityTestHelper.SeedCatalogAndRolesAsync(db, roleManager);
        var userManager = SecurityTestHelper.CreateUserManager(db);
        var platformDb = await SecurityTestHelper.CreatePlatformDbWithTenantAsync(
            Guid.NewGuid(), "pro", "[\"assets\", \"maintenance\"]");

        var config = new ConfigurationBuilder().Build();
        var jwt = new JwtTokenGenerator(config);
        var handler = new LoginCommandHandler(userManager, jwt, db, platformDb);
        return (handler, db, userManager);
    }

    private static async Task<ApplicationUser> CreateUserAsync(
        SecurityDbContext db, UserManager<ApplicationUser> userManager,
        string email, bool isActive, Guid tenantId)
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            NormalizedUserName = email.ToUpperInvariant(),
            FullName = "Usuario " + email,
            TenantId = tenantId,
            IsActive = isActive
        };
        user.PasswordHash = new PasswordHasher<ApplicationUser>()
            .HashPassword(user, "Password123!");
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task Login_InactiveUser_Rejected()
    {
        var (handler, db, userManager) = await BuildAsync();
        await CreateUserAsync(db, userManager, "inactivo@test.com", isActive: false, tenantId: Guid.NewGuid());

        var ex = await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            handler.Handle(new LoginCommand("inactivo@test.com", "Password123!"), CancellationToken.None));
        Assert.Contains("desactivada", ex.Message);
    }

    [Fact]
    public async Task Login_ActiveUser_ReturnsPermissionsFromMatrix()
    {
        var (handler, db, userManager) = await BuildAsync();

        var tenantId = Guid.NewGuid();
        var user = await CreateUserAsync(db, userManager, "activo@test.com", isActive: true, tenantId: tenantId);

        // Rol Viewer con matriz del tenant (solo permisos :read)
        var viewerRole = await db.Roles.FirstAsync(r => r.Name == "Viewer");
        var assetsRead = await db.Permissions.FirstAsync(p => p.Code == "assets:read");
        await userManager.AddToRoleAsync(user, "Viewer");
        db.RolePermissions.Add(new RolePermission
        {
            TenantId = tenantId,
            RoleId = viewerRole.Id,
            PermissionId = assetsRead.Id
        });
        await db.SaveChangesAsync();

        var result = await handler.Handle(new LoginCommand("activo@test.com", "Password123!"), CancellationToken.None);

        Assert.Contains("assets:read", result.Permissions);
        Assert.Contains("Viewer", result.Roles);
    }

    [Fact]
    public async Task Login_ActiveUserWithoutMatrix_EmptyPermissions()
    {
        var (handler, db, userManager) = await BuildAsync();
        await CreateUserAsync(db, userManager, "sinpermisos@test.com", isActive: true, tenantId: Guid.NewGuid());

        var result = await handler.Handle(new LoginCommand("sinpermisos@test.com", "Password123!"), CancellationToken.None);

        Assert.Empty(result.Permissions);
    }
}
