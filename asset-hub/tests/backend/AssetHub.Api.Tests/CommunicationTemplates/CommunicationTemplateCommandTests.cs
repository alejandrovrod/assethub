using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.CommunicationTemplates;
using AssetHub.Application.CommunicationTemplates.Commands;
using AssetHub.Application.CommunicationTemplates.Queries;
using AssetHub.Application.CommunicationTemplates.Rendering;
using AssetHub.Domain.CommunicationTemplates;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Tests.CommunicationTemplates;

public class CreateCommunicationTemplateTests
{
    [Fact]
    public async Task Create_AddsTemplateWithActiveVersionAndTranslation()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var handler = new CreateCommunicationTemplateCommandHandler(db, new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId));

        var command = new CreateCommunicationTemplateCommand
        {
            Code = "ORDER-CREATED",
            Name = "Orden creada",
            EntityScope = CommunicationEntityScope.MaintenanceOrder,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Subject = "Nueva orden {{order.title}}", Content = "Hola {{recipient.name}}, orden {{order.id}}" },
                new() { Locale = "en", Subject = "New order {{order.title}}", Content = "Hi {{recipient.name}}" }
            }
        };

        var id = await handler.Handle(command, CancellationToken.None);

        var template = await db.CommunicationTemplates
            .Include(t => t.Versions)
                .ThenInclude(v => v.Translations)
            .FirstAsync(t => t.Id == id);

        Assert.Equal(tenantId, template.TenantId);
        Assert.Equal("ORDER-CREATED", template.Code);
        Assert.NotNull(template.ActiveVersionId);
        Assert.Single(template.Versions);
        Assert.Equal(1, template.Versions.First().VersionNumber);
        Assert.Equal(2, template.Versions.First().Translations.Count);
    }

    [Fact]
    public async Task Create_DuplicateCode_Throws()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var handler = new CreateCommunicationTemplateCommandHandler(db, new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId));

        var command = new CreateCommunicationTemplateCommand
        {
            Code = "ORDER-CREATED",
            Name = "X",
            EntityScope = CommunicationEntityScope.MaintenanceOrder,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Content = "body" }
            }
        };

        await handler.Handle(command, CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task Create_DuplicateLocale_Throws()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var handler = new CreateCommunicationTemplateCommandHandler(db, new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId));

        var command = new CreateCommunicationTemplateCommand
        {
            Code = "TASK-CREATED",
            Name = "X",
            EntityScope = CommunicationEntityScope.WorkTask,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Content = "a" },
                new() { Locale = "es", Content = "b" }
            }
        };

        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(command, CancellationToken.None));
    }
}

public class AddVersionTests
{
    [Fact]
    public async Task AddVersion_IncrementsVersionNumber()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var createHandler = new CreateCommunicationTemplateCommandHandler(db, new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId));
        var addHandler = new AddCommunicationTemplateVersionCommandHandler(db, new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId));

        var templateId = await createHandler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = "ORDER-CREATED",
            Name = "X",
            EntityScope = CommunicationEntityScope.MaintenanceOrder,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Content = "v1" }
            }
        }, CancellationToken.None);

        var versionId = await addHandler.Handle(new AddCommunicationTemplateVersionCommand
        {
            TemplateId = templateId,
            Translations = new List<AddCommunicationTemplateVersionCommand.TranslationInput>
            {
                new() { Locale = "es", Content = "v2" },
                new() { Locale = "en", Content = "v2-en" }
            }
        }, CancellationToken.None);

        var version = await db.CommunicationTemplateVersions
            .Include(v => v.Translations)
            .FirstAsync(v => v.Id == versionId);

        Assert.Equal(2, version.VersionNumber);
        Assert.Equal(2, version.Translations.Count);

        // La version activa sigue siendo la v1 hasta activar explicitamente
        var template = await db.CommunicationTemplates.FirstAsync(t => t.Id == templateId);
        var v1 = await db.CommunicationTemplateVersions.FirstAsync(v => v.TemplateId == templateId && v.VersionNumber == 1);
        Assert.Equal(v1.Id, template.ActiveVersionId);
    }

    [Fact]
    public async Task ActivateVersion_UpdatesActiveVersionId()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var createHandler = new CreateCommunicationTemplateCommandHandler(db, resolver);
        var addHandler = new AddCommunicationTemplateVersionCommandHandler(db, resolver);
        var activateHandler = new ActivateCommunicationTemplateVersionCommandHandler(db, resolver);

        var templateId = await createHandler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = "ASSET-STATE-CHANGED",
            Name = "X",
            EntityScope = CommunicationEntityScope.Asset,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Content = "v1" }
            }
        }, CancellationToken.None);

        var version2Id = await addHandler.Handle(new AddCommunicationTemplateVersionCommand
        {
            TemplateId = templateId,
            Translations = new List<AddCommunicationTemplateVersionCommand.TranslationInput>
            {
                new() { Locale = "es", Content = "v2" }
            }
        }, CancellationToken.None);

        await activateHandler.Handle(new ActivateCommunicationTemplateVersionCommand
        {
            TemplateId = templateId,
            VersionId = version2Id
        }, CancellationToken.None);

        var template = await db.CommunicationTemplates.FirstAsync(t => t.Id == templateId);
        Assert.Equal(version2Id, template.ActiveVersionId);
    }
}
