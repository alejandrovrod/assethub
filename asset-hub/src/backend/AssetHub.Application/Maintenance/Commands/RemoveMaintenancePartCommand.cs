using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class RemoveMaintenancePartCommand : IRequest<Unit>
{
    public Guid MaintenanceOrderId { get; set; }
    public Guid PartId { get; set; }
}

public class RemoveMaintenancePartCommandHandler : IRequestHandler<RemoveMaintenancePartCommand, Unit>
{
    private readonly ITenantDbContext _db;

    public RemoveMaintenancePartCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<Unit> Handle(RemoveMaintenancePartCommand request, CancellationToken cancellationToken)
    {
        var part = await _db.MaintenanceParts
            .FirstOrDefaultAsync(p => p.Id == request.PartId && p.MaintenanceOrderId == request.MaintenanceOrderId, cancellationToken);

        if (part == null)
            throw new ArgumentException("Part not found");

        var order = await _db.MaintenanceOrders
            .FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);

        if (order?.State == MaintenanceOrderStates.Verified)
            throw new InvalidOperationException("Cannot remove parts from a verified maintenance order");

        _db.MaintenanceParts.Remove(part);
        await _db.SaveChangesAsync(cancellationToken);

        return Unit.Value;
    }
}
