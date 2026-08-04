using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class ApproveMaintenanceOrderCommand : IRequest<Unit>
{
    public Guid MaintenanceOrderId { get; set; }
}

public class ApproveMaintenanceOrderCommandHandler : IRequestHandler<ApproveMaintenanceOrderCommand, Unit>
{
    private readonly ITenantDbContext _db;

    public ApproveMaintenanceOrderCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<Unit> Handle(ApproveMaintenanceOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _db.MaintenanceOrders.FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);
        if (order == null)
            throw new ArgumentException("Maintenance order not found");
            
        if (order.State != "draft")
            throw new InvalidOperationException($"Cannot approve order in state {order.State}");
            
        order.State = "approved";
        await _db.SaveChangesAsync(cancellationToken);
        
        return Unit.Value;
    }
}
