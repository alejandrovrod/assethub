using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Incidents.EventHandlers;

/// <summary>
/// Guarantees that a corrective order has at least one task to execute.
///
/// An order without tasks is invisible in the field: the technician has nothing to open, so
/// the whole propagation chain dies one link before the person who needs it. This also repairs
/// orders created by older builds, which copied the properties but never created the task.
/// </summary>
internal static class IncidentOrderTaskFactory
{
    public static async Task EnsureExecutableTaskAsync(
        ITenantDbContext db,
        IMediator mediator,
        MaintenanceOrder order,
        Incident incident,
        CancellationToken cancellationToken)
    {
        var alreadyHasTask = await db.WorkTasks
            .AnyAsync(t => t.MaintenanceOrderId == order.Id && !t.IsDeleted, cancellationToken);

        if (alreadyHasTask)
            return;

        // The task hangs from the order only: a task can have exactly one parent.
        await mediator.Send(new CreateWorkTaskCommand
        {
            Title = incident.Title,
            Description = incident.Description,
            MaintenanceOrderId = order.Id,
            AssignedEmployeeId = order.AssignedEmployeeId,
            PropertiesJson = order.PropertiesJson
        }, cancellationToken);
    }
}
