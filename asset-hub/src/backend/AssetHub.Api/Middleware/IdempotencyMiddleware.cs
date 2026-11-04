using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Http;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Sync;
using AssetHub.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace AssetHub.Api.Middleware;

/// <summary>
/// Hace que las mutaciones HTTP sean reintentables sin efectos duplicados.
///
/// Contrato:
/// <list type="bullet">
///   <item>Sin <c>Idempotency-Key</c> el request pasa sin cambios (compatibilidad con la SPA).</item>
///   <item>Con key: se reserva la key en una transacción propia, se ejecuta el handler y se
///   almacena la respuesta. Un reintento devuelve exactamente esa respuesta.</item>
///   <item>La misma key con otro payload es un error del cliente (409 <c>idempotency_key_reuse</c>).</item>
///   <item>Un reintento mientras la primera ejecución sigue en curso recibe 409
///   <c>request_in_progress</c> + <c>Retry-After</c>.</item>
///   <item>Un 5xx libera la key para que el cliente pueda reintentar.</item>
/// </list>
///
/// La reserva se escribe con un <see cref="TenantDbContext"/> de un scope propio:
/// si compartiera el contexto del request, la fila no sería visible para otro request
/// hasta que el handler commitease, y dos reintentos concurrentes ejecutarían dos veces.
/// </summary>
public sealed class IdempotencyMiddleware
{
    public const string HeaderName = "Idempotency-Key";
    public const string ReplayHeaderName = "Idempotent-Replay";

    /// <summary>Tope de cuerpo de request que se bufferea para calcular el fingerprint.</summary>
    private const int MaxRequestBodyBytes = 1024 * 1024;

    /// <summary>Tope de cuerpo de respuesta que se almacena para el replay.</summary>
    private const int MaxResponseBodyBytes = 64 * 1024;

    /// <summary>
    /// Una reserva <c>in_progress</c> más vieja que esto se considera huérfana
    /// (el proceso murió entre la reserva y la respuesta) y puede tomarse de nuevo.
    /// </summary>
    private static readonly TimeSpan ReservationTakeover = TimeSpan.FromMinutes(2);

    private static readonly HashSet<string> MutatingMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        HttpMethods.Post,
        HttpMethods.Put,
        HttpMethods.Patch,
        HttpMethods.Delete,
    };

    /// <summary>
    /// <c>auth</c> tiene su propia semántica con el refresh token; <c>media</c> se
    /// deduplica por hash de contenido en el cliente; <c>jwks</c> es de sólo lectura.
    /// </summary>
    private static readonly string[] ExcludedPrefixes =
    {
        "/api/v1/auth",
        "/api/v1/media",
        "/.well-known",
    };

    private static readonly string[] PersistedResponseHeaders =
    {
        "Location",
        "Content-Location",
        "ETag",
    };

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly RequestDelegate _next;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<IdempotencyMiddleware> _logger;

    public IdempotencyMiddleware(
        RequestDelegate next,
        IServiceScopeFactory scopeFactory,
        ILogger<IdempotencyMiddleware> logger)
    {
        _next = next;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, ITenantResolver tenantResolver)
    {
        if (!ShouldHandle(context))
        {
            await _next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue(HeaderName, out var rawKey))
        {
            await _next(context);
            return;
        }

        var key = rawKey.ToString().Trim();
        if (key.Length == 0)
        {
            await _next(context);
            return;
        }

        if (key.Length > 64 || !Guid.TryParse(key, out _))
        {
            await WriteProblemAsync(
                context,
                StatusCodes.Status400BadRequest,
                "invalid_idempotency_key",
                "Invalid Idempotency-Key",
                "The Idempotency-Key header must be a UUID (v4 or v7).");
            return;
        }

        if (context.Request.ContentLength is > MaxRequestBodyBytes)
        {
            _logger.LogWarning(
                "Request body exceeds the idempotency buffering limit ({Limit} bytes); passing through without idempotency. Method={Method} Path={Path}",
                MaxRequestBodyBytes, context.Request.Method, context.Request.Path);
            await _next(context);
            return;
        }

        var tenantId = tenantResolver.GetCurrentTenantId();
        if (tenantId is null || tenantId == Guid.Empty)
        {
            // Sin tenant no hay forma de aislar la key. No se bloquea el request:
            // los endpoints mutantes reales siempre resuelven tenant por JWT.
            _logger.LogWarning(
                "Idempotency-Key present but no tenant could be resolved; passing through. Method={Method} Path={Path}",
                context.Request.Method, context.Request.Path);
            await _next(context);
            return;
        }

        var userId = tenantResolver.GetCurrentUserId();
        var body = await ReadBodyAsync(context);
        var fingerprint = IdempotencyFingerprint.Compute(
            context.Request.Method,
            context.Request.Path.Value ?? string.Empty,
            context.Request.QueryString.Value,
            tenantId.Value,
            userId,
            body);

        Reservation reservation;
        try
        {
            reservation = await ReserveAsync(tenantId.Value, userId, key, fingerprint, context, context.RequestAborted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // La idempotencia no debe tumbar la operación de negocio: si el storage
            // falla, se ejecuta el request como si la key no se hubiera enviado.
            _logger.LogError(ex, "Failed to reserve idempotency key {Key}; passing through.", key);
            await _next(context);
            return;
        }

        switch (reservation.Outcome)
        {
            case ReservationOutcome.Replay:
                IdempotencyMetrics.Replays.Add(1);
                _logger.LogInformation(
                    "Idempotent replay. Key={Key} Path={Path} Status={Status}",
                    key, context.Request.Path, reservation.Record!.StatusCode);
                await ReplayAsync(context, reservation.Record);
                return;

            case ReservationOutcome.KeyReuse:
                IdempotencyMetrics.KeyReuseConflicts.Add(1);
                _logger.LogWarning(
                    "Idempotency-Key reused with a different payload. Key={Key} Path={Path}",
                    key, context.Request.Path);
                await WriteProblemAsync(
                    context,
                    StatusCodes.Status409Conflict,
                    "idempotency_key_reuse",
                    "Idempotency-Key reused with a different payload",
                    "Generate a new Idempotency-Key for each distinct mutation.");
                return;

            case ReservationOutcome.InProgress:
                IdempotencyMetrics.InProgressConflicts.Add(1);
                context.Response.Headers.RetryAfter = "1";
                await WriteProblemAsync(
                    context,
                    StatusCodes.Status409Conflict,
                    "request_in_progress",
                    "A request with this Idempotency-Key is still in progress",
                    "Retry after the indicated delay; the original response will be replayed.");
                return;
        }

        IdempotencyMetrics.Reserved.Add(1);
        await ExecuteAndRecordAsync(context, reservation.RecordId, key);
    }

    private async Task ExecuteAndRecordAsync(HttpContext context, Guid recordId, string key)
    {
        var originalFeature = context.Features.Get<IHttpResponseBodyFeature>();
        using var buffer = new MemoryStream();

        // Se reemplaza la feature (no sólo Response.Body) para que MVC, SendFile y
        // BodyWriter escriban en el buffer sin conflictos.
        context.Features.Set<IHttpResponseBodyFeature>(
            new StreamResponseBodyFeature(buffer, originalFeature));

        try
        {
            await _next(context);
        }
        catch
        {
            context.Features.Set(originalFeature);
            await ReleaseAsync(recordId, key);
            throw;
        }

        context.Features.Set(originalFeature);

        var captured = buffer.ToArray();
        if (captured.Length > 0)
        {
            var target = originalFeature?.Stream ?? context.Response.Body;
            await target.WriteAsync(captured, context.RequestAborted);
        }

        if (context.Response.StatusCode >= StatusCodes.Status500InternalServerError
            || context.Response.StatusCode == StatusCodes.Status405MethodNotAllowed
            || context.Response.StatusCode == StatusCodes.Status401Unauthorized
            || context.Response.StatusCode == StatusCodes.Status408RequestTimeout)
        {
            await ReleaseAsync(recordId, key);
            return;
        }

        await CompleteAsync(recordId, context, captured, key);
    }

    private static bool ShouldHandle(HttpContext context)
    {
        if (!MutatingMethods.Contains(context.Request.Method))
        {
            return false;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        return !ExcludedPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    private static async Task<string?> ReadBodyAsync(HttpContext context)
    {
        if (context.Request.ContentLength == 0)
        {
            return null;
        }

        context.Request.EnableBuffering();
        using var reader = new StreamReader(
            context.Request.Body,
            Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false,
            leaveOpen: true);

        var body = await reader.ReadToEndAsync(context.RequestAborted);
        context.Request.Body.Position = 0;
        return body;
    }

    private async Task<Reservation> ReserveAsync(
        Guid tenantId,
        Guid? userId,
        string key,
        string fingerprint,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();

        var existing = await db.HttpIdempotencyRecords
            .FirstOrDefaultAsync(r => r.IdempotencyKey == key, cancellationToken);

        if (existing is not null)
        {
            if (!string.Equals(existing.Fingerprint, fingerprint, StringComparison.Ordinal))
            {
                return new Reservation(ReservationOutcome.KeyReuse, Guid.Empty, null);
            }

            if (existing.Status == HttpIdempotencyStatus.InProgress)
            {
                if (DateTime.UtcNow - existing.CreatedAt < ReservationTakeover)
                {
                    return new Reservation(ReservationOutcome.InProgress, Guid.Empty, null);
                }

                // Reserva huérfana: el proceso anterior murió. Se reemplaza.
                _logger.LogWarning(
                    "Taking over a stale in-progress idempotency reservation. Key={Key} CreatedAt={CreatedAt}",
                    key, existing.CreatedAt);
                db.HttpIdempotencyRecords.Remove(existing);
                await db.SaveChangesAsync(cancellationToken);
            }
            else
            {
                return new Reservation(ReservationOutcome.Replay, existing.Id, existing);
            }
        }

        var record = new HttpIdempotencyRecord
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            UserId = userId,
            IdempotencyKey = key,
            Fingerprint = fingerprint,
            Method = context.Request.Method,
            Path = context.Request.Path.Value ?? string.Empty,
            Status = HttpIdempotencyStatus.InProgress,
            CreatedAt = DateTime.UtcNow,
        };

        db.HttpIdempotencyRecords.Add(record);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return new Reservation(ReservationOutcome.Reserved, record.Id, record);
        }
        catch (DbUpdateException)
        {
            // Carrera perdida contra el índice único (TenantId, IdempotencyKey):
            // el ganador ya reservó; se decide según su estado.
            db.ChangeTracker.Clear();

            var winner = await db.HttpIdempotencyRecords
                .FirstOrDefaultAsync(r => r.IdempotencyKey == key, cancellationToken);

            if (winner is null)
            {
                throw;
            }

            if (!string.Equals(winner.Fingerprint, fingerprint, StringComparison.Ordinal))
            {
                return new Reservation(ReservationOutcome.KeyReuse, Guid.Empty, null);
            }

            return winner.Status == HttpIdempotencyStatus.InProgress
                ? new Reservation(ReservationOutcome.InProgress, Guid.Empty, null)
                : new Reservation(ReservationOutcome.Replay, winner.Id, winner);
        }
    }

    private async Task CompleteAsync(Guid recordId, HttpContext context, byte[] captured, string key)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();

            var record = await db.HttpIdempotencyRecords
                .FirstOrDefaultAsync(r => r.Id == recordId, context.RequestAborted);

            if (record is null)
            {
                return;
            }

            var contentType = context.Response.ContentType;
            var isJson = contentType is not null
                && (contentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase)
                    || contentType.StartsWith("application/problem+json", StringComparison.OrdinalIgnoreCase));

            var tooLarge = captured.Length > MaxResponseBodyBytes;
            var hasBody = captured.Length > 0;

            record.Status = HttpIdempotencyStatus.Completed;
            record.StatusCode = context.Response.StatusCode;
            record.ResponseContentType = contentType;
            record.CompletedAt = DateTime.UtcNow;
            record.BodyTruncated = hasBody && (!isJson || tooLarge);
            record.ResponseBody = record.BodyTruncated ? null : Encoding.UTF8.GetString(captured);
            record.ResponseHeadersJson = SerializeResponseHeaders(context);

            await db.SaveChangesAsync(context.RequestAborted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Si no se puede persistir la respuesta, la key queda in_progress y se
            // recuperará por takeover. Nunca se rompe la respuesta ya enviada al cliente.
            _logger.LogError(ex, "Failed to persist idempotency response. Key={Key}", key);
        }
    }

    private async Task ReleaseAsync(Guid recordId, string key)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();

            var record = await db.HttpIdempotencyRecords
                .FirstOrDefaultAsync(r => r.Id == recordId, CancellationToken.None);

            if (record is null)
            {
                return;
            }

            db.HttpIdempotencyRecords.Remove(record);
            await db.SaveChangesAsync(CancellationToken.None);
            IdempotencyMetrics.Released.Add(1);
            _logger.LogInformation("Released idempotency key after a failed execution. Key={Key}", key);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to release idempotency key {Key}", key);
        }
    }

    private static string? SerializeResponseHeaders(HttpContext context)
    {
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in PersistedResponseHeaders)
        {
            var value = context.Response.Headers[name].ToString();
            if (!string.IsNullOrEmpty(value))
            {
                headers[name] = value;
            }
        }

        return headers.Count == 0 ? null : JsonSerializer.Serialize(headers);
    }

    private static async Task ReplayAsync(HttpContext context, HttpIdempotencyRecord record)
    {
        context.Response.StatusCode = record.StatusCode ?? StatusCodes.Status200OK;

        if (!string.IsNullOrEmpty(record.ResponseContentType))
        {
            context.Response.ContentType = record.ResponseContentType;
        }

        if (!string.IsNullOrEmpty(record.ResponseHeadersJson))
        {
            try
            {
                var headers = JsonSerializer.Deserialize<Dictionary<string, string>>(record.ResponseHeadersJson);
                if (headers is not null)
                {
                    foreach (var (name, value) in headers)
                    {
                        context.Response.Headers[name] = value;
                    }
                }
            }
            catch (JsonException)
            {
                // Un header mal serializado no debe impedir el replay del status y el body.
            }
        }

        context.Response.Headers[ReplayHeaderName] = "true";

        if (!record.BodyTruncated && !string.IsNullOrEmpty(record.ResponseBody))
        {
            await context.Response.WriteAsync(record.ResponseBody);
        }
    }

    private static async Task WriteProblemAsync(
        HttpContext context,
        int statusCode,
        string code,
        string title,
        string? detail)
    {
        context.Response.ContentType = "application/problem+json; charset=utf-8";
        context.Response.StatusCode = statusCode;
        context.Response.Headers.Remove("Content-Length");

        var problem = new Dictionary<string, object?>
        {
            ["type"] = "https://assethub.app/docs/errors/" + code,
            ["title"] = title,
            ["status"] = statusCode,
            ["code"] = code,
        };

        if (!string.IsNullOrEmpty(detail))
        {
            problem["detail"] = detail;
        }

        await context.Response.WriteAsync(JsonSerializer.Serialize(problem, JsonOptions));
    }

    private enum ReservationOutcome
    {
        Reserved,
        Replay,
        KeyReuse,
        InProgress,
    }

    private readonly record struct Reservation(
        ReservationOutcome Outcome,
        Guid RecordId,
        HttpIdempotencyRecord? Record);
}
