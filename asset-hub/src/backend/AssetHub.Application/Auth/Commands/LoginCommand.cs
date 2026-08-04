using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Security;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Auth.Commands;

public record LoginCommand(string Email, string Password, string? MfaCode = null) : IRequest<LoginResult>;

public record LoginResult(string AccessToken, string RefreshToken, int ExpiresIn, string? TenantSlug, string? TenantName, List<string> Roles);

public class LoginCommandHandler : IRequestHandler<LoginCommand, LoginResult>
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly ISecurityDbContext _securityDb;
    private readonly IPlatformDbContext _platformDb;

    public LoginCommandHandler(UserManager<ApplicationUser> userManager, IJwtTokenGenerator jwtTokenGenerator, ISecurityDbContext securityDb, IPlatformDbContext platformDb)
    {
        _userManager = userManager;
        _jwtTokenGenerator = jwtTokenGenerator;
        _securityDb = securityDb;
        _platformDb = platformDb;
    }

    public async Task<LoginResult> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user == null || !await _userManager.CheckPasswordAsync(user, request.Password))
        {
            throw new UnauthorizedAccessException("Credenciales inválidas");
        }

        var roles = await _userManager.GetRolesAsync(user);
        
        var permissions = new List<string>();
        if (roles.Any())
        {
            var roleIds = await _securityDb.Roles
                .Where(r => roles.Contains(r.Name!))
                .Select(r => r.Id)
                .ToListAsync(cancellationToken);

            var permissionIds = await _securityDb.RolePermissions
                .Where(rp => roleIds.Contains(rp.RoleId))
                .Select(rp => rp.PermissionId)
                .ToListAsync(cancellationToken);

            permissions = await _securityDb.Permissions
                .Where(p => permissionIds.Contains(p.Id))
                .Select(p => p.Code)
                .ToListAsync(cancellationToken);
        }

        var accessToken = _jwtTokenGenerator.GenerateAccessToken(user, roles, permissions);
        var refreshTokenStr = _jwtTokenGenerator.GenerateRefreshToken();

        var rt = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = refreshTokenStr, // Simple storage for now, ideally hashed
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            FamilyId = Guid.NewGuid()
        };

        _securityDb.RefreshTokens.Add(rt);
        await _securityDb.SaveChangesAsync(cancellationToken);

        string? tenantSlug = null;
        string? tenantName = null;
        
        if (user.TenantId.HasValue)
        {
            var tenant = await _platformDb.Tenants.FirstOrDefaultAsync(t => t.Id == user.TenantId.Value, cancellationToken);
            if (tenant != null)
            {
                tenantSlug = tenant.Slug;
                tenantName = tenant.Name;
            }
        }

        return new LoginResult(accessToken, refreshTokenStr, 15 * 60, tenantSlug, tenantName, roles.ToList());
    }
}
