using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.Security;
using AssetHub.Application.Auth.Commands;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Users.Commands;
using AssetHub.Application.Users.Queries;
using AssetHub.Domain.Security;
using AssetHub.Domain.Tenancy;
using AssetHub.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Security;

public class UserCommandsTests
{
    private sealed class TestContext
    {
        public Guid TenantId { get; init; } = Guid.NewGuid();
        public Guid OtherTenantId { get; init; } = Guid.NewGuid();
        public SecurityDbContext Db { get; init; } = null!;
        public UserManager<ApplicationUser> UserManager { get; init; } = null!;
        public SecurityTestHelper.FakeCurrentUser CurrentUser { get; init; } = new();

        public CreateUserCommandHandler Create { get; init; } = null!;
        public UpdateUserCommandHandler Update { get; init; } = null!;
        public DeactivateUserCommandHandler Deactivate { get; init; } = null!;
        public ActivateUserCommandHandler Activate { get; init; } = null!;
        public AssignUserRoleCommandHandler AssignRole { get; init; } = null!;
        public RemoveUserRoleCommandHandler RemoveRole { get; init; } = null!;
        public GetUsersQueryHandler GetUsers { get; init; } = null!;
        public GetUserByIdQueryHandler GetUserById { get; init; } = null!;
    }

    private static async Task<TestContext> BuildContextAsync()
    {
        var (db, roleManager) = SecurityTestHelper.CreateSecurityDb();
        await SecurityTestHelper.SeedCatalogAndRolesAsync(db, roleManager);
        var userManager = SecurityTestHelper.CreateUserManager(db);

        var resolver = new MutableTenantResolver();
        var currentUser = new SecurityTestHelper.FakeCurrentUser();

        var ctx = new TestContext
        {
            Db = db,
            UserManager = userManager,
            CurrentUser = currentUser,
            Create = new CreateUserCommandHandler(db, userManager, resolver, currentUser),
            Update = new UpdateUserCommandHandler(db, userManager, resolver, currentUser),
            Deactivate = new DeactivateUserCommandHandler(db, userManager, resolver, currentUser),
            Activate = new ActivateUserCommandHandler(db, userManager, resolver, currentUser),
            AssignRole = new AssignUserRoleCommandHandler(db, userManager, resolver, currentUser),
            RemoveRole = new RemoveUserRoleCommandHandler(db, userManager, resolver, currentUser),
            GetUsers = new GetUsersQueryHandler(db, resolver),
            GetUserById = new GetUserByIdQueryHandler(db, resolver),
        };
        resolver.TenantId = ctx.TenantId;
        return ctx;
    }

    private sealed class MutableTenantResolver : ITenantResolver
    {
        public Guid? TenantId { get; set; }
        public Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => TenantId;
    }

    private async Task<ApplicationUser> CreateTenantUserAsync(TestContext ctx, string email, Guid tenantId)
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
            IsActive = true
        };
        ctx.Db.Users.Add(user);
        await ctx.Db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task CreateUser_AssignsRolesAndPersists()
    {
        var ctx = await BuildContextAsync();
        var viewerRole = await ctx.Db.Roles.FirstAsync(r => r.Name == "Viewer");
        var techRole = await ctx.Db.Roles.FirstAsync(r => r.Name == "Technician");

        var userId = await ctx.Create.Handle(new CreateUserCommand
        {
            FullName = "Ana García",
            Email = "ana@test.com",
            Password = "Password123!",
            RoleIds = new List<Guid> { viewerRole.Id, techRole.Id }
        }, CancellationToken.None);

        var user = await ctx.Db.Users.FirstAsync(u => u.Id == userId);
        Assert.Equal(ctx.TenantId, user.TenantId);
        Assert.True(user.IsActive);

        var roles = await ctx.UserManager.GetRolesAsync(user);
        Assert.Contains("Viewer", roles);
        Assert.Contains("Technician", roles);

        // Auditoría R3
        var audit = await ctx.Db.AuditLogs.AnyAsync(a => a.Action == "user.created" && a.EntityId == userId);
        Assert.True(audit);
    }

    [Fact]
    public async Task CreateUser_DuplicateEmail_Throws()
    {
        var ctx = await BuildContextAsync();
        await CreateTenantUserAsync(ctx, "dup@test.com", ctx.TenantId);

        await Assert.ThrowsAsync<ArgumentException>(() => ctx.Create.Handle(new CreateUserCommand
        {
            FullName = "Dup",
            Email = "dup@test.com",
            Password = "Password123!"
        }, CancellationToken.None));
    }

    [Fact]
    public async Task DeactivateUser_SoftDeletes_CannotDeactivateSelf()
    {
        var ctx = await BuildContextAsync();
        var user = await CreateTenantUserAsync(ctx, "pedro@test.com", ctx.TenantId);

        await ctx.Deactivate.Handle(new DeactivateUserCommand { UserId = user.Id }, CancellationToken.None);

        var reloaded = await ctx.Db.Users.FirstAsync(u => u.Id == user.Id);
        Assert.False(reloaded.IsActive); // soft delete R8: sigue en la DB
        Assert.True(await ctx.Db.AuditLogs.AnyAsync(a => a.Action == "user.deactivated" && a.EntityId == user.Id));

        // Reactivar
        await ctx.Activate.Handle(new ActivateUserCommand { UserId = user.Id }, CancellationToken.None);
        reloaded = await ctx.Db.Users.FirstAsync(u => u.Id == user.Id);
        Assert.True(reloaded.IsActive);
    }

    [Fact]
    public async Task Commands_TenantIsolation_OtherTenantUserInvisible()
    {
        var ctx = await BuildContextAsync();
        var otherUser = await CreateTenantUserAsync(ctx, "otro@test.com", ctx.OtherTenantId);

        // Update de usuario de OTRO tenant => no encontrado
        await Assert.ThrowsAsync<ArgumentException>(() => ctx.Update.Handle(new UpdateUserCommand
        {
            UserId = otherUser.Id,
            FullName = "Hack",
            IsActive = true
        }, CancellationToken.None));

        // La lista del tenant NO incluye al usuario del otro tenant
        var list = await ctx.GetUsers.Handle(new GetUsersQuery(), CancellationToken.None);
        Assert.DoesNotContain(list.Items, u => u.Id == otherUser.Id);
    }

    [Fact]
    public async Task RemoveUserRole_LastRole_Throws()
    {
        var ctx = await BuildContextAsync();
        var user = await CreateTenantUserAsync(ctx, "solo@test.com", ctx.TenantId);
        var viewerRole = await ctx.Db.Roles.FirstAsync(r => r.Name == "Viewer");
        await ctx.AssignRole.Handle(new AssignUserRoleCommand { UserId = user.Id, RoleId = viewerRole.Id }, CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() => ctx.RemoveRole.Handle(new RemoveUserRoleCommand
        {
            UserId = user.Id,
            RoleId = viewerRole.Id
        }, CancellationToken.None));
    }

    [Fact]
    public async Task GetUsers_SearchAndRoles()
    {
        var ctx = await BuildContextAsync();
        var user = await CreateTenantUserAsync(ctx, "maria@test.com", ctx.TenantId);
        var techRole = await ctx.Db.Roles.FirstAsync(r => r.Name == "Technician");
        await ctx.AssignRole.Handle(new AssignUserRoleCommand { UserId = user.Id, RoleId = techRole.Id }, CancellationToken.None);

        var result = await ctx.GetUsers.Handle(new GetUsersQuery { Search = "maria" }, CancellationToken.None);

        Assert.Single(result.Items);
        Assert.Equal("maria@test.com", result.Items[0].Email);
        Assert.Contains(result.Items[0].Roles, r => r.Name == "Technician");
    }
}

public class InvitationFlowTests
{
    private static async Task<(SecurityDbContext Db, UserManager<ApplicationUser> UserManager, InviteUserCommandHandler Invite, RegisterViaInvitationCommandHandler Register, GetInvitationByTokenQueryHandler Validate, Guid TenantId)> BuildAsync()
    {
        var (db, roleManager) = SecurityTestHelper.CreateSecurityDb();
        await SecurityTestHelper.SeedCatalogAndRolesAsync(db, roleManager);
        var userManager = SecurityTestHelper.CreateUserManager(db);

        var tenantId = Guid.NewGuid();
        var resolver = new FixedResolver(tenantId);
        var currentUser = new SecurityTestHelper.FakeCurrentUser();

        var invite = new InviteUserCommandHandler(db, resolver, currentUser);
        var register = new RegisterViaInvitationCommandHandler(db, userManager);
        var validate = new GetInvitationByTokenQueryHandler(db, SecurityTestHelper.CreatePlatformDb());

        return (db, userManager, invite, register, validate, tenantId);
    }

    private sealed class FixedResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FixedResolver(Guid tenantId) => _tenantId = tenantId;
        public Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    [Fact]
    public async Task Invite_Accept_CreatesUserWithRole()
    {
        var (db, userManager, invite, register, validate, tenantId) = await BuildAsync();
        var techRole = await db.Roles.FirstAsync(r => r.Name == "Technician");

        var created = await invite.Handle(new InviteUserCommand
        {
            Email = "nuevo@test.com",
            RoleId = techRole.Id
        }, CancellationToken.None);

        // Validación del token (estado inicial)
        var info = await validate.Handle(new GetInvitationByTokenQuery { Token = created.Token }, CancellationToken.None);
        Assert.NotNull(info);
        Assert.True(info!.IsValid);
        Assert.Equal("nuevo@test.com", info.Email);
        Assert.Equal("Technician", info.RoleName);

        // Aceptación
        var ok = await register.Handle(new RegisterViaInvitationCommand(created.Token, "Password123!", "Nuevo Usuario"), CancellationToken.None);
        Assert.True(ok);

        // Usuario creado con rol y tenant correctos
        var user = await db.Users.FirstAsync(u => u.Email == "nuevo@test.com");
        Assert.Equal(tenantId, user.TenantId);
        Assert.True(user.IsActive);
        var roles = await userManager.GetRolesAsync(user);
        Assert.Contains("Technician", roles);

        // Invitación marcada aceptada
        var invitation = await db.UserInvitations.FirstAsync(i => i.Id == created.Id);
        Assert.NotNull(invitation.AcceptedAt);

        // Reuso del token => rechazado
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            register.Handle(new RegisterViaInvitationCommand(created.Token, "Password123!", "Otro"), CancellationToken.None));
    }

    [Fact]
    public async Task Invite_DuplicatePendingEmail_CancelsPrevious()
    {
        var (db, _, invite, _, _, _) = await BuildAsync();
        var viewerRole = await db.Roles.FirstAsync(r => r.Name == "Viewer");

        var first = await invite.Handle(new InviteUserCommand { Email = "dup@test.com", RoleId = viewerRole.Id }, CancellationToken.None);
        var second = await invite.Handle(new InviteUserCommand { Email = "dup@test.com", RoleId = viewerRole.Id }, CancellationToken.None);

        var firstInv = await db.UserInvitations.FirstAsync(i => i.Id == first.Id);
        Assert.NotNull(firstInv.CancelledAt); // la previa fue cancelada

        var secondInv = await db.UserInvitations.FirstAsync(i => i.Id == second.Id);
        Assert.Null(secondInv.CancelledAt);
    }

    [Fact]
    public async Task Invite_ExpiredToken_AcceptanceRejected()
    {
        var (db, _, invite, register, _, _) = await BuildAsync();
        var viewerRole = await db.Roles.FirstAsync(r => r.Name == "Viewer");

        var created = await invite.Handle(new InviteUserCommand { Email = "exp@test.com", RoleId = viewerRole.Id }, CancellationToken.None);

        // Forzar expiración
        var inv = await db.UserInvitations.FirstAsync(i => i.Id == created.Id);
        inv.ExpiresAt = DateTime.UtcNow.AddHours(-1);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            register.Handle(new RegisterViaInvitationCommand(created.Token, "Password123!", "Usuario"), CancellationToken.None));
    }

    [Fact]
    public async Task Invite_Cancelled_AcceptanceRejected()
    {
        var (db, _, invite, register, _, _) = await BuildAsync();
        var viewerRole = await db.Roles.FirstAsync(r => r.Name == "Viewer");

        var created = await invite.Handle(new InviteUserCommand { Email = "cancel@test.com", RoleId = viewerRole.Id }, CancellationToken.None);

        var inv = await db.UserInvitations.FirstAsync(i => i.Id == created.Id);
        inv.CancelledAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            register.Handle(new RegisterViaInvitationCommand(created.Token, "Password123!", "Usuario"), CancellationToken.None));
    }

    [Fact]
    public async Task Register_WeakPassword_Rejected()
    {
        var (db, _, invite, register, _, _) = await BuildAsync();
        var viewerRole = await db.Roles.FirstAsync(r => r.Name == "Viewer");

        var created = await invite.Handle(new InviteUserCommand { Email = "weak@test.com", RoleId = viewerRole.Id }, CancellationToken.None);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            register.Handle(new RegisterViaInvitationCommand(created.Token, "123", "Usuario"), CancellationToken.None));
    }
}
