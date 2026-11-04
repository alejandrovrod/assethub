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
/// Opens the corrective maintenance order when the incident reaches a state whose lifecycle
/// config points at the maintenance module.
///
/// The order is born executable: it inherits the propagating properties of the incident (the
/// ones the incident template marks with <c>propagateToWork</c>), it takes its owner from the
/// executor declared in those properties, and it gets a work task hanging from it so the
/// technician actually has something to pick up in the field app.
/// </summary>
public class IncidentAssignedEventHandler : INotificationHandler<IncidentAssignedEvent>
{
    private readonly ITenantDbContext _db;
    private readonly IMediator _mediator;

    public IncidentAssignedEventHandler(ITenantDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task Handle(IncidentAssignedEvent notification, CancellationToken cancellationToken)
    {
        var incident = await _db.Incidents
            .Include(i => i.WorkflowTemplate)
            .Include(i => i.MaintenanceOrders)
            .FirstOrDefaultAsync(i => i.Id == notification.IncidentId && i.TenantId == notification.TenantId, cancellationToken);

        if (incident == null)
            return;

        var existingOrder = incident.MaintenanceOrders
            .Where(o => !o.IsDeleted && o.Kind == MaintenanceOrderKinds.Corrective)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefault();

        // The order already exists (created by a previous transition or an older build):
        // keep it, but make sure it has something to execute. This repairs orders that were
        // created before tasks were generated automatically.
        if (existingOrder != null)
        {
            await IncidentOrderTaskFactory.EnsureExecutableTaskAsync(
                _db,
                _mediator,
                existingOrder,
                incident,
                cancellationToken);
            return;
        }

        // Only the fields the incident template declares as propagating travel to the order.
        // Attachments and internal answers stay in the incident.
        var properties = PropertyPropagation.FilterToPropagatable(
            incident.PropertiesJson,
            incident.WorkflowTemplate?.SchemaJson);

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = notification.TenantId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Draft,
            Title = $"Orden correctiva: {incident.Title}",
            Description = incident.Description,
            AssetId = notification.AssetId,
            IncidentId = notification.IncidentId,
            WorkflowTemplateId = incident.WorkflowTemplateId,
            PropertiesJson = properties
        };

        if (WorkflowProperties.TryGetExecutorId(properties, out var executorId))
        {
            order.AssignedEmployeeId = executorId;
        }

        _db.MaintenanceOrders.Add(order);
        await _db.SaveChangesAsync(cancellationToken);

        // The order is useless without a task: nothing to execute means nothing shows up in
        // the technician's journey. If this step fails, the order stays behind but the next
        // incident edit repairs it — see the existing-order branch above.
        await IncidentOrderTaskFactory.EnsureExecutableTaskAsync(
            _db,
            _mediator,
            order,
            incident,
            cancellationToken);

        await _mediator.Publish(new AssetHub.Application.Maintenance.Events.MaintenanceOrderCreatedEvent(
            order.Id,
            order.TenantId,
            order.AssetId,
            order.PropertiesJson
        ), cancellationToken);
    }
}
