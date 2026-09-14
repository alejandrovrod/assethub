using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.CommunicationTemplates;
using AssetHub.Application.CommunicationTemplates.Commands;
using AssetHub.Application.CommunicationTemplates.Rendering;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.EventHandlers;
using AssetHub.Application.Maintenance.Events;
using AssetHub.Domain.CommunicationTemplates;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Services.Templates;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace AssetHub.Api.Tests.CommunicationTemplates;

public class MaintenanceOrderCreatedEventHandlerTests
{
    private static string PropsWithRecipient(Guid employeeId) =>
        JsonSerializer.Serialize(new { reportar_a = employeeId.ToString() });

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
            FirstName = "Juan",
            LastName = "Pérez",
            Email = "juan@test.com",
            PreferredLocale = "es"
        };
        db.Employees.Add(employee);

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Revisión de bomba",
            Kind = "corrective",
            State = "draft"
        };
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        // Plantilla activa del tenant
        var createHandler = new CreateCommunicationTemplateCommandHandler(db, resolver);
        await createHandler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = "ORDER-CREATED",
            Name = "Orden creada",
            EntityScope = CommunicationEntityScope.MaintenanceOrder,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new System.Collections.Generic.List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Subject = "Orden {{order.title}} creada", Content = "Hola {{recipient.name}}, se creó la orden {{order.title}}." }
            }
        }, CancellationToken.None);

        var handler = new MaintenanceOrderCreatedEventHandler(
            db,
            email,
            CommunicationTemplateTestHelper.CreateTemplateService(db),
            new TemplateVariableBuilder(db),
            NullLogger<MaintenanceOrderCreatedEventHandler>.Instance);

        await handler.Handle(new MaintenanceOrderCreatedEvent(order.Id, tenantId, order.AssetId, PropsWithRecipient(employee.Id)), CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Equal("juan@test.com", sent.To);
        Assert.Equal("Orden Revisión de bomba creada", sent.Subject);
        Assert.Contains("Hola Juan Pérez", sent.Body);
        Assert.Contains("Revisión de bomba", sent.Body);
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
            FirstName = "Ana",
            LastName = "López",
            Email = "ana@test.com",
            PreferredLocale = "es"
        };
        db.Employees.Add(employee);

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Cambio de filtro",
            Kind = "corrective",
            State = "draft"
        };
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        var handler = new MaintenanceOrderCreatedEventHandler(
            db,
            email,
            CommunicationTemplateTestHelper.CreateTemplateService(db),
            new TemplateVariableBuilder(db),
            NullLogger<MaintenanceOrderCreatedEventHandler>.Instance);

        await handler.Handle(new MaintenanceOrderCreatedEvent(order.Id, tenantId, order.AssetId, PropsWithRecipient(employee.Id)), CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Contains("Notificación: Nueva Orden de Mantenimiento", sent.Subject);
        Assert.Contains("Cambio de filtro", sent.Body);
    }

    [Fact]
    public async Task Handle_RecipientLocaleEnglish_RendersEnglishTranslation()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var resolver = new CommunicationTemplateTestHelper.FakeTenantResolver(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();

        var employee = new Employee
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FirstName = "John",
            LastName = "Doe",
            Email = "john@test.com",
            PreferredLocale = "en"
        };
        db.Employees.Add(employee);

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Pump review",
            Kind = "corrective",
            State = "draft"
        };
        db.MaintenanceOrders.Add(order);
        await db.SaveChangesAsync();

        var createHandler = new CreateCommunicationTemplateCommandHandler(db, resolver);
        await createHandler.Handle(new CreateCommunicationTemplateCommand
        {
            Code = "ORDER-CREATED",
            Name = "Orden creada",
            EntityScope = CommunicationEntityScope.MaintenanceOrder,
            TemplateType = CommunicationTemplateType.Email,
            Translations = new System.Collections.Generic.List<CreateCommunicationTemplateCommand.TranslationInput>
            {
                new() { Locale = "es", Subject = "Orden {{order.title}} creada", Content = "Hola {{recipient.name}}" },
                new() { Locale = "en", Subject = "Order {{order.title}} created", Content = "Hi {{recipient.name}}, order {{order.title}} was created." }
            }
        }, CancellationToken.None);

        var handler = new MaintenanceOrderCreatedEventHandler(
            db,
            email,
            CommunicationTemplateTestHelper.CreateTemplateService(db),
            new TemplateVariableBuilder(db),
            NullLogger<MaintenanceOrderCreatedEventHandler>.Instance);

        await handler.Handle(new MaintenanceOrderCreatedEvent(order.Id, tenantId, order.AssetId, PropsWithRecipient(employee.Id)), CancellationToken.None);

        var sent = Assert.Single(email.Sent);
        Assert.Equal("Order Pump review created", sent.Subject);
        Assert.Contains("Hi John Doe", sent.Body);
    }

    [Fact]
    public async Task Handle_NoRecipientInProperties_SendsNothing()
    {
        var tenantId = Guid.NewGuid();
        var db = CommunicationTemplateTestHelper.CreateDbContext(tenantId);
        var email = new CommunicationTemplateTestHelper.CapturingEmailService();

        var handler = new MaintenanceOrderCreatedEventHandler(
            db,
            email,
            CommunicationTemplateTestHelper.CreateTemplateService(db),
            new TemplateVariableBuilder(db),
            NullLogger<MaintenanceOrderCreatedEventHandler>.Instance);

        await handler.Handle(new MaintenanceOrderCreatedEvent(Guid.NewGuid(), tenantId, null, "{}"), CancellationToken.None);

        Assert.Empty(email.Sent);
    }
}
