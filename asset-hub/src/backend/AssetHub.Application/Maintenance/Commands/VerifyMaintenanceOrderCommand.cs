using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class VerifyMaintenanceOrderCommand : IRequest<Unit>
{
    public Guid MaintenanceOrderId { get; set; }
}

public class VerifyMaintenanceOrderCommandHandler : IRequestHandler<VerifyMaintenanceOrderCommand, Unit>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public VerifyMaintenanceOrderCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<Unit> Handle(VerifyMaintenanceOrderCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();
        
        var order = await _db.MaintenanceOrders.FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);
        if (order == null)
            throw new ArgumentException("Maintenance order not found");

        if (order.State != "done")
            throw new InvalidOperationException($"Cannot verify order from state {order.State}");

        order.State = "verified";
        order.CompletedAt = DateTime.UtcNow;
        
        _db.AssetLifecycleEvents.Add(new AssetLifecycleEvent
        {
            Id = Guid.NewGuid(),
            AssetId = order.AssetId,
            EventType = "MaintenanceIntervention",
            At = order.CompletedAt.Value,
            Notes = $"Verified maintenance order {order.Title}"
        });
        
        await _db.SaveChangesAsync(cancellationToken);
        
        return Unit.Value;
    }
}
