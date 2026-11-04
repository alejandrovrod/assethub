using System;
using System.Globalization;
using System.Text;
using AssetHub.Domain.Exceptions;

namespace AssetHub.Application.Common.Cursors;

/// <summary>
/// Posición dentro de un stream ordenado por <c>(UpdatedAt, Id)</c>.
///
/// Paginar con <c>OFFSET</c> sobre una tabla que se está escribiendo devuelve filas
/// duplicadas y saltea otras: si entre dos páginas entra una fila con fecha anterior, el
/// offset corre y una fila que nunca se envió queda fuera del sync para siempre. Keyset
/// compara contra el último elemento entregado, así que el punto de corte es un valor y no
/// una posición, y las inserciones concurrentes no lo mueven.
///
/// Se codifica como <c>base64url("{ticks}:{id:N}")</c> y es **opaco** para el cliente: lo
/// recibe en <c>nextCursor</c> y lo devuelve en <c>since</c>. Nadie fuera del servidor lo
/// interpreta.
/// </summary>
public readonly record struct KeysetCursor(DateTime UpdatedAt, Guid Id)
{
    private const char Separator = ':';

    public static string Encode(DateTime updatedAt, Guid id)
    {
        var raw = string.Concat(
            updatedAt.Ticks.ToString(CultureInfo.InvariantCulture),
            Separator.ToString(),
            id.ToString("N"));

        return ToBase64Url(Encoding.UTF8.GetBytes(raw));
    }

    /// <summary>
    /// Decodifica un cursor recibido por query string.
    ///
    /// Cualquier cosa que no sea un cursor que este servidor emitió se rechaza con
    /// <c>400 invalid_cursor</c> en vez de ignorarse: un cursor corrupto silenciosamente
    /// tratado como "primera página" haría que el cliente re-descargue todo y crea que
    /// sincronizó bien. El cliente tiene que saber que su estado local ya no es confiable.
    /// </summary>
    public static KeysetCursor Decode(string cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor))
        {
            throw Invalid();
        }

        byte[] bytes;
        try
        {
            bytes = FromBase64Url(cursor);
        }
        catch (FormatException)
        {
            throw Invalid();
        }

        var raw = Encoding.UTF8.GetString(bytes);
        var separator = raw.IndexOf(Separator);

        if (separator <= 0 || separator == raw.Length - 1)
        {
            throw Invalid();
        }

        var ticksPart = raw[..separator];
        var idPart = raw[(separator + 1)..];

        if (!long.TryParse(ticksPart, NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
            || ticks < DateTime.MinValue.Ticks
            || ticks > DateTime.MaxValue.Ticks)
        {
            throw Invalid();
        }

        if (!Guid.TryParseExact(idPart, "N", out var id))
        {
            throw Invalid();
        }

        return new KeysetCursor(new DateTime(ticks, DateTimeKind.Utc), id);
    }

    private static DomainException Invalid() => new(
        "invalid_cursor",
        "The sync cursor is not valid. Omit 'since' to start from the beginning.");

    private static string ToBase64Url(byte[] bytes)
        => Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');

        return Convert.FromBase64String(normalized.PadRight(
            normalized.Length + ((4 - (normalized.Length % 4)) % 4),
            '='));
    }
}
