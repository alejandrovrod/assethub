using System;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using AssetHub.Domain.Exceptions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AssetHub.Api.Tests;

/// <summary>
/// Verifies the HTTP status mapping performed by ExceptionHandlingMiddleware
/// for domain-rule and validation exceptions raised inside the request pipeline.
/// </summary>
public class ExceptionHandlingMiddlewareTests
{
    private static async Task<HttpClient> CreateClientAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRouting();

        var app = builder.Build();
        app.UseRouting();
        app.UseMiddleware<AssetHub.Api.Middleware.ExceptionHandlingMiddleware>();
        app.UseEndpoints(e =>
        {
            e.MapGet("/throw-domain", async ctx => throw new DomainException("test_code", "Domain rule message"));
            e.MapGet("/throw-invalid-op", async ctx => throw new InvalidOperationException("Domain rule message"));
            e.MapGet("/throw-argument", async ctx => throw new ArgumentException("Validation message"));
            e.MapGet("/throw-unexpected", async ctx => throw new Exception("Unexpected message"));
        });
        await app.StartAsync();

        var server = (Microsoft.AspNetCore.TestHost.TestServer)app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();
        return server.CreateClient();
    }

    [Fact]
    public async Task DomainException_Returns400_WithCodeAndTitle()
    {
        using var client = await CreateClientAsync();

        var response = await client.GetAsync("/throw-domain");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("test_code", body);
        Assert.Contains("Domain rule message", body);
    }

    [Fact]
    public async Task InvalidOperationException_Returns422_WithDetail()
    {
        using var client = await CreateClientAsync();

        var response = await client.GetAsync("/throw-invalid-op");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Domain rule message", body);
    }

    [Fact]
    public async Task ArgumentException_Returns400_WithDetail()
    {
        using var client = await CreateClientAsync();

        var response = await client.GetAsync("/throw-argument");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Validation message", body);
    }

    [Fact]
    public async Task UnexpectedException_Returns500()
    {
        using var client = await CreateClientAsync();

        var response = await client.GetAsync("/throw-unexpected");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }
}
