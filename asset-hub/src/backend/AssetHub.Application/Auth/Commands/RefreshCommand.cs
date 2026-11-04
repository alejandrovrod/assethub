using System.Threading;
using System.Threading.Tasks;
using MediatR;

using System;
using System.Linq;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Auth.Commands;

/// <param name="DeviceId">
/// Si viene, la respuesta incluye un lease offline nuevo para ese dispositivo (022 §4.4,
/// T066). Es opcional y <c>apps/web</c> no lo manda: el lease es del cliente de campo, y
/// emitirlo a un navegador de escritorio no aporta nada.
/// </param>
public record RefreshCommand(string RefreshToken, string? DeviceId = null) : IRequest<RefreshResult>;

/// <param name="OfflineLease">
/// <c>null</c> cuando el refresh no pidió lease. Va anidado (y no aplanado) para que el
/// cliente distinga "no pedí lease" de "pedí lease" sin mirar campos sueltos.
/// </param>
public record RefreshResult(
    string AccessToken,
    string RefreshToken,
    int ExpiresIn,
    OfflineLeaseResult? OfflineLease = null);


public class RefreshCommandHandler : IRequestHandler<RefreshCommand, RefreshResult>
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly ISecurityDbContext _securityDb;
    private readonly OfflineLeaseIssuer _offlineLeaseIssuer;

    public RefreshCommandHandler(
        UserManager<ApplicationUser> userManager,
        IJwtTokenGenerator jwtTokenGenerator,
        ISecurityDbContext securityDb,
        OfflineLeaseIssuer offlineLeaseIssuer)
    {
        _userManager = userManager;
        _jwtTokenGenerator = jwtTokenGenerator;
        _securityDb = securityDb;
        _offlineLeaseIssuer = offlineLeaseIssuer;
    }

    public async Task<RefreshResult> Handle(RefreshCommand request, CancellationToken cancellationToken)
    {
        var rt = await _securityDb.RefreshTokens
            .FirstOrDefaultAsync(r => r.TokenHash == request.RefreshToken, cancellationToken);

        if (rt == null)
        {
            throw new UnauthorizedAccessException("Refresh token no encontrado");
        }

        if (rt.RevokedAt != null)
        {
            // Reuso detectado! Revocamos toda la familia
            var family = await _securityDb.RefreshTokens
                .Where(r => r.FamilyId == rt.FamilyId && r.RevokedAt == null)
                .ToListAsync(cancellationToken);
            
            foreach (var token in family)
            {
                token.RevokedAt = DateTime.UtcNow;
            }
            await _securityDb.SaveChangesAsync(cancellationToken);
            throw new UnauthorizedAccessException("Intento de reuso de token detectado. Cadena revocada.");
        }

        if (rt.ExpiresAt < DateTime.UtcNow)
        {
            throw new UnauthorizedAccessException("Refresh token expirado");
        }

        var user = await _userManager.FindByIdAsync(rt.UserId.ToString());
        if (user == null || !user.IsActive)
        {
            throw new UnauthorizedAccessException("Usuario inválido o inactivo");
        }

        // Revocar el token usado
        rt.RevokedAt = DateTime.UtcNow;

        var roles = await _userManager.GetRolesAsync(user);

        // Permisos filtrados por tenant (misma logica que LoginCommandHandler)
        var permissions = new System.Collections.Generic.List<string>();
        if (roles.Any())
        {
            var roleIds = await _securityDb.Roles
                .Where(r => roles.Contains(r.Name!))
                .Select(r => r.Id)
                .ToListAsync(cancellationToken);

            var permQuery = _securityDb.RolePermissions
                .Where(rp => roleIds.Contains(rp.RoleId));

            if (user.TenantId.HasValue)
            {
                permQuery = permQuery.Where(rp => rp.TenantId == user.TenantId.Value);
            }

            var permissionIds = await permQuery
                .Select(rp => rp.PermissionId)
                .Distinct()
                .ToListAsync(cancellationToken);

            permissions = await _securityDb.Permissions
                .Where(p => permissionIds.Contains(p.Id))
                .Select(p => p.Code)
                .ToListAsync(cancellationToken);
        }

        var newAccessToken = _jwtTokenGenerator.GenerateAccessToken(user, roles, permissions);
        var newRefreshTokenStr = _jwtTokenGenerator.GenerateRefreshToken();

        var newRt = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = newRefreshTokenStr,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            FamilyId = rt.FamilyId
        };

        var newRtId = Guid.NewGuid();
        newRt.ReplacedByTokenId = newRtId; // Fake it for now since TokenHash isn't Guid

        rt.ReplacedByTokenId = newRtId;

        _securityDb.RefreshTokens.Add(newRt);
        await _securityDb.SaveChangesAsync(cancellationToken);

        // El lease se emite después de persistir la rotación: si la emisión falla, el
        // refresh token nuevo ya quedó guardado y el cliente no pierde la sesión. El error
        // se propaga a propósito (no se traga): un lease que no se pudo emitir y un 200 con
        // "offlineLease: null" se ven igual en el cliente, y la diferencia es que el técnico
        // se entera al salir al campo, sin red, cuando ya no puede hacer nada.
        OfflineLeaseResult? offlineLease = null;
        if (!string.IsNullOrWhiteSpace(request.DeviceId))
        {
            offlineLease = await _offlineLeaseIssuer.IssueAsync(user, request.DeviceId, cancellationToken);
        }

        return new RefreshResult(newAccessToken, newRefreshTokenStr, 15 * 60, offlineLease);
    }
}
