using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Events;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AssetHub.Application.Tasks.EventHandlers;

public class WorkTaskCreatedEventHandler : INotificationHandler<WorkTaskCreatedEvent>
{
    private readonly ITenantDbContext _db;
    private readonly IEmailService _emailService;
    private readonly ILogger<WorkTaskCreatedEventHandler> _logger;

    public WorkTaskCreatedEventHandler(
        ITenantDbContext db,
        IEmailService emailService,
        ILogger<WorkTaskCreatedEventHandler> logger)
    {
        _db = db;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task Handle(WorkTaskCreatedEvent notification, CancellationToken cancellationToken)
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
                            var task = await _db.WorkTasks
                                .FirstOrDefaultAsync(t => t.Id == notification.TaskId, cancellationToken);

                            var taskTitle = task?.Title ?? "Nueva Tarea";
                            var subject = $"Notificación: Nueva Tarea de Trabajo ({taskTitle})";
                            var body = $"Se ha generado una nueva Tarea de Trabajo: '{taskTitle}'.\nPor favor revise el sistema para más detalles.";

                            await _emailService.SendEmailAsync(employee.Email, subject, body, cancellationToken);
                            _logger.LogInformation("=> Correo de nueva tarea enviado exitosamente a {Email}", employee.Email);
                        }
                        else
                        {
                            _logger.LogWarning("=> No se encontró el empleado con ID {EmployeeId} o no tiene un email configurado (Tarea).", targetEmployeeId);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("=> El valor del campo destinatario {TargetFieldId} no es un GUID válido (Tarea).", targetFieldId);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando el envío de correo para nueva tarea");
        }
    }
}
