using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Incidents.Events;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;
using AssetHub.Application.Interfaces;

namespace AssetHub.Application.Incidents.EventHandlers;

public class IncidentAssignedEventHandler : INotificationHandler<IncidentAssignedEvent>
{
    private readonly ITenantDbContext _db;

    public IncidentAssignedEventHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task Handle(IncidentAssignedEvent notification, CancellationToken cancellationToken)
    {
        var incident = await _db.Incidents
            .Include(i => i.MaintenanceOrders)
            .FirstOrDefaultAsync(i => i.Id == notification.IncidentId && i.TenantId == notification.TenantId, cancellationToken);

        if (incident == null)
            return;

        var hasCorrectiveOrder = incident.MaintenanceOrders.Any(o => !o.IsDeleted && o.Kind == MaintenanceOrderKinds.Corrective);
        if (hasCorrectiveOrder)
            return;

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = notification.TenantId,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.Draft,
            Title = $"Orden correctiva: {incident.Title}",
            Description = incident.Description,
            AssetId = notification.AssetId,
            IncidentId = notification.IncidentId
        };

        _db.MaintenanceOrders.Add(order);
        await _db.SaveChangesAsync(cancellationToken);
    }
}
