using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.Events;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AssetHub.Application.Maintenance.EventHandlers;

public class MaintenanceOrderCreatedEventHandler : INotificationHandler<MaintenanceOrderCreatedEvent>
{
    private readonly ITenantDbContext _db;
    private readonly IEmailService _emailService;
    private readonly ILogger<MaintenanceOrderCreatedEventHandler> _logger;

    public MaintenanceOrderCreatedEventHandler(
        ITenantDbContext db,
        IEmailService emailService,
        ILogger<MaintenanceOrderCreatedEventHandler> logger)
    {
        _db = db;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task Handle(MaintenanceOrderCreatedEvent notification, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(notification.PropertiesJson) || notification.PropertiesJson == "{}")
        {
            return;
        }

        try
        {
            var propsDoc = JsonDocument.Parse(notification.PropertiesJson);
            
            // Revisa si existe "reportar_a" o "recibe_a"
            string targetFieldId = null;
            if (propsDoc.RootElement.TryGetProperty("reportar_a", out _))
            {
                targetFieldId = "reportar_a";
            }
            else if (propsDoc.RootElement.TryGetProperty("recibe_a", out _))
            {
                targetFieldId = "recibe_a";
            }

            if (targetFieldId != null)
            {
                if (propsDoc.RootElement.TryGetProperty(targetFieldId, out var targetValueElement))
                {
                    var targetValueStr = targetValueElement.GetString();
                    if (Guid.TryParse(targetValueStr, out var targetEmployeeId))
                    {
                        var employee = await _db.Employees.FirstOrDefaultAsync(e => e.Id == targetEmployeeId, cancellationToken);
                        if (employee != null && !string.IsNullOrEmpty(employee.Email))
                        {
                            var order = await _db.MaintenanceOrders
                                .FirstOrDefaultAsync(o => o.Id == notification.OrderId, cancellationToken);

                            var orderTitle = order?.Title ?? "Nueva Orden";
                            var subject = $"Notificación: Nueva Orden de Mantenimiento ({orderTitle})";
                            var body = $"Se ha generado una nueva Orden de Mantenimiento: '{orderTitle}'.\nPor favor revise el sistema para más detalles.";

                            await _emailService.SendEmailAsync(employee.Email, subject, body, cancellationToken);
                            _logger.LogInformation("=> Correo de nueva orden enviado exitosamente a {Email}", employee.Email);
                        }
                        else
                        {
                            _logger.LogWarning("=> No se encontró el empleado con ID {EmployeeId} o no tiene un email configurado (Orden).", targetEmployeeId);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("=> El valor del campo destinatario {TargetFieldId} no es un GUID válido (Orden).", targetFieldId);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando el envío de correo para nueva orden");
        }
    }
}
