using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.Security;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Auth;
using AssetHub.Application.Auth.Commands;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Field;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Security;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Lease offline (022 Fase 8, B4).
///
/// Lo que se prueba acá es el contrato del documento, no la emisión de un string: que la
/// firma se verifique con la clave publicada en el JWKS (que es lo único que tiene el
/// dispositivo), que el <c>exp</c> sea exactamente el TTL de la política del tenant, que el
/// lease de un tenant no verifique con la clave de otro, y que un usuario inactivo no lo
/// obtenga.
/// </summary>
public class OfflineLeaseTests
{
    private static readonly Guid TenantId = Guid.Parse("f0000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherTenantId = Guid.Parse("f0000000-0000-0000-0000-000000000002");
    private static readonly Guid DeviceId = Guid.Parse("0d0d0d0d-1111-2222-3333-444444444444");

    private sealed class Harness : IAsyncDisposable
    {
        public required TenantDbContext TenantDb { get; init; }
        public required SecurityDbContext SecurityDb { get; init; }
        public required OfflineLeaseKeyRing Ring { get; init; }
        public required IssueOfflineLeaseCommandHandler Handler { get; init; }
        public required ApplicationUser User { get; init; }

        public async ValueTask DisposeAsync()
        {
            await TenantDb.DisposeAsync();
            SecurityDb.Dispose();
            Ring.Dispose();
        }
    }

    private static async Task<Harness> CreateAsync(
        bool isActive = true,
        bool seedSettings = false,
        int offlineLeaseHours = TenantFieldAppSettings.DefaultOfflineLeaseHours,
        bool requireDeviceLock = true)
    {
        var tenantDb = WorkTaskTestHelper.CreateDbContext(TenantId);

        if (seedSettings)
        {
            tenantDb.TenantFieldAppSettings.Add(new TenantFieldAppSettings
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                Enabled = true,
                OfflineLeaseHours = offlineLeaseHours,
                RequireDeviceLock = requireDeviceLock,
            });
            await tenantDb.SaveChangesAsync();
        }

        var (securityDb, _) = SecurityTestHelper.CreateSecurityDb();

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "tecnico@field.test",
            NormalizedUserName = "TECNICO@FIELD.TEST",
            Email = "tecnico@field.test",
            NormalizedEmail = "TECNICO@FIELD.TEST",
            FullName = "Técnico de campo",
            TenantId = TenantId,
            IsActive = isActive,
        };
        securityDb.Users.Add(user);
        await securityDb.SaveChangesAsync();

        var (ring, configuration) = OfflineLeaseTestHelper.CreateRing();
        var jwt = new JwtTokenGenerator(configuration, ring);
        var issuer = new OfflineLeaseIssuer(tenantDb, jwt, ring);
        var handler = new IssueOfflineLeaseCommandHandler(
            securityDb,
            new WorkTaskTestHelper.FakeCurrentUser(user.Id),
            issuer);

        return new Harness
        {
            TenantDb = tenantDb,
            SecurityDb = securityDb,
            Ring = ring,
            Handler = handler,
            User = user,
        };
    }

    private static JwtSecurityToken Read(string token) =>
        new JwtSecurityTokenHandler().ReadJwtToken(token);

    private static long Numeric(JwtSecurityToken jwt, string claim) =>
        Convert.ToInt64(jwt.Payload[claim], System.Globalization.CultureInfo.InvariantCulture);

    [Fact]
    public async Task IssuedLease_VerifiesWithThePublishedJwks()
    {
        await using var harness = await CreateAsync();

        var result = await harness.Handler.Handle(
            new IssueOfflineLeaseCommand(DeviceId.ToString()), CancellationToken.None);

        var parameters = OfflineLeaseTestHelper.CreateLeaseValidationParameters(result.Jwks);

        // Si esto no valida, el dispositivo queda con un lease que no puede verificar y todo
        // el modo offline es decorativo.
        var principal = new JwtSecurityTokenHandler().ValidateToken(
            result.LeaseJwt, parameters, out var validated);

        Assert.True(principal.Identity!.IsAuthenticated);

        var jwt = Read(result.LeaseJwt);
        Assert.Equal("RS256", jwt.Header["alg"]);
        Assert.Equal(harness.Ring.CurrentKeyId, jwt.Header["kid"]);

        Assert.Equal(harness.User.Id.ToString(), jwt.Payload[JwtRegisteredClaimNames.Sub]!.ToString());
        Assert.Equal(TenantId.ToString(), jwt.Payload[OfflineLeaseClaims.TenantId]!.ToString());
        Assert.Equal(OfflineLeaseClaims.TokenType, jwt.Payload["typ"]!.ToString());
        Assert.Equal(OfflineLeaseClaims.Scope, jwt.Payload["scope"]!.ToString());
        Assert.Equal(DeviceId.ToString(), jwt.Payload[OfflineLeaseClaims.DeviceId]!.ToString());
        Assert.Equal(OfflineLeaseClaims.Issuer, jwt.Payload[JwtRegisteredClaimNames.Iss]!.ToString());
        Assert.Equal(OfflineLeaseClaims.Audience, jwt.Payload[JwtRegisteredClaimNames.Aud]!.ToString());
    }

    [Fact]
    public async Task IssuedLease_CarriesAUuidV7Jti()
    {
        await using var harness = await CreateAsync();

        var result = await harness.Handler.Handle(
            new IssueOfflineLeaseCommand(DeviceId.ToString()), CancellationToken.None);

        var jti = Read(result.LeaseJwt).Payload[JwtRegisteredClaimNames.Jti]!.ToString()!;

        Assert.True(Guid.TryParse(jti, out _));
        // Formato RFC 9562: xxxxxxxx-xxxx-7xxx-... — el dígito de versión es el 15.º carácter.
        Assert.Equal('7', jti[14]);
    }

    [Fact]
    public async Task LeaseExpiry_IsTheTenantPolicy()
    {
        await using var harness = await CreateAsync(
            seedSettings: true, offlineLeaseHours: 8, requireDeviceLock: false);

        var result = await harness.Handler.Handle(
            new IssueOfflineLeaseCommand(DeviceId.ToString()), CancellationToken.None);

        var jwt = Read(result.LeaseJwt);

        Assert.Equal(8 * 3600, result.ExpiresIn);
        Assert.Equal(result.ExpiresIn, Numeric(jwt, JwtRegisteredClaimNames.Exp) - Numeric(jwt, JwtRegisteredClaimNames.Iat));
        Assert.False(result.RequireDeviceLock);
        Assert.Equal(DateTimeKind.Utc, result.IssuedAt.Kind);
    }

    [Fact]
    public async Task DefaultLeaseExpiry_IsTwelveHours_WhenTenantHasNoPolicy()
    {
        await using var harness = await CreateAsync();

        var result = await harness.Handler.Handle(
            new IssueOfflineLeaseCommand(DeviceId.ToString()), CancellationToken.None);

        var jwt = Read(result.LeaseJwt);

        Assert.Equal(TenantFieldAppSettings.DefaultOfflineLeaseHours * 3600, result.ExpiresIn);
        Assert.Equal(
            result.ExpiresIn,
            Numeric(jwt, JwtRegisteredClaimNames.Exp) - Numeric(jwt, JwtRegisteredClaimNames.Iat));
        Assert.True(result.RequireDeviceLock);
    }

    [Theory]
    [InlineData(TenantFieldAppSettings.MinOfflineLeaseHours - 1)]
    [InlineData(TenantFieldAppSettings.MaxOfflineLeaseHours + 1)]
    [InlineData(0)]
    [InlineData(240)]
    public async Task OutOfRangePolicy_IsRejectedInsteadOfClamped(int hours)
    {
        await using var harness = await CreateAsync(seedSettings: true, offlineLeaseHours: hours);

        var ex = await Assert.ThrowsAsync<InvalidFieldAppSettingsException>(() =>
            harness.Handler.Handle(
                new IssueOfflineLeaseCommand(DeviceId.ToString()), CancellationToken.None));

        // El ajuste silencioso al rango escondería una configuración equivocada: el tenant
        // creería tener 240 h de autonomía.
        Assert.Equal("field_app_settings_invalid", ex.Code);
        Assert.Equal(hours, ex.OfflineLeaseHours);
        Assert.Equal(TenantFieldAppSettings.MinOfflineLeaseHours, ex.Min);
        Assert.Equal(TenantFieldAppSettings.MaxOfflineLeaseHours, ex.Max);
    }

    [Fact]
    public async Task InactiveUser_IsRejected()
    {
        await using var harness = await CreateAsync(isActive: false);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            harness.Handler.Handle(
                new IssueOfflineLeaseCommand(DeviceId.ToString()), CancellationToken.None));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("no-es-un-uuid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task InvalidDeviceId_IsRejectedAsValidationError(string? deviceId)
    {
        await using var harness = await CreateAsync();

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            harness.Handler.Handle(new IssueOfflineLeaseCommand(deviceId), CancellationToken.None));

        Assert.True(ex.Errors.ContainsKey("deviceId"));
    }

    [Fact]
    public async Task LeaseFromTenantA_DoesNotVerifyAgainstTenantB()
    {
        await using var harness = await CreateAsync();

        var leaseA = await harness.Handler.Handle(
            new IssueOfflineLeaseCommand(DeviceId.ToString()), CancellationToken.None);

        // Tenant B tiene su propio anillo (clave distinta, mismo kid a propósito: el `kid`
        // no es un secreto y dos tenants podrían coincidir en el nombre; lo que separa es la
        // clave). Un cliente de B no puede validar un lease de A aunque tenga su JWKS.
        var (otherRing, _) = OfflineLeaseTestHelper.CreateRing();
        using var _dispose = otherRing;

        var parametersB = OfflineLeaseTestHelper.CreateLeaseValidationParameters(otherRing.GetPublicJwks());

        Assert.ThrowsAny<SecurityTokenException>(() =>
            new JwtSecurityTokenHandler().ValidateToken(leaseA.LeaseJwt, parametersB, out _));

        // Y el tid tampoco coincide: aun si la firma validara, el cliente de B rechaza el
        // lease por tenant.
        Assert.NotEqual(
            OtherTenantId.ToString(),
            Read(leaseA.LeaseJwt).Payload[OfflineLeaseClaims.TenantId]!.ToString());
    }

    [Fact]
    public void Jwks_PublishesCurrentAndPreviousKey_AsRsaRs256()
    {
        var (ring, _) = OfflineLeaseTestHelper.CreateRing(
            (OfflineLeaseTestHelper.CurrentKid, OfflineLeaseTestHelper.CreatePem()),
            (OfflineLeaseTestHelper.PreviousKid, OfflineLeaseTestHelper.CreatePem()));

        using var _dispose = ring;
        var jwks = ring.GetPublicJwks();

        Assert.Equal(2, jwks.Keys.Count);
        Assert.Equal(OfflineLeaseTestHelper.CurrentKid, jwks.Keys[0].Kid);
        Assert.Equal(OfflineLeaseTestHelper.PreviousKid, jwks.Keys[1].Kid);

        foreach (var key in jwks.Keys)
        {
            Assert.Equal("RSA", key.Kty);
            Assert.Equal("sig", key.Use);
            Assert.Equal("RS256", key.Alg);
            // base64url sin padding (RFC 7518): ni '+' ni '/' ni '='.
            Assert.DoesNotContain('+', key.N);
            Assert.DoesNotContain('/', key.N);
            Assert.DoesNotContain('=', key.N);
            // Exponente público estándar 65537 = AQAB.
            Assert.Equal("AQAB", key.E);
        }

        Assert.NotEqual(jwks.Keys[0].N, jwks.Keys[1].N);
    }

    [Fact]
    public void Jwks_WithoutConfiguration_StillExposesAVerifiableKey()
    {
        // Sin claves configuradas el servicio arranca con una efímera (dev/CI). Lo que no
        // puede pasar es quedarse sin JWKS: el cliente no tendría con qué validar nada.
        var (ring, _) = OfflineLeaseTestHelper.CreateRingWithoutKeys();
        using var _dispose = ring;

        var jwks = ring.GetPublicJwks();

        Assert.Single(jwks.Keys);
        Assert.StartsWith("ephemeral-", jwks.Keys[0].Kid, StringComparison.Ordinal);

        using var rsa = RSA.Create(new RSAParameters
        {
            Modulus = Base64UrlEncoder.DecodeBytes(jwks.Keys[0].N),
            Exponent = Base64UrlEncoder.DecodeBytes(jwks.Keys[0].E),
        });

        Assert.Equal(2048, rsa.KeySize);
    }
}
