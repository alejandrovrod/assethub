using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using AssetHub.Application.Auth;
using AssetHub.Infrastructure.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Material de firma y validación para los tests del lease offline (022 Fase 8).
///
/// Las claves se generan por test en vez de compartirse en un <c>fixture</c> de colección:
/// el escenario más importante que hay que probar es justamente "la clave de A no valida
/// el lease de B", y con una clave global ese test no probaría nada.
/// </summary>
internal static class OfflineLeaseTestHelper
{
    public const string CurrentKid = "k-test-2026-10";
    public const string PreviousKid = "k-test-2026-07";

    /// <summary>Secreto HS256 del access token; el mismo default del API.</summary>
    public const string AccessTokenSecret = "SuperSecretKeyThatIsAtLeast32BytesLongForHS256!!!";

    // Anillo compartido para los tests que sólo necesitan emitir access tokens (el login no
    // firma leases). Se genera una vez por proceso: crear RSA-2048 en cada test suma segundos
    // sin agregar cobertura.
    private static readonly Lazy<(OfflineLeaseKeyRing Ring, IConfiguration Configuration)> Shared =
        new(() => CreateRing());

    public static OfflineLeaseKeyRing SharedRing => Shared.Value.Ring;

    public static IConfiguration SharedConfiguration => Shared.Value.Configuration;

    /// <summary>Generador real de tokens con el anillo compartido.</summary>
    public static JwtTokenGenerator CreateAccessTokenGenerator() =>
        new(SharedConfiguration, SharedRing);

    public static string CreatePem()
    {
        using var rsa = RSA.Create(2048);
        return rsa.ExportPkcs8PrivateKeyPem();
    }

    /// <summary>
    /// Anillo de claves a partir de configuración real (no de un mock): así el test cubre
    /// también el binding <c>JwtSettings:OfflineLease:Keys</c> y el escapado de saltos de
    /// línea del PEM dentro del JSON.
    /// </summary>
    public static (OfflineLeaseKeyRing Ring, IConfiguration Configuration) CreateRing(
        params (string Kid, string Pem)[] keys)
    {
        if (keys.Length == 0)
        {
            keys = new[] { (CurrentKid, CreatePem()) };
        }

        var values = new Dictionary<string, string?>
        {
            ["JwtSettings:Secret"] = AccessTokenSecret,
        };

        for (var i = 0; i < keys.Length; i++)
        {
            values[$"JwtSettings:OfflineLease:Keys:{i}:Kid"] = keys[i].Kid;
            values[$"JwtSettings:OfflineLease:Keys:{i}:PrivateKeyPem"] = keys[i].Pem;
        }

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        return (new OfflineLeaseKeyRing(configuration, NullLogger<OfflineLeaseKeyRing>.Instance), configuration);
    }

    /// <summary>Anillo sin claves configuradas: ejercita el fallback efímero de dev/CI.</summary>
    public static (OfflineLeaseKeyRing Ring, IConfiguration Configuration) CreateRingWithoutKeys()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:Secret"] = AccessTokenSecret,
            })
            .Build();

        return (new OfflineLeaseKeyRing(configuration, NullLogger<OfflineLeaseKeyRing>.Instance), configuration);
    }

    /// <summary>Reconstruye la clave pública tal como lo haría un cliente desde el JWKS.</summary>
    public static RsaSecurityKey ToSecurityKey(OfflineLeaseJwk jwk)
    {
        var parameters = new RSAParameters
        {
            Modulus = Base64UrlEncoder.DecodeBytes(jwk.N),
            Exponent = Base64UrlEncoder.DecodeBytes(jwk.E),
        };

        return new RsaSecurityKey(RSA.Create(parameters)) { KeyId = jwk.Kid };
    }

    /// <summary>
    /// Parámetros con los que el dispositivo valida el lease: firma contra el JWKS, `exp`,
    /// `iss` y `aud`. Sin claves de HS256 — el lease nunca se valida con el secreto.
    /// </summary>
    public static TokenValidationParameters CreateLeaseValidationParameters(OfflineLeaseJwks jwks) => new()
    {
        ValidateIssuer = true,
        ValidIssuer = OfflineLeaseClaims.Issuer,
        ValidateAudience = true,
        ValidAudience = OfflineLeaseClaims.Audience,
        ValidateLifetime = true,
        // Sin tolerancia: el contrato promete exp exacto y el test tiene que poder medirlo.
        ClockSkew = TimeSpan.Zero,
        ValidateIssuerSigningKey = true,
        IssuerSigningKeys = jwks.Keys.Select(ToSecurityKey).ToList(),
    };
}
