using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Workflow;
using AssetHub.Application.Incidents.Events;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Incidents.EventHandlers;

/// <summary>
/// Keeps the open corrective maintenance order in sync with its incident.
///
/// <see cref="IncidentAssignedEventHandler"/> copies the properties once, when the order is
/// created. Without this handler every later edit of the incident — a new diagnosis, a different
/// technician, a new project — stays trapped in the incident and never reaches the order, and
/// therefore never reaches the tasks hanging from it.
/// </summary>
public class IncidentStateChangedEventHandler :
    INotificationHandler<IncidentStateChangedEvent>,
    INotificationHandler<IncidentPropertiesChangedEvent>
{
    private readonly ITenantDbContext _db;
    private readonly IMediator _mediator;

    public IncidentStateChangedEventHandler(ITenantDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public Task Handle(IncidentStateChangedEvent notification, CancellationToken cancellationToken)
        => SyncOpenOrderAsync(notification.IncidentId, cancellationToken);

    public Task Handle(IncidentPropertiesChangedEvent notification, CancellationToken cancellationToken)
        => SyncOpenOrderAsync(notification.IncidentId, cancellationToken);

    private async Task SyncOpenOrderAsync(Guid incidentId, CancellationToken cancellationToken)
    {
        var incident = await _db.Incidents
            .Include(i => i.WorkflowTemplate)
            .Include(i => i.MaintenanceOrders)
            .FirstOrDefaultAsync(i => i.Id == incidentId, cancellationToken);

        if (incident == null)
            return;

        var order = incident.MaintenanceOrders
            .Where(o => !o.IsDeleted)
            .Where(o => o.Kind == MaintenanceOrderKinds.Corrective)
            .Where(o => !MaintenanceOrderStates.TerminalStates.Contains(o.State))
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefault();

        // No open order yet: creating it is IncidentAssignedEventHandler's responsibility.
        if (order == null)
            return;

        var merged = PropertyPropagation.SyncPropagatable(
            order.PropertiesJson,
            incident.PropertiesJson,
            incident.WorkflowTemplate?.SchemaJson);

        if (!PropertyPropagation.SemanticJsonEquals(order.PropertiesJson, merged))
        {
            order.PropertiesJson = merged;

            if (WorkflowProperties.TryGetExecutorId(merged, out var executorId))
            {
                order.AssignedEmployeeId = executorId;
            }

            // Mutates the tracked tasks in place; the single SaveChanges below persists the
            // whole chain at once so the order and its tasks never end up in different states.
            await PropertyPropagation.PropagateOrderPropertiesToTasksAsync(
                _db,
                order.Id,
                merged,
                cancellationToken);

            await _db.SaveChangesAsync(cancellationToken);
        }

        // Self-healing: an open order without tasks is dead weight in the field. Older builds
        // created the order but never the task, so we repair it on the next incident edit.
        await IncidentOrderTaskFactory.EnsureExecutableTaskAsync(
            _db,
            _mediator,
            order,
            incident,
            cancellationToken);
    }
}
