using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.CommunicationTemplates.Commands;
using AssetHub.Domain.CommunicationTemplates;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace AssetHub.Api.Tests.CommunicationTemplates;

public class SendTestEmailCommandTests
{
    private static async Task<(Guid TemplateId, TenantDbContext Db, Guid TenantId)> SeedActiveTemplate(
        CommunicationTemplateTestHelper.FakeTenantResolver resolver,
        string content = "Hola {{recipient.name}}, orden {{order.title}}",
        string? subject = "Prueba {{order.title}}",
        CommunicationEntityScope scope = CommunicationEntityScope.MaintenanceOrder)
    {
        var tenantId = resolver.GetCurrentTenantId()!.Value;
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var createHandler = new CreateCommunicationTemplateCommandHandler(db, resolver);
        var templateId = await createHandler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = "ORDER-CREATED",
            Name = "Orden creada",
            EntityScope = scope,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Subject = subject, Content = content },
                new() { Locale = "en", Subject = "Test {{order.title}}", Content = "Hi {{recipient.name}}" }
            }
        }, CancellationToken.None);
        return (templateId, db, tenantId);
    }

    private static SendTestEmailCommandHandler CreateHandler(
        TenantDbContext db,
        CommunicationTemplateTestHelper.FakeTenantResolver resolver,
        CommunicationTemplateTestHelper.CapturingEmailService email,
        AssetHub.Infrastructure.Persistence.PlatformDbContext? platformDb = null)
    {
        return new SendTestEmailCommandHandler(
            db,
            resolver,
            CommunicationTemplateTestHelper.CreateTemplateService(db, platformDb),
            email);
    }

    [Fact]
    public async Task Handle_ActiveVersion_SendsEmailWithDummyVariablesFilled()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var (templateId, db, _) = await SeedActiveTemplate(resolver);

        var handler = CreateHandler(db, resolver, email);

        await handler.Handle(new SendTestEmailCommand
        {
            TemplateId = templateId,
            To = "destino@prueba.com",
            Locale = "es"
        }, CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Equal("destino@prueba.com", sent.To);
        // Las variables dummy llenan TODAS las variables del catalogo
        Assert.Equal("Prueba Mantenimiento Preventivo de Bomba", sent.Subject);
        Assert.Contains("Hola Juan Pérez", sent.Body);
        Assert.Contains("Mantenimiento Preventivo de Bomba", sent.Body);
        // Ninguna variable sin resolver queda visible
        Assert.DoesNotContain("{{", sent.Body);
    }

    [Fact]
    public async Task Handle_Overrides_UseUnsavedEditorContent()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var (templateId, db, _) = await SeedActiveTemplate(resolver);

        var handler = CreateHandler(db, resolver, email);

        await handler.Handle(new SendTestEmailCommand
        {
            TemplateId = templateId,
            To = "destino@prueba.com",
            Locale = "es",
            Translations = new List<SendTestEmailCommand.TestTranslationInput>
            {
                new() { Locale = "es", Subject = "Borrador {{order.title}}", Content = "Contenido NO guardado {{asset.code}}" }
            }
        }, CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        // Renderiza el contenido del override, no la version activa
        Assert.Equal("Borrador Mantenimiento Preventivo de Bomba", sent.Subject);
        Assert.Contains("Contenido NO guardado", sent.Body);
        Assert.Contains("AST-0001", sent.Body);
        Assert.DoesNotContain("Hola Juan Pérez", sent.Body);
    }

    [Fact]
    public async Task Handle_LocaleFallback_UsesSpanishWhenLocaleMissing()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var (templateId, db, _) = await SeedActiveTemplate(resolver);

        var handler = CreateHandler(db, resolver, email);

        await handler.Handle(new SendTestEmailCommand
        {
            TemplateId = templateId,
            To = "destino@prueba.com",
            Locale = "fr" // no existe => fallback "es"
        }, CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Contains("Hola Juan Pérez", sent.Body);
    }

    [Fact]
    public async Task Handle_InvalidEmail_Throws()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var (templateId, db, _) = await SeedActiveTemplate(resolver);

        var handler = CreateHandler(db, resolver, email);

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(new SendTestEmailCommand
        {
            TemplateId = templateId,
            To = "no-es-un-correo"
        }, CancellationToken.None));

        Assert.Empty(email.Sent);
    }

    [Fact]
    public async Task Handle_TemplateNotFound_Throws()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);

        var handler = CreateHandler(db, resolver, email);

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(new SendTestEmailCommand
        {
            TemplateId = Guid.NewGuid(),
            To = "destino@prueba.com"
        }, CancellationToken.None));
    }

    [Fact]
    public async Task Handle_DocumentTemplate_Throws()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var createHandler = new CreateCommunicationTemplateCommandHandler(db, resolver);
        var templateId = await createHandler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = "DOC-1",
            Name = "Documento",
            EntityScope = CommunicationEntityScope.MaintenanceOrder,
            TemplateType = CommunicationTemplateType.Document,
            Translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Content = "contenido" }
            }
        }, CancellationToken.None);

        var handler = CreateHandler(db, resolver, email);

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(new SendTestEmailCommand
        {
            TemplateId = templateId,
            To = "destino@prueba.com"
        }, CancellationToken.None));

        Assert.Empty(email.Sent);
    }

    [Fact]
    public async Task Handle_BodyContainsTestBanner()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var (templateId, db, _) = await SeedActiveTemplate(resolver);

        var handler = CreateHandler(db, resolver, email);

        await handler.Handle(new SendTestEmailCommand
        {
            TemplateId = templateId,
            To = "destino@prueba.com"
        }, CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Contains("Correo de prueba", sent.Body);
        // El banner va al inicio del cuerpo
        Assert.StartsWith("<div", sent.Body.TrimStart());
    }

    [Fact]
    public async Task Handle_TenantBrandingVariables_MergeTenantInfo()
    {
        var tenantId = Guid.NewGuid();
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();
        var (templateId, db, _) = await SeedActiveTemplate(
            resolver, content: "Empresa: {{tenant.name}}", subject: null);

        var platformDb = CommunicationTemplateTestHelper.CreatePlatformDbContext();
        platformDb.Tenants.Add(new Domain.Tenancy.Tenant
        {
            Id = tenantId,
            Slug = "test",
            Name = "Empresa Demo S.A.",
            SupportEmail = "soporte@empresa.com"
        });
        await platformDb.SaveChangesAsync();

        var handler = CreateHandler(db, resolver, email, platformDb);

        await handler.Handle(new SendTestEmailCommand
        {
            TemplateId = templateId,
            To = "destino@prueba.com"
        }, CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Contains("Empresa: Empresa Demo S.A.", sent.Body);
    }
}
