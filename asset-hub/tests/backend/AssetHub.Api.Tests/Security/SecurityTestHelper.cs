using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Security;
using AssetHub.Domain.Tenancy;
using AssetHub.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace AssetHub.Api.Tests.Security;

public static class SecurityTestHelper
{
    public static Guid TenantA { get; } = Guid.NewGuid();
    public static Guid TenantB { get; } = Guid.NewGuid();

    public sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid? _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    public sealed class FakeCurrentUser : ICurrentUser
    {
        public Guid? Id { get; set; } = Guid.NewGuid();
    }

    public static (SecurityDbContext Db, RoleManager<ApplicationRole> RoleManager) CreateSecurityDb()
    {
        var options = new DbContextOptionsBuilder<SecurityDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new SecurityDbContext(options);

        var roleStore = new RoleStoreInMemoryStub(db);
        var roleManager = new RoleManager<ApplicationRole>(
            roleStore,
            new List<IRoleValidator<ApplicationRole>>(),
            new UpperInvariantLookupNormalizerStub(),
            new IdentityErrorDescriber(),
            NullLogger<RoleManager<ApplicationRole>>.Instance);
        return (db, roleManager);
    }

    /// <summary>
    /// Seed minimo: catalogo completo de permisos + roles base del sistema.
    /// </summary>
    public static async Task SeedCatalogAndRolesAsync(SecurityDbContext db, RoleManager<ApplicationRole> roleManager)
    {
        foreach (var def in PermissionCatalog.All)
        {
            db.Permissions.Add(new Permission
            {
                Id = Guid.NewGuid(),
                Code = def.Code,
                Description = def.Description,
                Module = def.Module,
                PlanModule = def.PlanModule
            });
        }

        foreach (var name in new[] { "admin", "Tenant Admin", "Asset Manager", "Technician", "Viewer" })
        {
            await roleManager.CreateAsync(new ApplicationRole
            {
                Name = name,
                NormalizedName = name.ToUpperInvariant(),
                IsSystemDefault = true,
                Description = name
            });
        }

        await db.SaveChangesAsync();
    }

    public static PlatformDbContext CreatePlatformDb()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new PlatformDbContext(options);
    }

    /// <summary>
    /// PlatformDb con un tenant del plan indicado (EnabledModules JSON).
    /// </summary>
    public static async Task<PlatformDbContext> CreatePlatformDbWithTenantAsync(
        Guid tenantId, string planCode, string enabledModulesJson)
    {
        var db = CreatePlatformDb();
        var plan = new Plan { Id = Guid.NewGuid(), Code = planCode, Name = planCode, EnabledModules = enabledModulesJson };
        db.Plans.Add(plan);
        db.Tenants.Add(new Tenant
        {
            Id = tenantId,
            Slug = "tenant-" + tenantId.ToString()[..8],
            Name = "Tenant " + tenantId.ToString()[..8],
            PlanId = plan.Id,
            Status = TenantStatus.Active
        });
        await db.SaveChangesAsync();
        return db;
    }

    // ---- Stubs para RoleManager sin proveedor real de Identity stores ----

    private sealed class RoleStoreInMemoryStub : IRoleStore<ApplicationRole>
    {
        private readonly SecurityDbContext _db;
        public RoleStoreInMemoryStub(SecurityDbContext db) => _db = db;

        public void Dispose() { }
        public Task<string> GetRoleIdAsync(ApplicationRole role, CancellationToken ct) => Task.FromResult(role.Id.ToString());
        public Task<string?> GetRoleNameAsync(ApplicationRole role, CancellationToken ct) => Task.FromResult<string?>(role.Name);
        public Task SetRoleNameAsync(ApplicationRole role, string? roleName, CancellationToken ct) { role.Name = roleName; return Task.CompletedTask; }
        public Task<IdentityResult> CreateAsync(ApplicationRole role, CancellationToken ct) { _db.Roles.Add(role); return Task.FromResult(IdentityResult.Success); }
        public Task<IdentityResult> UpdateAsync(ApplicationRole role, CancellationToken ct) { return Task.FromResult(IdentityResult.Success); }
        public Task<IdentityResult> DeleteAsync(ApplicationRole role, CancellationToken ct) { _db.Roles.Remove(role); return Task.FromResult(IdentityResult.Success); }
        public Task<ApplicationRole?> FindByIdAsync(string roleId, CancellationToken ct) => _db.Roles.FirstOrDefaultAsync(r => r.Id == Guid.Parse(roleId), ct);
        public Task<ApplicationRole?> FindByNameAsync(string? normalizedRoleName, CancellationToken ct) => _db.Roles.FirstOrDefaultAsync(r => r.NormalizedName == normalizedRoleName, ct);
        public Task<string?> GetNormalizedRoleNameAsync(ApplicationRole role, CancellationToken ct) => Task.FromResult<string?>(role.NormalizedName);
        public Task SetNormalizedRoleNameAsync(ApplicationRole role, string? normalizedName, CancellationToken ct) { role.NormalizedName = normalizedName; return Task.CompletedTask; }
    }

    private sealed class UpperInvariantLookupNormalizerStub : ILookupNormalizer
    {
        public string NormalizeName(string? key) => (key ?? string.Empty).ToUpperInvariant();
        public string NormalizeEmail(string? email) => (email ?? string.Empty).ToUpperInvariant();
    }

    /// <summary>
    /// UserManager contra la SecurityDbContext InMemory: soporta create/update
    /// con password hashing, roles y validaciones de password estandar.
    /// </summary>
    public static UserManager<ApplicationUser> CreateUserManager(SecurityDbContext db)
    {
        var userStore = new UserStoreInMemoryStub(db);
        return new UserManager<ApplicationUser>(
            userStore,
            new Microsoft.Extensions.Options.OptionsWrapper<IdentityOptions>(new IdentityOptions()),
            new PasswordHasher<ApplicationUser>(),
            new List<IUserValidator<ApplicationUser>>(),
            new List<IPasswordValidator<ApplicationUser>> { new PasswordValidator<ApplicationUser>() },
            new UpperInvariantLookupNormalizerStub(),
            new IdentityErrorDescriber(),
            (IServiceProvider?)null,
            NullLogger<UserManager<ApplicationUser>>.Instance);
    }

    private sealed class UserStoreInMemoryStub :
        IUserStore<ApplicationUser>,
        IUserPasswordStore<ApplicationUser>,
        IUserEmailStore<ApplicationUser>,
        IUserRoleStore<ApplicationUser>
    {
        private readonly SecurityDbContext _db;
        public UserStoreInMemoryStub(SecurityDbContext db) => _db = db;

        public void Dispose() { }

        public Task<string> GetUserIdAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult(user.Id.ToString());
        public Task<string?> GetUserNameAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult<string?>(user.UserName);
        public Task SetUserNameAsync(ApplicationUser user, string? userName, CancellationToken ct) { user.UserName = userName; return Task.CompletedTask; }
        public Task<string?> GetNormalizedUserNameAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult<string?>(user.NormalizedUserName);
        public Task SetNormalizedUserNameAsync(ApplicationUser user, string? normalizedName, CancellationToken ct) { user.NormalizedUserName = normalizedName; return Task.CompletedTask; }

        public Task<IdentityResult> CreateAsync(ApplicationUser user, CancellationToken ct)
        {
            _db.Users.Add(user);
            return Task.FromResult(IdentityResult.Success);
        }

        public Task<IdentityResult> UpdateAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult(IdentityResult.Success);
        public Task<IdentityResult> DeleteAsync(ApplicationUser user, CancellationToken ct) { _db.Users.Remove(user); return Task.FromResult(IdentityResult.Success); }
        public Task<ApplicationUser?> FindByIdAsync(string userId, CancellationToken ct) => _db.Users.FirstOrDefaultAsync(u => u.Id == Guid.Parse(userId), ct);
        public Task<ApplicationUser?> FindByNameAsync(string? normalizedUserName, CancellationToken ct) => _db.Users.FirstOrDefaultAsync(u => u.NormalizedUserName == normalizedUserName, ct);

        // Password
        public Task SetPasswordHashAsync(ApplicationUser user, string? passwordHash, CancellationToken ct) { user.PasswordHash = passwordHash; return Task.CompletedTask; }
        public Task<string?> GetPasswordHashAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult<string?>(user.PasswordHash);
        public Task<bool> HasPasswordAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult(user.PasswordHash != null);

        // Email
        public Task SetEmailAsync(ApplicationUser user, string? email, CancellationToken ct) { user.Email = email; return Task.CompletedTask; }
        public Task<string?> GetEmailAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult<string?>(user.Email);
        public Task<bool> GetEmailConfirmedAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult(user.EmailConfirmed);
        public Task SetEmailConfirmedAsync(ApplicationUser user, bool confirmed, CancellationToken ct) { user.EmailConfirmed = confirmed; return Task.CompletedTask; }
        public Task<string?> GetNormalizedEmailAsync(ApplicationUser user, CancellationToken ct) => Task.FromResult<string?>(user.NormalizedEmail);
        public Task SetNormalizedEmailAsync(ApplicationUser user, string? normalizedEmail, CancellationToken ct) { user.NormalizedEmail = normalizedEmail; return Task.CompletedTask; }
        public Task<ApplicationUser?> FindByEmailAsync(string? normalizedEmail, CancellationToken ct) => _db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, ct);

        // Roles
        public Task AddToRoleAsync(ApplicationUser user, string roleName, CancellationToken ct)
        {
            var role = _db.Roles.FirstOrDefault(r => r.NormalizedName == roleName || r.Name == roleName);
            if (role != null)
            {
                _db.UserRoles.Add(new Microsoft.AspNetCore.Identity.IdentityUserRole<Guid> { UserId = user.Id, RoleId = role.Id });
            }
            return Task.CompletedTask;
        }

        public Task RemoveFromRoleAsync(ApplicationUser user, string roleName, CancellationToken ct)
        {
            var role = _db.Roles.FirstOrDefault(r => r.NormalizedName == roleName || r.Name == roleName);
            if (role != null)
            {
                var link = _db.UserRoles.FirstOrDefault(ur => ur.UserId == user.Id && ur.RoleId == role.Id);
                if (link != null) _db.UserRoles.Remove(link);
            }
            return Task.CompletedTask;
        }

        public Task<IList<string>> GetRolesAsync(ApplicationUser user, CancellationToken ct)
        {
            var roleIds = _db.UserRoles.Where(ur => ur.UserId == user.Id).Select(ur => ur.RoleId).ToList();
            var names = _db.Roles.Where(r => roleIds.Contains(r.Id)).Select(r => r.Name!).ToList();
            return Task.FromResult<IList<string>>(names);
        }

        public Task<bool> IsInRoleAsync(ApplicationUser user, string roleName, CancellationToken ct)
        {
            var role = _db.Roles.FirstOrDefault(r => r.NormalizedName == roleName || r.Name == roleName);
            if (role == null) return Task.FromResult(false);
            return Task.FromResult(_db.UserRoles.Any(ur => ur.UserId == user.Id && ur.RoleId == role.Id));
        }

        public Task<IList<ApplicationUser>> GetUsersInRoleAsync(string roleName, CancellationToken ct)
        {
            var role = _db.Roles.FirstOrDefault(r => r.NormalizedName == roleName);
            var users = role == null
                ? new List<ApplicationUser>()
                : _db.UserRoles.Where(ur => ur.RoleId == role.Id).Join(_db.Users, ur => ur.UserId, u => u.Id, (ur, u) => u).ToList();
            return Task.FromResult<IList<ApplicationUser>>(users);
        }
    }
}
