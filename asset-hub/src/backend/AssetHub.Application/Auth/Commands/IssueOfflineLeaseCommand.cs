using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Auth;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Auth.Commands;

/// <summary>
/// <c>POST /api/v1/auth/offline-lease</c> (022 §4.4, T065).
///
/// Requiere access token válido: el técnico pide el lease mientras todavía tiene red y lo
/// guarda cifrado en el dispositivo. No hay camino para emitirlo con un refresh token
/// (022 §6.4): el refresh prueba que la sesión sigue viva, pero el lease es una concesión
/// explícita y auditada a un dispositivo concreto.
/// </summary>
public record IssueOfflineLeaseCommand(string? DeviceId) : IRequest<OfflineLeaseResult>;

/// <summary>
/// Respuesta del lease. Incluye <c>jwks</c> además de <c>leaseJwt</c> porque en este
/// momento el dispositivo todavía tiene red: cachear las claves públicas en la misma
/// respuesta elimina el escenario "tengo lease pero no la clave para validarlo" justo
/// antes de bajar al sótano sin señal (021 §7).
/// </summary>
public record OfflineLeaseResult(
    string LeaseJwt,
    int ExpiresIn,
    DateTime IssuedAt,
    bool RequireDeviceLock,
    OfflineLeaseJwks Jwks);

public class IssueOfflineLeaseCommandHandler
    : IRequestHandler<IssueOfflineLeaseCommand, OfflineLeaseResult>
{
    private readonly ISecurityDbContext _securityDb;
    private readonly ICurrentUser _currentUser;
    private readonly OfflineLeaseIssuer _issuer;

    public IssueOfflineLeaseCommandHandler(
        ISecurityDbContext securityDb,
        ICurrentUser currentUser,
        OfflineLeaseIssuer issuer)
    {
        _securityDb = securityDb;
        _currentUser = currentUser;
        _issuer = issuer;
    }

    public async Task<OfflineLeaseResult> Handle(
        IssueOfflineLeaseCommand request,
        CancellationToken cancellationToken)
    {
        var userId = _currentUser.Id
            ?? throw new UnauthorizedAccessException("field_app_tenant_required");

        var user = await _securityDb.Users
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new UnauthorizedAccessException("field_app_user_inactive");

        return await _issuer.IssueAsync(user, request.DeviceId, cancellationToken);
    }
}
