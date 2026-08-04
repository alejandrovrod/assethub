using System.Threading;
using System.Threading.Tasks;
using AssetHub.Domain.Security;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Interfaces;

public interface ISecurityDbContext
{
    DbSet<ApplicationRole> Roles { get; set; }
    DbSet<RolePermission> RolePermissions { get; set; }
    DbSet<Permission> Permissions { get; set; }
    DbSet<RefreshToken> RefreshTokens { get; set; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
