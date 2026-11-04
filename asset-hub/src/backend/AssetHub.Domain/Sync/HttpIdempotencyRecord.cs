using System;

namespace AssetHub.Domain.Sync;

/// <summary>
/// Registro de una mutación HTTP identificada por <c>Idempotency-Key</c>.
/// Permite que un cliente offline reintente la misma operación sin duplicar efectos:
/// la respuesta original se almacena y se reproduce en cada reintento.
///
/// El registro está siempre acotado a un tenant: la misma key enviada por dos tenants
/// distintos son dos operaciones distintas (ver query filter en TenantDbContext).
/// </summary>
public class HttpIdempotencyRecord
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>Usuario que originó la mutación. Puede ser nulo para operaciones anónimas.</summary>
    public Guid? UserId { get; set; }

    /// <summary>Valor del header <c>Idempotency-Key</c>. Único por tenant.</summary>
    public string IdempotencyKey { get; set; } = string.Empty;

    /// <summary>
    /// SHA-256 (hex) de method + path + tenant + user + body canónico.
    /// Detecta la reutilización de una key con un payload distinto.
    /// </summary>
    public string Fingerprint { get; set; } = string.Empty;

    public string Method { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    /// <summary>Una de las constantes de <see cref="HttpIdempotencyStatus"/>.</summary>
    public string Status { get; set; } = HttpIdempotencyStatus.InProgress;

    public int? StatusCode { get; set; }

    /// <summary>Cuerpo de la respuesta original (sólo JSON, con tope de tamaño).</summary>
    public string? ResponseBody { get; set; }

    public string? ResponseContentType { get; set; }

    /// <summary>Headers seleccionados de la respuesta original serializados como JSON.</summary>
    public string? ResponseHeadersJson { get; set; }

    /// <summary>
    /// True cuando la respuesta original superó el tope de almacenamiento o no era JSON.
    /// El replay devuelve el status original sin cuerpo: nunca un cuerpo parcial.
    /// </summary>
    public bool BodyTruncated { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? CompletedAt { get; set; }
}

public static class HttpIdempotencyStatus
{
    /// <summary>Reserva tomada; el handler todavía se está ejecutando.</summary>
    public const string InProgress = "in_progress";

    /// <summary>Respuesta almacenada y reproducible.</summary>
    public const string Completed = "completed";

    /// <summary>Reservado para fallos definitivos que se deciden persistir en el futuro.</summary>
    public const string Failed = "failed";
}
