using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Field;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

/// <summary>
/// Elimina una evidencia capturada en una tarea (022).
///
/// El cliente de campo borra la foto en la tablet y encola un DELETE en el outbox: el
/// reintento puede llegar dos veces (lease vencido, dos pestañas, reconexión). Por eso el
/// handler es idempotente cuando la evidencia ya no existe —el objetivo del comando ya se
/// cumplió— y sólo falla cuando la tarea está cerrada, que sí es un error de negocio.
/// </summary>
public record DeleteTaskEvidenceCommand(Guid WorkTaskId, Guid EvidenceId) : IRequest;

public class DeleteTaskEvidenceCommandHandler : IRequestHandler<DeleteTaskEvidenceCommand>
{
    /// <summary>
    /// Estados de la orden padre que congelan sus tareas: una orden entregada, verificada o
    /// cancelada ya no admite cambios en la evidencia de lo que se hizo.
    /// </summary>
    private static readonly HashSet<string> LockedOrderStates = new(StringComparer.Ordinal)
    {
        MaintenanceOrderStates.Done,
        MaintenanceOrderStates.Verified,
        MaintenanceOrderStates.Cancelled,
    };

    private readonly ITenantDbContext _db;
    private readonly FieldTaskAccess _access;

    public DeleteTaskEvidenceCommandHandler(ITenantDbContext db, FieldTaskAccess access)
    {
        _db = db;
        _access = access;
    }

    public async Task Handle(DeleteTaskEvidenceCommand request, CancellationToken cancellationToken)
    {
        // Se materializa la tarea (no un AnyAsync) porque la visibilidad del rol de campo
        // depende de AssignedEmployeeId/AssignedTeamId: sin la fila no hay nada que evaluar.
        var task = await _db.WorkTasks
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == request.WorkTaskId, cancellationToken);

        if (task is null)
        {
            // 404 y no 403: para un id de otro tenant el filtro global ya lo hace
            // inexistente, así que distinguirlos filtraría información.
            throw new NotFoundException("WorkTask", request.WorkTaskId);
        }

        // Primero la propiedad (403) y después el estado (422): un técnico no debe poder
        // deducir desde el mensaje de error si la tarea de otro equipo está cerrada.
        await _access.EnsureCanOperateAsync(task, cancellationToken);

        await EnsureTaskIsEditableAsync(task, cancellationToken);

        var evidence = await _db.TaskEvidences
            .FirstOrDefaultAsync(
                e => e.Id == request.EvidenceId && e.WorkTaskId == request.WorkTaskId,
                cancellationToken);

        // Idempotencia explícita: el outbox offline reintenta y el registro puede haber
        // desaparecido en el primer intento (respuesta perdida en el camino).
        if (evidence is null)
        {
            return;
        }

        _db.TaskEvidences.Remove(evidence);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureTaskIsEditableAsync(WorkTask task, CancellationToken cancellationToken)
    {
        if (WorkTaskStates.TerminalStates.Contains(task.State))
        {
            throw new InvalidOperationException(
                "No se pueden eliminar evidencias de una tarea en estado terminal");
        }

        if (task.MaintenanceOrderId is not { } orderId)
        {
            return;
        }

        var orderState = await _db.MaintenanceOrders
            .Where(o => o.Id == orderId)
            .Select(o => o.State)
            .FirstOrDefaultAsync(cancellationToken);

        if (orderState is not null && LockedOrderStates.Contains(orderState))
        {
            throw new InvalidOperationException(
                "No se pueden eliminar evidencias de una tarea cuya orden de mantenimiento está cerrada");
        }
    }
}
