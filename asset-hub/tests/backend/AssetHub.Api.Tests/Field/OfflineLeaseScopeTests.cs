using System;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Auth;
using AssetHub.Application.Auth.Commands;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// El lease <b>no</b> autoriza HTTP (022 §6.4, T070).
///
/// Se monta el mismo <c>JwtBearer</c> que usa <c>Program.cs</c> —HS256 sobre
/// <c>JwtSettings:Secret</c>— contra un endpoint protegido. Si el lease pasara, cualquier
/// dispositivo con un lease de 24 h tendría una credencial de API con la que escribir en el
/// servidor: el riesgo que el spec marca como "el lease se convierte en un segundo sistema
/// de auth".
///
/// El control positivo (access token → 200) está para que un 401 no pueda pasar por un
/// pipeline de auth roto.
/// </summary>
public class OfflineLeaseScopeTests
{
    private static readonly Guid TenantId = Guid.Parse("f1000000-0000-0000-0000-000000000001");
    private static readonly Guid DeviceId = Guid.Parse("0d0d0d0d-aaaa-bbbb-cccc-dddddddddddd");

    [Fact]
    public async Task Lease_IsRejectedByTheApi_AsIfItWereNotSent()
    {
        var (app, client) = await CreateApiAsync();
        await using var _app = app;
        using var _client = client;

        var lease = await IssueLeaseAsync();

        var response = await SendAsync(client, lease);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AccessToken_StillAuthenticates_TheSamePipeline()
    {
        var (app, client) = await CreateApiAsync();
        await using var _app = app;
        using var _client = client;

        var jwt = OfflineLeaseTestHelper.CreateAccessTokenGenerator();
        var accessToken = jwt.GenerateAccessToken(
            new ApplicationUser { Id = Guid.NewGuid(), TenantId = TenantId, IsActive = true },
            new[] { "Technician" },
            new[] { "tasks:read" });

        var response = await SendAsync(client, accessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Lease_IsNotAcceptableAsAccessToken_EvenWithTheSameIssuer()
    {
        var (app, client) = await CreateApiAsync();
        await using var _app = app;
        using var _client = client;

        var lease = await IssueLeaseAsync();

        // El lease declara `typ=offline_lease` y `scope=field:offline`, pero el rechazo no
        // depende de esos claims: la firma es RS256 y el middleware sólo conoce la clave
        // simétrica del access token. Aun reescribiendo el claim `typ`, no validaría.
        var parsed = new JwtSecurityTokenHandler().ReadJwtToken(lease);
        Assert.Equal("RS256", parsed.Header["alg"]);
        Assert.Equal(OfflineLeaseClaims.TokenType, parsed.Payload["typ"]!.ToString());

        Assert.Equal(HttpStatusCode.Unauthorized, (await SendAsync(client, lease)).StatusCode);
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, string bearer)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/ping");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        return await client.SendAsync(request);
    }

    private static async Task<string> IssueLeaseAsync()
    {
        var tenantDb = AssetHub.Api.Tests.WorkTasks.WorkTaskTestHelper.CreateDbContext(TenantId);
        await using var _tenantDb = tenantDb;

        var (ring, configuration) = OfflineLeaseTestHelper.CreateRing();
        using var _ring = ring;

        var issuer = new OfflineLeaseIssuer(
            tenantDb,
            new JwtTokenGenerator(configuration, ring),
            ring);

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "tecnico@field.test",
            TenantId = TenantId,
            IsActive = true,
        };

        var lease = await issuer.IssueAsync(user, DeviceId.ToString(), CancellationToken.None);
        return lease.LeaseJwt;
    }

    private static async Task<(WebApplication App, HttpClient Client)> CreateApiAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();

        // Mismos parámetros que Program.cs: es la pieza que se está probando.
        builder.Services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = "AssetHub",
                    ValidAudience = "AssetHub",
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(OfflineLeaseTestHelper.AccessTokenSecret)),
                };
            });

        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapGet("/api/v1/ping", () => "pong")
            .RequireAuthorization();

        await app.StartAsync();

        var server = (TestServer)app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();
        return (app, server.CreateClient());
    }
}
