using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AssetHub.Application.Auth;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Common;
using AssetHub.Domain.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace AssetHub.Infrastructure.Security;

public class JwtTokenGenerator : IJwtTokenGenerator
{
    private readonly string _secret;
    private readonly OfflineLeaseKeyRing _offlineLeaseKeys;

    public JwtTokenGenerator(IConfiguration configuration, OfflineLeaseKeyRing offlineLeaseKeys)
    {
        _secret = configuration["JwtSettings:Secret"] ?? "SuperSecretKeyThatIsAtLeast32BytesLongForHS256!!!";
        _offlineLeaseKeys = offlineLeaseKeys;
    }

    public string GenerateAccessToken(ApplicationUser user, IList<string> roles, IList<string> permissions)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (user.TenantId.HasValue)
        {
            claims.Add(new Claim("tid", user.TenantId.Value.ToString()));
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        foreach (var perm in permissions)
        {
            claims.Add(new Claim("perms", perm));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: "AssetHub",
            audience: "AssetHub",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var randomNumber = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }

    /// <summary>
    /// Lease offline (022 §4.4). RS256 con la clave vigente del anillo y <c>kid</c> en el
    /// header, para que el cliente sepa con qué clave del JWKS verificarlo cuando rote.
    ///
    /// El payload se arma a mano en vez de con el constructor de claims para que <c>iat</c>,
    /// <c>exp</c> y <c>jti</c> sean numéricos/opacos tal como los define el contrato: un
    /// <c>iat</c> serializado como string rompe a los validadores estrictos del cliente.
    /// </summary>
    public string GenerateOfflineLease(
        ApplicationUser user,
        Guid tenantId,
        string deviceId,
        int ttlHours,
        DateTime issuedAt)
    {
        var issuedAtUtc = issuedAt.Kind == DateTimeKind.Utc
            ? issuedAt
            : issuedAt.ToUniversalTime();

        var payload = new JwtPayload
        {
            [JwtRegisteredClaimNames.Iss] = OfflineLeaseClaims.Issuer,
            [JwtRegisteredClaimNames.Sub] = user.Id.ToString(),
            [OfflineLeaseClaims.TenantId] = tenantId.ToString(),
            ["typ"] = OfflineLeaseClaims.TokenType,
            ["scope"] = OfflineLeaseClaims.Scope,
            [OfflineLeaseClaims.DeviceId] = deviceId,
            [JwtRegisteredClaimNames.Iat] = EpochTime.GetIntDate(issuedAtUtc),
            [JwtRegisteredClaimNames.Exp] = EpochTime.GetIntDate(issuedAtUtc.AddHours(ttlHours)),
            // jti v7: ordenable por tiempo, útil para auditar emisiones sin un timestamp extra.
            [JwtRegisteredClaimNames.Jti] = Uuid7.NewGuid().ToString(),
            [JwtRegisteredClaimNames.Aud] = OfflineLeaseClaims.Audience,
        };

        // JwtHeader toma `alg` de las credenciales y `kid` de Key.KeyId.
        var header = new JwtHeader(_offlineLeaseKeys.CurrentSigningCredentials);

        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(header, payload));
    }
}
