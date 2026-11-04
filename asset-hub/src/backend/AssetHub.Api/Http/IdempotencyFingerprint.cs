using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace AssetHub.Api.Http;

/// <summary>
/// Calcula el fingerprint de un request idempotente.
///
/// El objetivo no es la seguridad sino la equivalencia semántica: dos requests que
/// significan lo mismo deben producir el mismo hash, aunque difieran en el orden de
/// las propiedades JSON o en el whitespace.
/// </summary>
public static class IdempotencyFingerprint
{
    /// <summary>
    /// SHA-256 en hex minúsculas de method + path + query + tenant + user + body canónico.
    /// El query string forma parte del fingerprint porque dos mutaciones con distinto
    /// filtro no son la misma operación.
    /// </summary>
    public static string Compute(
        string method,
        string path,
        string? queryString,
        Guid tenantId,
        Guid? userId,
        string? body)
    {
        var payload = string.Join(
            '\n',
            (method ?? string.Empty).ToUpperInvariant(),
            (path ?? string.Empty).ToLowerInvariant(),
            queryString ?? string.Empty,
            tenantId.ToString("N"),
            userId?.ToString("N") ?? "-",
            CanonicalizeJson(body));

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>
    /// Normaliza JSON: propiedades de objeto ordenadas ordinalmente, sin espacios,
    /// arrays en su orden original (el orden de un array es semántico).
    /// Si el cuerpo no es JSON válido se usa el texto tal cual (trim) para no
    /// bloquear requests legítimos con content-types inesperados.
    /// </summary>
    public static string CanonicalizeJson(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return string.Empty;
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            using var output = new MemoryStream();
            using (var writer = new Utf8JsonWriter(output, new JsonWriterOptions { Indented = false }))
            {
                WriteCanonical(document.RootElement, writer);
            }

            return Encoding.UTF8.GetString(output.ToArray());
        }
        catch (JsonException)
        {
            return body.Trim();
        }
    }

    private static void WriteCanonical(JsonElement element, Utf8JsonWriter writer)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in element.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    WriteCanonical(property.Value, writer);
                }

                writer.WriteEndObject();
                break;

            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in element.EnumerateArray())
                {
                    WriteCanonical(item, writer);
                }

                writer.WriteEndArray();
                break;

            default:
                element.WriteTo(writer);
                break;
        }
    }
}
