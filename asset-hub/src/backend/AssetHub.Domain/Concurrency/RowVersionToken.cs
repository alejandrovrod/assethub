using System;

namespace AssetHub.Domain.Concurrency;

/// <summary>
/// Codificación del <c>rowversion</c> como token base64url (RFC 4648 §5, sin padding).
///
/// Por qué base64url y no base64: el token viaja en el header <c>ETag</c> y en el body
/// JSON de los DTO. base64 estándar usa <c>+</c>, <c>/</c> y <c>=</c>, que son problemáticos
/// en headers y en query strings. base64url es seguro en ambos contextos.
///
/// El token NO es la versión semántica de la fila: es opaco para el cliente. El cliente
/// lo guarda y lo devuelve en <c>If-Match</c>; nunca lo interpreta.
/// </summary>
public static class RowVersionToken
{
    /// <summary>
    /// Devuelve <c>null</c> cuando no hay versión (fila recién creada en memoria o
    /// proveedor sin rowversion). Un token vacío no es una versión válida.
    /// </summary>
    public static string? ToToken(byte[]? rowVersion)
    {
        if (rowVersion is null || rowVersion.Length == 0)
        {
            return null;
        }

        return Convert.ToBase64String(rowVersion)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    /// <summary>
    /// Decodifica un token. Devuelve <c>null</c> si el token no es base64url estricto:
    /// aceptar variantes laxas produciría 412 imposibles de depurar (el cliente cree
    /// que manda la versión correcta y el servidor no la reconoce).
    /// </summary>
    public static byte[]? FromToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 64)
        {
            return null;
        }

        foreach (var c in token)
        {
            var valid = (c >= 'A' && c <= 'Z')
                || (c >= 'a' && c <= 'z')
                || (c >= '0' && c <= '9')
                || c == '-'
                || c == '_';

            if (!valid)
            {
                return null;
            }
        }

        var normalized = token.Replace('-', '+').Replace('_', '/');
        normalized = (normalized.Length % 4) switch
        {
            2 => normalized + "==",
            3 => normalized + "=",
            0 => normalized,
            _ => null!,
        };

        if (normalized is null)
        {
            return null;
        }

        try
        {
            return Convert.FromBase64String(normalized);
        }
        catch (FormatException)
        {
            return null;
        }
    }
}
