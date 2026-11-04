using System;
using System.Collections.Generic;
using AssetHub.Domain.Security;

namespace AssetHub.Application.Interfaces;

public interface IJwtTokenGenerator
{
    string GenerateAccessToken(ApplicationUser user, IList<string> roles, IList<string> permissions);

    string GenerateRefreshToken();

    /// <summary>
    /// Emite el lease offline firmado (022 §4.4). No es un access token: no lleva roles ni
    /// permisos, y el middleware de autenticación no lo acepta.
    /// </summary>
    /// <param name="user">Usuario activo; <c>sub</c> sale de su id.</param>
    /// <param name="tenantId">Tenant del usuario; viaja en <c>tid</c>.</param>
    /// <param name="deviceId">UUID estable del dispositivo; viaja en <c>device_id</c>.</param>
    /// <param name="ttlHours">Horas de validez, ya acotadas por el llamador a [4, 24].</param>
    /// <param name="issuedAt">Instante de emisión; <c>iat</c> y <c>exp</c> se derivan de él.</param>
    string GenerateOfflineLease(
        ApplicationUser user,
        Guid tenantId,
        string deviceId,
        int ttlHours,
        DateTime issuedAt);
}
