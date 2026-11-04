using System;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using AssetHub.Api.Configuration;
using AssetHub.Application.Common.Exceptions;
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
        builder.Services.AddAssetHubLocalization();

        var app = builder.Build();
        app.UseRequestLocalization();
        app.UseRouting();
        app.UseMiddleware<AssetHub.Api.Middleware.ExceptionHandlingMiddleware>();
        app.UseEndpoints(e =>
        {
            e.MapGet("/throw-domain", async ctx => throw new DomainException("asset_disposed", "Asset is disposed"));
            e.MapGet("/throw-invalid-transition", async ctx => throw new InvalidTransitionException(
                "todo",
                "paused",
                currentState: "todo",
                allowedTransitions: new[] { "in_progress", "cancelled" }));
            e.MapGet("/throw-invalid-op", async ctx => throw new InvalidOperationException("Domain rule message"));
            e.MapGet("/throw-invalid-field-app", async ctx => throw new InvalidFieldAppSettingsException(100, 4, 24));
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
        // The error code doubles as the localization key and is always echoed back.
        Assert.Contains("asset_disposed", body);
        // Default culture is es, so the title comes back from SharedResource.es.resx
        // (the raw "Asset is disposed" message is only the fallback).
        Assert.Contains("El activo ha sido dado de baja", body);
        Assert.DoesNotContain("Asset is disposed", body);
    }

    [Fact]
    public async Task InvalidTransitionException_Returns409_WithCurrentStateAndAllowedTransitions()
    {
        using var client = await CreateClientAsync();

        var response = await client.GetAsync("/throw-invalid-transition");

        // 409 y no 422: no hay nada que corregir en el payload, y no es 412 porque la
        // versión del cliente era la correcta. Lo que no existe es esa arista.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("invalid_transition", body);
        Assert.Contains("\"currentState\":\"todo\"", body);
        Assert.Contains("\"allowedTransitions\":[\"in_progress\",\"cancelled\"]", body);
    }

    [Fact]
    public async Task InvalidFieldAppSettingsException_Returns422_WithTheConfiguredValueAndRange()
    {
        using var client = await CreateClientAsync();

        var response = await client.GetAsync("/throw-invalid-field-app");

        // 422 y no 400: el request del técnico es correcto; lo que no está en rango es la
        // política del tenant. El cliente no puede arreglarlo reintentando.
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("field_app_settings_invalid", body);
        Assert.Contains("\"offlineLeaseHours\":100", body);
        Assert.Contains("\"minOfflineLeaseHours\":4", body);
        Assert.Contains("\"maxOfflineLeaseHours\":24", body);
        // detail localizado, con los tres argumentos sustituidos.
        Assert.Contains("entre 4 y 24 horas", body);
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
