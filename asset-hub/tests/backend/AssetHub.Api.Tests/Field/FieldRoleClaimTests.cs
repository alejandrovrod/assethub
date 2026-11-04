using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Puente entre el token y la regla de §10: <c>FieldTaskAccess</c> decide con
/// <c>ICurrentUser.IsInRole</c>, que a su vez lee el claim del <c>ClaimsPrincipal</c>.
/// Si ese claim no sobrevive al ida y vuelta del JWT, el rol de campo "funciona" en los
/// tests de handler (donde se inyecta un fake) y **no hace nada** en producción: la
/// restricción se cae sin que ningún test lo note. Estos tres casos cubren los tres
/// eslabones.
/// </summary>
public class FieldRoleClaimTests
{
    private const string Secret = "TestSecretKeyThatIsAtLeast32BytesLongForHS256!!!!";

    [Fact]
    public void CurrentUser_ReadsTheRoleFromThePrincipal()
    {
        var userId = Guid.NewGuid();
        var context = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                    new Claim(ClaimTypes.Role, FieldTechnicianRole.Name),
                },
                authenticationType: "Bearer",
                nameType: ClaimTypes.Name,
                roleType: ClaimTypes.Role)),
        };

        var sut = new CurrentUser(new StubHttpContextAccessor(context));

        Assert.True(sut.IsInRole(FieldTechnicianRole.Name));
        Assert.False(sut.IsInRole("Technician"));
        Assert.Equal(userId, sut.Id);
    }

    [Fact]
    public void CurrentUser_WithoutHttpContext_IsNeverInARole()
    {
        var sut = new CurrentUser(new StubHttpContextAccessor(null));

        // Sin contexto (jobs, tests, llamadas internas) no hay rol que conceder.
        Assert.False(sut.IsInRole(FieldTechnicianRole.Name));
        Assert.Null(sut.Id);
    }

    [Fact]
    public void AccessToken_RoundTrip_KeepsTheRoleClaim()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JwtSettings:Secret"] = Secret })
            .Build();

        var generator = new JwtTokenGenerator(
            configuration,
            new OfflineLeaseKeyRing(configuration, NullLogger<OfflineLeaseKeyRing>.Instance));

        var user = new ApplicationUser { Id = Guid.NewGuid(), UserName = "ana", TenantId = Guid.NewGuid() };
        var token = generator.GenerateAccessToken(
            user,
            new List<string> { FieldTechnicianRole.Name },
            Array.Empty<string>());

        var principal = new JwtSecurityTokenHandler().ValidateToken(
            token,
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = "AssetHub",
                ValidAudience = "AssetHub",
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
            },
            out _);

        // La misma operación que hace HttpContext.User.IsInRole en el pipeline real.
        Assert.True(principal.IsInRole(FieldTechnicianRole.Name));
        Assert.False(principal.IsInRole("Tenant Admin"));
    }

    private sealed class StubHttpContextAccessor : IHttpContextAccessor
    {
        public StubHttpContextAccessor(HttpContext? context) => HttpContext = context;

        public HttpContext? HttpContext { get; set; }
    }
}
