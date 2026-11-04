using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Auth.Commands;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Field;
using AssetHub.Domain.Security;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Auth;

/// <summary>
/// Emite el lease offline (022 §6.1). Vive fuera del handler del comando porque hay dos
/// productores del mismo documento: <c>POST /auth/offline-lease</c> (T065) y cada
/// <c>POST /auth/refresh</c> exitoso (T066). Duplicar el acotado de TTL y la selección de
/// política en los dos caminos es exactamente cómo se llega a un lease de 12 h por un lado
/// y de 100 h por el otro.
/// </summary>
public sealed class OfflineLeaseIssuer
{
    private readonly ITenantDbContext _tenantDb;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly IOfflineLeaseKeyProvider _keyProvider;

    public OfflineLeaseIssuer(
        ITenantDbContext tenantDb,
        IJwtTokenGenerator jwtTokenGenerator,
        IOfflineLeaseKeyProvider keyProvider)
    {
        _tenantDb = tenantDb;
        _jwtTokenGenerator = jwtTokenGenerator;
        _keyProvider = keyProvider;
    }

    /// <summary>
    /// Emite un lease para <paramref name="user"/> en el dispositivo indicado.
    /// </summary>
    /// <exception cref="ValidationException"><c>deviceId</c> no es un UUID.</exception>
    /// <exception cref="UnauthorizedAccessException">Usuario inactivo o sin tenant.</exception>
    /// <exception cref="InvalidFieldAppSettingsException">TTL del tenant fuera de rango.</exception>
    public async Task<OfflineLeaseResult> IssueAsync(
        ApplicationUser user,
        string? deviceId,
        CancellationToken cancellationToken)
    {
        // El contrato pide `format: uuid` y el cliente lo usa como clave estable de
        // dispositivo: un id libre ("mi-celular") no sirve para revocar ni para auditar.
        if (!Guid.TryParse(deviceId, out var parsedDeviceId) || parsedDeviceId == Guid.Empty)
        {
            throw new ValidationException("deviceId", "device_id_invalid");
        }

        // Se revalida acá aunque el refresh ya lo haya hecho: el usuario pudo desactivarse
        // entre el refresh y la emisión, y un lease de 12 h emitido a una cuenta dada de
        // baja sobrevive a la revocación del refresh token (022 §4.4, riesgos aceptados).
        if (!user.IsActive)
        {
            throw new UnauthorizedAccessException("field_app_user_inactive");
        }

        var tenantId = user.TenantId
            ?? throw new UnauthorizedAccessException("field_app_tenant_required");

        var settings = await _tenantDb.TenantFieldAppSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken);

        // El flag `enabled` es la puerta de entrada del cliente de campo: si el módulo
        // no está habilitado para el tenant, no se emite lease y el dispositivo no puede
        // operar offline (022 T082).
        if (settings is not null && !settings.Enabled)
        {
            throw new UnauthorizedAccessException("field_app_disabled");
        }

        var hours = settings?.OfflineLeaseHours ?? TenantFieldAppSettings.DefaultOfflineLeaseHours;

        if (hours < TenantFieldAppSettings.MinOfflineLeaseHours ||
            hours > TenantFieldAppSettings.MaxOfflineLeaseHours)
        {
            throw new InvalidFieldAppSettingsException(
                hours,
                TenantFieldAppSettings.MinOfflineLeaseHours,
                TenantFieldAppSettings.MaxOfflineLeaseHours);
        }

        // `iat` y el `issuedAt` de la respuesta salen del mismo instante: el cliente calcula
        // el vencimiento absoluto desde `issuedAt` + `expiresIn` y lo compara con `exp`.
        var issuedAt = DateTime.UtcNow;

        var lease = _jwtTokenGenerator.GenerateOfflineLease(
            user,
            tenantId,
            parsedDeviceId.ToString("D"),
            hours,
            issuedAt);

        return new OfflineLeaseResult(
            lease,
            hours * 3600,
            issuedAt,
            settings?.RequireDeviceLock ?? true,
            _keyProvider.GetPublicJwks());
    }
}
