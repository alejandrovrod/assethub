using System;
using System;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Security;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Infrastructure.Persistence;

public class SecurityDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>, ISecurityDbContext
{
    public SecurityDbContext(DbContextOptions<SecurityDbContext> options) : base(options)
    {
    }

    public DbSet<Permission> Permissions { get; set; } = null!;
    public DbSet<RolePermission> RolePermissions { get; set; } = null!;
    public DbSet<RefreshToken> RefreshTokens { get; set; } = null!;
    public DbSet<UserInvitation> UserInvitations { get; set; } = null!;
    public DbSet<AuditLog> AuditLogs { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.HasDefaultSchema("security");

        builder.Entity<RolePermission>()
            .HasKey(rp => new { rp.RoleId, rp.PermissionId });
    }
}
