using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.CommunicationTemplates;
using AssetHub.Application.CommunicationTemplates.Commands;
using AssetHub.Application.CommunicationTemplates.Queries;
using AssetHub.Application.CommunicationTemplates.Rendering;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.CommunicationTemplates;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Services.Templates;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Tests.CommunicationTemplates;

public class RenderingTests
{
    private static async Task<(Guid templateId, TenantDbContext db, Guid tenantId)> SeedTemplate(
        string code,
        string esContent, string? esSubject,
        string? enContent = null, string? enSubject = null)
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var handler = new CreateCommunicationTemplateCommandHandler(db, new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId));

        var translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
        {
            new() { Locale = "es", Subject = esSubject, Content = esContent }
        };
        if (enContent != null)
        {
            translations.Add(new CreateCommunicationTemplateCommand.TranslationInput { Locale = "en", Subject = enSubject, Content = enContent });
        }

        var templateId = await handler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = code,
            Name = "X",
            EntityScope = CommunicationEntityScope.MaintenanceOrder,
            TemplateType = CommunicationTemplateType.Email,
            Translations = translations
        }, CancellationToken.None);

        return (templateId, db, tenantId);
    }

    [Fact]
    public async Task RenderActive_ResolvesRecipientLocale()
    {
        var (templateId, db, tenantId) = await SeedTemplate(
            "ORDER-CREATED",
            "Hola {{recipient.name}}, orden {{order.title}}",
            "Nueva orden {{order.title}}",
            enContent: "Hi {{recipient.name}}, order {{order.title}}",
            enSubject: "New order {{order.title}}");

        var service = CommunicationTemplateTestHelper.CreateTemplateService(db);

        var variables = new Dictionary<string, object>
        {
            ["order.title"] = "Bomba rota",
            ["recipient.name"] = "Juan Pérez"
        };

        var rendered = await service.RenderActiveAsync(tenantId, "ORDER-CREATED", "en", variables);

        Assert.NotNull(rendered);
        Assert.Equal("New order Bomba rota", rendered!.Subject);
        Assert.Equal("Hi Juan Pérez, order Bomba rota", rendered.Body);
    }

    [Fact]
    public async Task RenderActive_FallsBackToSpanish_WhenLocaleMissing()
    {
        var (templateId, db, tenantId) = await SeedTemplate(
            "ORDER-CREATED",
            "Hola {{recipient.name}}",
            "Nueva orden");

        var service = CommunicationTemplateTestHelper.CreateTemplateService(db);

        var rendered = await service.RenderActiveAsync(
            tenantId, "ORDER-CREATED", "en",
            new Dictionary<string, object> { ["recipient.name"] = "María" });

        Assert.NotNull(rendered);
        Assert.Equal("Hola María", rendered!.Body);
    }

    [Fact]
    public async Task RenderActive_UnknownVariables_RenderEmptyString()
    {
        var (templateId, db, tenantId) = await SeedTemplate(
            "ORDER-CREATED",
            "A: {{unknown.variable}} | B: {{order.title}}",
            null);

        var service = CommunicationTemplateTestHelper.CreateTemplateService(db);

        var rendered = await service.RenderActiveAsync(
            tenantId, "ORDER-CREATED", "es",
            new Dictionary<string, object> { ["order.title"] = "Titulo" });

        Assert.NotNull(rendered);
        Assert.Equal("A:  | B: Titulo", rendered!.Body);
    }

    [Fact]
    public async Task RenderActive_ReturnsNull_WhenTemplateNotFound()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var service = CommunicationTemplateTestHelper.CreateTemplateService(db);

        var rendered = await service.RenderActiveAsync(
            tenantId, "NO-EXISTE", "es",
            new Dictionary<string, object>());

        Assert.Null(rendered);
    }

    [Fact]
    public async Task RenderQuery_ExposesVariableCatalog()
    {
        var (templateId, db, tenantId) = await SeedTemplate(
            "ORDER-CREATED",
            "Hola {{recipient.name}}",
            "Asunto");

        var handler = new RenderCommunicationTemplateQueryHandler(db, new ScribanTemplateRenderEngine());

        var result = await handler.Handle(new RenderCommunicationTemplateQuery
        {
            TemplateId = templateId,
            Locale = "es",
            SampleVariables = new Dictionary<string, string> { ["recipient.name"] = "Pedro" }
        }, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Contains("order.title", result!.AvailableVariables);
        Assert.Contains("recipient.name", result.AvailableVariables);
        Assert.Equal("Hola Pedro", result.Body);
        Assert.Equal("Asunto", result.Subject);
    }
}

public class ScribanEngineTests
{
    private readonly ScribanTemplateRenderEngine _engine = new();

    [Fact]
    public void Render_NestedDottedKeys_ResolveAsNestedObjects()
    {
        var variables = new Dictionary<string, object>
        {
            ["order.title"] = "T1",
            ["order.state"] = "draft",
            ["recipient.name"] = "Ana"
        };

        var result = _engine.Render("{{order.title}} / {{order.state}} / {{recipient.name}}", variables);

        Assert.Equal("T1 / draft / Ana", result);
    }

    [Fact]
    public void Render_UnknownVariable_EmptyString()
    {
        var result = _engine.Render("X{{missing.thing}}Y", new Dictionary<string, object>());
        Assert.Equal("XY", result);
    }

    [Fact]
    public void Render_MalformedTemplate_ReturnsOriginalContent()
    {
        const string raw = "Texto {{order.title roto";
        var result = _engine.Render(raw, new Dictionary<string, object>());
        Assert.Equal(raw, result);
    }

    [Fact]
    public void Render_NullContent_EmptyString()
    {
        var result = _engine.Render("", new Dictionary<string, object>());
        Assert.Equal(string.Empty, result);
    }
}
