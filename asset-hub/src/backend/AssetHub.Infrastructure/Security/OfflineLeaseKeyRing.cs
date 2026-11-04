using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using AssetHub.Application.Auth;
using AssetHub.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace AssetHub.Infrastructure.Security;

/// <summary>
/// Material de firma del lease offline (022 §6.2) y su mitad pública, publicada en
/// <c>GET /.well-known/jwks.json</c>.
///
/// **Por qué un anillo de claves RSA propio y no la clave del access token**: el access
/// token se firma hoy con HS256 sobre <c>JwtSettings:Secret</c>. Un JWKS existe para
/// publicar claves <i>públicas</i>; publicar la clave simétrica del access token sería
/// entregar el secreto con el que se firman todas las credenciales de API. El plan §6.1
/// dice "la misma clave que el access token", pero eso sólo es cierto si el access token
/// firma asimétrico. Mientras firme HS256, la única forma de cumplir §6.2 sin filtrar el
/// secreto es un par RSA dedicado al lease. Efecto colateral deseable: el lease no puede
/// validar contra la API ni por configuración ni por accidente, porque el middleware de
/// auth sólo acepta HS256 (ver <c>OfflineLeaseScopeTests</c>).
///
/// **Rotación**: se publican la clave vigente y la anterior. Con leases de 12–24 h, un
/// solape de 30 días cubre de sobra a cualquier dispositivo que haya estado sin red
/// mientras se rotaba (022 §6.2).
///
/// **Configuración** (<c>appsettings</c>, secret store o variables de entorno):
/// <code>
/// "JwtSettings": {
///   "OfflineLease": {
///     "Keys": [
///       { "Kid": "k-2026-10", "PrivateKeyPem": "-----BEGIN PRIVATE KEY-----\n..." },
///       { "Kid": "k-2026-07", "PrivateKeyBase64": "<base64 del PEM>" }
///     ]
///   }
/// }
/// </code>
/// La primera entrada es la vigente; el resto se publica para verificar leases ya
/// emitidos. Sin configuración se genera una clave efímera por proceso: sirve para
/// desarrollo y tests, pero invalida los leases emitidos al reiniciar.
/// </summary>
public sealed class OfflineLeaseKeyRing : IOfflineLeaseKeyProvider, IDisposable
{
    /// <summary>Ruta pública del documento de claves.</summary>
    public const string JwksPath = "/.well-known/jwks.json";

    /// <summary>Cache del JWKS en el cliente y en cualquier CDN intermedio: 24 h (022 §6.2).</summary>
    public const string JwksCacheControl = "public, max-age=86400";

    private const string ConfigSection = "JwtSettings:OfflineLease:Keys";

    private readonly List<RsaKey> _keys = new();
    private bool _disposed;

    public OfflineLeaseKeyRing(IConfiguration configuration, ILogger<OfflineLeaseKeyRing> logger)
    {
        foreach (var entry in configuration.GetSection(ConfigSection).GetChildren())
        {
            var kid = entry["Kid"];
            if (string.IsNullOrWhiteSpace(kid))
            {
                logger.LogWarning(
                    "Offline lease key at {Section}:{Index} has no Kid and will be ignored.",
                    ConfigSection,
                    entry.Key);
                continue;
            }

            var pem = ReadPem(entry);
            if (pem is null)
            {
                logger.LogWarning(
                    "Offline lease key {Kid} has neither PrivateKeyPem nor PrivateKeyBase64 and will be ignored.",
                    kid);
                continue;
            }

            try
            {
                var rsa = RSA.Create();
                rsa.ImportFromPem(pem);
                _keys.Add(new RsaKey(rsa, kid));
            }
            catch (Exception ex) when (ex is ArgumentException or CryptographicException)
            {
                // No se degrada a "seguir sin esta clave": una clave mal escrita en el índice
                // 0 dejaría al servidor firmando con la anterior sin que nadie lo note.
                throw new InvalidOperationException(
                    $"Offline lease key '{kid}' could not be loaded from {ConfigSection}:{entry.Key}.",
                    ex);
            }
        }

        if (_keys.Count == 0)
        {
            // Clave efímera: el servicio arranca (dev, tests, CI) pero los leases emitidos
            // mueren con el proceso. En producción las claves son configuración obligatoria.
            _keys.Add(new RsaKey(RSA.Create(2048), EphemeralKeyId()));
            logger.LogWarning(
                "No offline lease signing keys configured under {Section}. Using an ephemeral RSA key {Kid}: " +
                "offline leases will stop validating after a restart.",
                ConfigSection,
                _keys[0].Kid);
        }
        else if (_keys[0].KeySize < 2048)
        {
            logger.LogWarning(
                "Offline lease signing key {Kid} is {KeySize} bits; RS256 expects at least 2048.",
                _keys[0].Kid,
                _keys[0].KeySize);
        }
    }

    /// <summary>Credenciales de firma vigentes (índice 0).</summary>
    public SigningCredentials CurrentSigningCredentials => _keys[0].Credentials;

    /// <inheritdoc />
    public string CurrentKeyId => _keys[0].Kid;

    /// <inheritdoc />
    public OfflineLeaseJwks GetPublicJwks() =>
        new(_keys.Select(k => k.PublicJwk).ToList());

    public void Dispose()
    {
        if (_disposed) return;
        foreach (var key in _keys) key.Dispose();
        _disposed = true;
    }

    private static string? ReadPem(IConfigurationSection entry)
    {
        var pem = entry["PrivateKeyPem"];
        if (!string.IsNullOrWhiteSpace(pem))
        {
            // JSON no admite saltos de línea crudos: llegan escapados como "\n".
            return pem.Replace("\\n", "\n", StringComparison.Ordinal);
        }

        var base64 = entry["PrivateKeyBase64"];
        if (string.IsNullOrWhiteSpace(base64)) return null;

        try
        {
            return System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(base64));
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private static string EphemeralKeyId() =>
        "ephemeral-" + Guid.NewGuid().ToString("N")[..8];

    private sealed class RsaKey : IDisposable
    {
        private readonly RSA _rsa;

        public RsaKey(RSA rsa, string kid)
        {
            _rsa = rsa;
            Kid = kid;
            KeySize = rsa.KeySize;

            var parameters = rsa.ExportParameters(includePrivateParameters: false);

            // RFC 7518 §6.3.1: N y E en base64url sin padding. `Base64UrlEncoder` es el mismo
            // que usa el stack de JWT, así que el cliente no tiene que normalizar nada.
            PublicJwk = new OfflineLeaseJwk(
                Kty: "RSA",
                Use: "sig",
                Alg: SecurityAlgorithms.RsaSha256,
                Kid: kid,
                N: Base64UrlEncoder.Encode(parameters.Modulus),
                E: Base64UrlEncoder.Encode(parameters.Exponent));

            var securityKey = new RsaSecurityKey(rsa) { KeyId = kid };
            Credentials = new SigningCredentials(securityKey, SecurityAlgorithms.RsaSha256);
        }

        public string Kid { get; }

        public int KeySize { get; }

        public OfflineLeaseJwk PublicJwk { get; }

        public SigningCredentials Credentials { get; }

        public void Dispose() => _rsa.Dispose();
    }
}
