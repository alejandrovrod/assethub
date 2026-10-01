using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using AssetHub.Api.Configuration;
using AssetHub.Application.Assets.Commands;
using AssetHub.Application.Resources;
using AssetHub.Domain.Exceptions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Localization;
using Xunit;

namespace AssetHub.Api.Tests;

/// <summary>
/// End-to-end proof that a request's Accept-Language header decides the language
/// of every string the API returns: domain errors, validation failures and the
/// generic RFC 7807 titles.
/// </summary>
public class LocalizationTests
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
            e.MapGet("/domain-error", async ctx =>
                throw new DomainException("asset_disposed", "Asset is disposed"));

            e.MapGet("/domain-error-with-args", async ctx =>
                throw new DomainException(
                    "insufficient_stock",
                    "Insufficient stock",
                    "Domain.InsufficientStock",
                    5,
                    12));

            e.MapGet("/not-found", async ctx =>
                throw new NotFoundException("asset", "3f1d"));

            e.MapGet("/validation-error", async ctx =>
                throw new AssetHub.Domain.Exceptions.ValidationException(
                    new Dictionary<string, string[]> { ["Quantity"] = new[] { "Validation_GreaterThan" } }));

            e.MapGet("/unknown-code", async ctx =>
                throw new DomainException("brand_new_code", "Legacy hardcoded message"));
        });
        await app.StartAsync();

        var server = (TestServer)app.Services.GetRequiredService<IServer>();
        return server.CreateClient();
    }

    private static HttpRequestMessage Request(string path, string? acceptLanguage)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (acceptLanguage is not null)
        {
            request.Headers.AcceptLanguage.Add(new StringWithQualityHeaderValue(acceptLanguage));
        }

        return request;
    }

    private static async Task<string> GetBody(HttpClient client, string path, string? acceptLanguage)
    {
        var response = await client.SendAsync(Request(path, acceptLanguage));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return await response.Content.ReadAsStringAsync();
    }

    [Theory]
    [InlineData("es", "El activo ha sido dado de baja")]
    [InlineData("en", "The asset has been disposed")]
    public async Task DomainException_Message_Follows_AcceptLanguage(string culture, string expected)
    {
        using var client = await CreateClientAsync();

        var body = await GetBody(client, "/domain-error", culture);

        Assert.Contains(expected, body);
        Assert.Contains("\"code\":\"asset_disposed\"", body);
    }

    [Fact]
    public async Task DomainException_Defaults_To_Spanish_When_No_Header_Is_Sent()
    {
        using var client = await CreateClientAsync();

        var body = await GetBody(client, "/domain-error", acceptLanguage: null);

        Assert.Contains("El activo ha sido dado de baja", body);
    }

    [Theory]
    [InlineData("es", "Stock insuficiente. Actual: 5, solicitado: 12.")]
    [InlineData("en", "Insufficient stock. Current: 5, requested: 12.")]
    public async Task DomainException_Format_Args_Are_Localized(string culture, string expected)
    {
        using var client = await CreateClientAsync();

        var body = await GetBody(client, "/domain-error-with-args", culture);

        Assert.Contains(expected, body);
    }

    [Theory]
    [InlineData("es", "No se encontró el recurso 'asset' con el identificador '3f1d'.")]
    [InlineData("en", "Resource 'asset' with identifier '3f1d' was not found.")]
    public async Task NotFoundException_Returns_Localized_404(string culture, string expected)
    {
        using var client = await CreateClientAsync();

        var response = await client.SendAsync(Request("/not-found", culture));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(expected, body);
    }

    [Theory]
    [InlineData("es", "Los datos enviados no son válidos.")]
    [InlineData("en", "The submitted data is not valid.")]
    public async Task ValidationException_Returns_Localized_Title_And_Errors(string culture, string expectedTitle)
    {
        using var client = await CreateClientAsync();

        var body = await GetBody(client, "/validation-error", culture);

        Assert.Contains(expectedTitle, body);
        Assert.Contains("\"errors\"", body);
    }

    [Theory]
    [InlineData("es")]
    [InlineData("en")]
    public async Task Response_Header_Reports_Resolved_Culture(string culture)
    {
        using var client = await CreateClientAsync();

        var response = await client.SendAsync(Request("/domain-error", culture));

        // Content-Language is an entity header, so HttpClient surfaces it on the
        // content rather than on the response itself.
        var found = response.Content.Headers.TryGetValues("Content-Language", out var values)
                    || response.Headers.TryGetValues("Content-Language", out values);

        Assert.True(found);
        Assert.Equal(culture, values!.Single());
    }

    [Fact]
    public async Task Unknown_Error_Code_Falls_Back_To_The_Thrown_Message()
    {
        using var client = await CreateClientAsync();

        var body = await GetBody(client, "/unknown-code", "en");

        Assert.Contains("Legacy hardcoded message", body);
        Assert.Contains("\"code\":\"brand_new_code\"", body);
    }

    [Theory]
    [InlineData("asset_disposed")]
    [InlineData("Error_InternalServerError")]
    [InlineData("Error_Validation")]
    [InlineData("Domain.BelowResidual")]
    [InlineData("Validation_NotEmpty")]
    public void Catalog_Entries_Resolve_For_Both_Cultures(string key)
    {
        var es = LocalizationTestHelper.Resolve(key, "es");
        var en = LocalizationTestHelper.Resolve(key, "en");

        // Key itself would mean the entry is missing.
        Assert.NotEqual(key, es);
        Assert.NotEqual(key, en);
        // Different wording proves each culture reads its own satellite assembly.
        Assert.NotEqual(es, en);
    }

    [Fact]
    public void Catalog_Formats_Placeholders_Per_Culture()
    {
        var es = LocalizationTestHelper.Resolve("Domain.BelowResidual", "es");
        var en = LocalizationTestHelper.Resolve("Domain.BelowResidual", "en");

        var esFormatted = string.Format(CultureInfo.GetCultureInfo("es"), es, 3, 100m, 120m);
        var enFormatted = string.Format(CultureInfo.GetCultureInfo("en"), en, 3, 100m, 120m);

        Assert.Contains("Período 3", esFormatted);
        Assert.Contains("Period 3", enFormatted);
    }

    [Fact]
    public void Validator_Messages_Are_Localized()
    {
        var command = new CreateAssetMaterialCommand(
            AssetId: System.Guid.NewGuid(),
            CatalogItemId: System.Guid.NewGuid(),
            Quantity: 0,
            UnitOfMeasure: "Unidad",
            IsCritical: false,
            Notes: null);

        LocalizationTestHelper.SetCulture("es");
        var es = new CreateAssetMaterialCommandValidator(LocalizationTestHelper.CreateLocalizer()).Validate(command);

        LocalizationTestHelper.SetCulture("en");
        var en = new CreateAssetMaterialCommandValidator(LocalizationTestHelper.CreateLocalizer()).Validate(command);

        var esQuantity = es.Errors.Single(e => e.PropertyName == "Quantity").ErrorMessage;
        var enQuantity = en.Errors.Single(e => e.PropertyName == "Quantity").ErrorMessage;

        Assert.Contains("debe ser mayor", esQuantity);
        Assert.Contains("must be greater", enQuantity);
    }

    [Fact]
    public void Setup_Defaults_Spanish_And_Supports_English()
    {
        var options = new RequestLocalizationOptions();
        LocalizationSetup.Configure(options);

        Assert.Equal("es", options.DefaultRequestCulture.Culture.Name);
        Assert.Equal(new[] { "es", "en" }, options.SupportedCultures!.Select(c => c.Name));
        Assert.Equal(new[] { "es", "en" }, options.SupportedUICultures!.Select(c => c.Name));
        Assert.True(options.ApplyCurrentCultureToResponseHeaders);

        // Accept-Language must win over the query-string/cookie providers.
        Assert.IsType<AcceptLanguageHeaderRequestCultureProvider>(options.RequestCultureProviders![0]);
    }

    [Fact]
    public void Setup_Rejects_Unsupported_Languages()
    {
        var options = new RequestLocalizationOptions();
        LocalizationSetup.Configure(options);

        Assert.DoesNotContain(options.SupportedCultures!, c => c.Name == "fr");
    }
}
