using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Incidents.Events;
using AssetHub.Application.Maintenance.Events;
using AssetHub.Domain.Incidents;
using MediatR;
using Microsoft.EntityFrameworkCore;
using AssetHub.Application.Interfaces;

namespace AssetHub.Application.Maintenance.EventHandlers;

public class MaintenanceOrderVerifiedEventHandler : INotificationHandler<MaintenanceOrderVerifiedEvent>
{
    private readonly ITenantDbContext _db;
    private readonly IMediator _mediator;

    public MaintenanceOrderVerifiedEventHandler(ITenantDbContext db, IMediator mediator)
    {
        _db = db;
        _mediator = mediator;
    }

    public async Task Handle(MaintenanceOrderVerifiedEvent notification, CancellationToken cancellationToken)
    {
        if (notification.IncidentId == null)
            return;

        var incident = await _db.Incidents
            .FirstOrDefaultAsync(i => i.Id == notification.IncidentId.Value && i.TenantId == notification.TenantId, cancellationToken);

        if (incident == null || IncidentStates.TerminalStates.Contains(incident.State))
            return;

        var fromState = incident.State;
        incident.State = IncidentStates.Closed;
        incident.ClosedAt = DateTime.UtcNow;

        _db.IncidentLifecycleEvents.Add(new IncidentLifecycleEvent
        {
            Id = Guid.NewGuid(),
            IncidentId = incident.Id,
            EventType = "cambio de estado",
            FromState = fromState,
            ToState = IncidentStates.Closed,
            Notes = $"Cierre automático tras verificar orden de mantenimiento {notification.MaintenanceOrderId}",
            PropertiesJson = "{}",
            At = DateTime.UtcNow,
            UserId = Guid.Empty // Sistema
        });

        await _db.SaveChangesAsync(cancellationToken);

        await _mediator.Publish(new IncidentClosedEvent(
            incident.Id,
            incident.AssetId,
            incident.TenantId,
            IncidentStates.Closed
        ), cancellationToken);
    }
}
