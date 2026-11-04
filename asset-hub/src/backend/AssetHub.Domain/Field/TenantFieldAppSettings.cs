using System;
using AssetHub.Domain.Common;

namespace AssetHub.Domain.Field;

/// <summary>
/// Política del cliente de campo por tenant (022 §6.3).
///
/// Es una tabla y no columnas en <c>Tenant</c> por la misma razón que
/// <see cref="AssetHub.Domain.Inventory.TenantInventorySettings"/>: la configuración de un
/// módulo vive en la base del tenant, no en el catálogo de plataforma, y así el módulo se
/// puede provisionar (o no) sin migrar el agregado <c>Tenant</c> para cada flag nuevo.
///
/// La fila es <b>opcional</b>: un tenant sin fila usa los valores por defecto de esta clase.
/// Eso evita que activar el módulo exija un backfill de configuración para todos los tenants.
/// </summary>
public class TenantFieldAppSettings : ITimestamped
{
    /// <summary>TTL del lease cuando el tenant no configuró otro valor (022 §4.4).</summary>
    public const int DefaultOfflineLeaseHours = 12;

    /// <summary>Piso del rango aceptado: por debajo, el técnico no cubre ni medio turno.</summary>
    public const int MinOfflineLeaseHours = 4;

    /// <summary>Techo del rango aceptado: un lease más largo sobrevive a la revocación del refresh token.</summary>
    public const int MaxOfflineLeaseHours = 24;

    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    /// <summary>
    /// Habilita el cliente de campo. Se persiste en esta fase y se exige en el login de
    /// campo en T082; acá sólo viaja como configuración.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Horas de validez del lease offline. Fuera de
    /// [<see cref="MinOfflineLeaseHours"/>, <see cref="MaxOfflineLeaseHours"/>] la emisión
    /// falla con <c>422</c>: es configuración rota, no un request inválido.
    /// </summary>
    public int OfflineLeaseHours { get; set; } = DefaultOfflineLeaseHours;

    /// <summary>
    /// Exige bloqueo de pantalla del dispositivo para operar con el lease. Lo evalúa el
    /// cliente; el servidor sólo lo publica en la respuesta del lease.
    /// </summary>
    public bool RequireDeviceLock { get; set; } = true;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
