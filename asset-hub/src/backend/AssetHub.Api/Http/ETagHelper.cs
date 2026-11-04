using System;
using AssetHub.Domain.Concurrency;

namespace AssetHub.Api.Http;

/// <summary>
/// Traduce entre el <c>rowversion</c> de la fila y el header HTTP <c>ETag</c>.
///
/// Reglas que aplica (RFC 9110 §13.1.1):
/// <list type="bullet">
///   <item>El ETag es <b>strong</b>: se compara byte a byte, nunca por debilidad semántica.
///   Por eso se rechazan los ETags débiles (<c>W/"..."</c>): aceptarlos convertiría un
///   <c>If-Match</c> en un no-op silencioso.</item>
///   <item><c>*</c> significa "si el recurso existe", sin comparar versión.</item>
///   <item>Se acepta un único ETag. Una lista no se puede evaluar contra una sola fila
///   sin cargar todas las versiones, y devolver <c>412</c> por una lista válida sería peor
///   que rechazarla explícitamente.</item>
/// </list>
/// </summary>
public static class ETagHelper
{
    public const string Any = "*";

    /// <summary>ETag listo para el header, con comillas. Cadena vacía si no hay versión.</summary>
    public static string ToHeader(byte[]? rowVersion)
    {
        var token = RowVersionToken.ToToken(rowVersion);
        return string.IsNullOrEmpty(token) ? string.Empty : ToHeader(token);
    }

    /// <summary>ETag listo para el header a partir del token ya codificado del DTO.</summary>
    public static string ToHeader(string? token)
        => string.IsNullOrEmpty(token) ? string.Empty : "\"" + token + "\"";

    /// <summary>
    /// Interpreta el header <c>If-Match</c>.
    /// </summary>
    public static IfMatchResult Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return IfMatchResult.Missing();
        }

        var value = raw.Trim();

        if (value == Any)
        {
            return IfMatchResult.ForAny();
        }

        if (value.StartsWith("W/", StringComparison.Ordinal))
        {
            return IfMatchResult.Invalid("Weak ETags are not supported for If-Match; use the strong ETag returned by the API.");
        }

        if (value.Contains(','))
        {
            return IfMatchResult.Invalid("If-Match must carry exactly one strong ETag.");
        }

        if (value.Length < 2 || value[0] != '"' || value[^1] != '"')
        {
            return IfMatchResult.Invalid("If-Match must be a quoted ETag, for example \"3\".");
        }

        var version = RowVersionToken.FromToken(value[1..^1]);
        return version is null
            ? IfMatchResult.Invalid("The If-Match value is not a valid version token.")
            : IfMatchResult.ForVersion(version);
    }
}

public enum IfMatchKind
{
    Missing,
    Any,
    Version,
    Invalid,
}

public sealed record IfMatchResult(IfMatchKind Kind, byte[]? Version, string? Error)
{
    public static IfMatchResult Missing() => new(IfMatchKind.Missing, null, null);

    public static IfMatchResult ForAny() => new(IfMatchKind.Any, null, null);

    public static IfMatchResult ForVersion(byte[] version) => new(IfMatchKind.Version, version, null);

    public static IfMatchResult Invalid(string error) => new(IfMatchKind.Invalid, null, error);
}
