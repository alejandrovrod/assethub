using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Filters;
using AssetHub.Api.Http;
using AssetHub.Domain.Concurrency;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// El filtro <c>[RequireIfMatch]</c> es la puerta: si deja pasar un request sin versión,
/// el handler no tiene con qué comparar y la escritura se vuelve un last-write-wins
/// silencioso. Los 428/400 de acá son la diferencia entre "perdí datos" y "me avisaron".
/// </summary>
public class IfMatchRequiredTests
{
    private const string Url = "/api/v1/test/versioned";

    [Fact]
    public async Task MissingIfMatch_Returns428()
    {
        var (app, client) = await CreateClientAsync();
        await using var _ = app;
        using var __ = client;

        var response = await client.PutAsync(Url, Json("{}"));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(428, (int)response.StatusCode);
        Assert.Contains("precondition_required", body);
    }

    [Theory]
    [InlineData("W/\"AAAAAAAAD8E\"")]
    [InlineData("AAAAAAAAD8E")]
    [InlineData("\"no es un token\"")]
    public async Task MalformedIfMatch_Returns400(string value)
    {
        var (app, client) = await CreateClientAsync();
        await using var _ = app;
        using var __ = client;

        var request = new HttpRequestMessage(HttpMethod.Put, Url) { Content = Json("{}") };
        request.Headers.TryAddWithoutValidation("If-Match", value);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("invalid_if_match", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ValidIfMatch_ReachesTheActionWithTheDecodedVersion()
    {
        var (app, client) = await CreateClientAsync();
        await using var _ = app;
        using var __ = client;
        var version = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 };

        var request = new HttpRequestMessage(HttpMethod.Put, Url) { Content = Json("{}") };
        request.Headers.TryAddWithoutValidation("If-Match", ETagHelper.ToHeader(version));

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"hasVersion\":true", body);
        Assert.Contains(RowVersionToken.ToToken(version)!, body);
    }

    [Fact]
    public async Task Star_ReachesTheActionWithoutAVersion()
    {
        var (app, client) = await CreateClientAsync();
        await using var _ = app;
        using var __ = client;

        var request = new HttpRequestMessage(HttpMethod.Put, Url) { Content = Json("{}") };
        request.Headers.TryAddWithoutValidation("If-Match", "*");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"hasVersion\":false", (await response.Content.ReadAsStringAsync()));
    }

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static async Task<(WebApplication App, HttpClient Client)> CreateClientAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddControllers().AddApplicationPart(typeof(IfMatchTestController).Assembly);

        var app = builder.Build();
        app.MapControllers();
        await app.StartAsync();

        var server = (TestServer)app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();
        return (app, server.CreateClient());
    }
}

[ApiController]
[Route("api/v1/test")]
public class IfMatchTestController : ControllerBase
{
    [HttpPut("versioned")]
    [RequireIfMatch]
    public IActionResult Update()
    {
        var version = RequireIfMatchAttribute.GetExpectedVersion(HttpContext);
        return Ok(new { hasVersion = version is not null, token = RowVersionToken.ToToken(version) });
    }
}
