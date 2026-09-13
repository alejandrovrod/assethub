using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.CommunicationTemplates;
using AssetHub.Application.CommunicationTemplates.Commands;
using AssetHub.Application.CommunicationTemplates.Rendering;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.EventHandlers;
using AssetHub.Application.Tasks.Events;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.CommunicationTemplates;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Services.Templates;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace AssetHub.Api.Tests.CommunicationTemplates;

public class WorkTaskCreatedEventHandlerTests
{
    private static string PropsWithRecipient(Guid employeeId) =>
        JsonSerializer.Serialize(new { recibe_a = employeeId.ToString() });

    [Fact]
    public async Task Handle_WithActiveTemplate_UsesTemplateContent()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();

        var employee = new Employee
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FirstName = "María",
            LastName = "Gómez",
            Email = "maria@test.com",
            PreferredLocale = "es"
        };
        db.Employees.Add(employee);

        var typeItem = new CatalogItem { Id = Guid.NewGuid(), TenantId = tenantId, CatalogId = Guid.NewGuid(), Code = "inspection" };
        var priorityItem = new CatalogItem { Id = Guid.NewGuid(), TenantId = tenantId, CatalogId = Guid.NewGuid(), Code = "high" };
        db.CatalogItems.AddRange(typeItem, priorityItem);

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Inspección semanal",
            State = WorkTaskStates.Todo,
            TaskTypeCatalogItemId = typeItem.Id,
            PriorityCatalogItemId = priorityItem.Id
        };
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var createHandler = new CreateCommunicationTemplateCommandHandler(db, resolver);
        await createHandler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = "TASK-CREATED",
            Name = "Tarea creada",
            EntityScope = CommunicationEntityScope.WorkTask,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new System.Collections.Generic.List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Subject = "Tarea {{task.title}} asignada", Content = "Hola {{recipient.name}}, tarea {{task.title}} ({{task.state}})." }
            }
        }, CancellationToken.None);

        var handler = new WorkTaskCreatedEventHandler(
            db,
            email,
            new CommunicationTemplateService(db, new ScribanTemplateRenderEngine()),
            new TemplateVariableBuilder(db),
            NullLogger<WorkTaskCreatedEventHandler>.Instance);

        await handler.Handle(new WorkTaskCreatedEvent(task.Id, tenantId, null, PropsWithRecipient(employee.Id)), CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Equal("maria@test.com", sent.To);
        Assert.Equal("Tarea Inspección semanal asignada", sent.Subject);
        Assert.Contains("Hola María Gómez", sent.Body);
        Assert.Contains("todo", sent.Body);
    }

    [Fact]
    public async Task Handle_WithoutTemplate_FallsBackToHardcodedText()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();

        var employee = new Employee
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FirstName = "Pedro",
            LastName = "Díaz",
            Email = "pedro@test.com",
            PreferredLocale = "es"
        };
        db.Employees.Add(employee);

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Limpieza",
            State = WorkTaskStates.Todo
        };
        db.WorkTasks.Add(task);
        await db.SaveChangesAsync();

        var handler = new WorkTaskCreatedEventHandler(
            db,
            email,
            new CommunicationTemplateService(db, new ScribanTemplateRenderEngine()),
            new TemplateVariableBuilder(db),
            NullLogger<WorkTaskCreatedEventHandler>.Instance);

        await handler.Handle(new WorkTaskCreatedEvent(task.Id, tenantId, null, PropsWithRecipient(employee.Id)), CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Contains("Notificación: Nueva Tarea de Trabajo", sent.Subject);
        Assert.Contains("Limpieza", sent.Body);
    }

    [Fact]
    public async Task Handle_NoProperties_SendsNothing()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();

        var handler = new WorkTaskCreatedEventHandler(
            db,
            email,
            new CommunicationTemplateService(db, new ScribanTemplateRenderEngine()),
            new TemplateVariableBuilder(db),
            NullLogger<WorkTaskCreatedEventHandler>.Instance);

        await handler.Handle(new WorkTaskCreatedEvent(Guid.NewGuid(), tenantId, null, "{}"), CancellationToken.None);

        Assert.Empty(email.Sent);
    }
}
