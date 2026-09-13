using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using Xunit;

namespace AssetHub.Api.Tests.Media;

public class MediaUploadEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly HttpClient _client;

    public MediaUploadEndpointTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.AddScoped<ITenantResolver>(_ => new FixedTenantResolver(_tenantId));
            });
        });
        _client = CreateAuthenticatedClient("admin");
    }

    private sealed class FixedTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FixedTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    private HttpClient CreateAuthenticatedClient(string role)
    {
        var client = _factory.CreateClient();
        var token = GenerateJwtToken(_tenantId, role);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static string GenerateJwtToken(Guid tenantId, string role)
    {
        var secret = "SuperSecretKeyThatIsAtLeast32BytesLongForHS256!!!";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, "test-user"),
            new Claim("tid", tenantId.ToString()),
            new Claim(ClaimTypes.Role, role)
        };

        var token = new JwtSecurityToken(
            issuer: "AssetHub",
            audience: "AssetHub",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(30),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [Fact]
    public async Task Upload_WithAdmin_ReturnsUrlAndPersistsFile()
    {
        using var content = new ByteArrayContent(new byte[] { 0x89, 0x50, 0x4E, 0x47 });
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        using var form = new MultipartFormDataContent
        {
            { content, "file", "logo.png" }
        };

        var response = await _client.PostAsync("/api/v1/media/upload", form);

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<UploadResponse>();
        Assert.NotNull(body);
        Assert.StartsWith($"/uploads/tenants/{_tenantId}/", body.Url);
        Assert.EndsWith(".png", body.Url);

        var savedPath = Path.Combine(
            Directory.GetCurrentDirectory(), "wwwroot",
            body.Url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        Assert.True(File.Exists(savedPath), $"Expected file at {savedPath}");
    }

    [Fact]
    public async Task Upload_WithoutAuthentication_Returns401()
    {
        using var anonymousClient = _factory.CreateClient();
        using var content = new ByteArrayContent(new byte[] { 0x89, 0x50, 0x4E, 0x47 });
        using var form = new MultipartFormDataContent
        {
            { content, "file", "logo.png" }
        };

        var response = await anonymousClient.PostAsync("/api/v1/media/upload", form);

        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Upload_WithWrongRole_Returns403()
    {
        using var viewerClient = CreateAuthenticatedClient("Viewer");
        using var content = new ByteArrayContent(new byte[] { 0x89, 0x50, 0x4E, 0x47 });
        using var form = new MultipartFormDataContent
        {
            { content, "file", "logo.png" }
        };

        var response = await viewerClient.PostAsync("/api/v1/media/upload", form);

        Assert.Equal(System.Net.HttpStatusCode.Forbidden, response.StatusCode);
    }

    private sealed record UploadResponse(string Url);
}
