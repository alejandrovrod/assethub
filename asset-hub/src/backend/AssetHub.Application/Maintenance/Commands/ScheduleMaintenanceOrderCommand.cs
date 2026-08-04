using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class ScheduleMaintenanceOrderCommand : IRequest<Unit>
{
    public Guid MaintenanceOrderId { get; set; }
    public Guid AssignedEmployeeId { get; set; }
    public DateTime ScheduledStart { get; set; }
    public DateTime ScheduledEnd { get; set; }
}

public class ScheduleMaintenanceOrderCommandHandler : IRequestHandler<ScheduleMaintenanceOrderCommand, Unit>
{
    private readonly ITenantDbContext _db;

    public ScheduleMaintenanceOrderCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<Unit> Handle(ScheduleMaintenanceOrderCommand request, CancellationToken cancellationToken)
    {
        if (request.ScheduledEnd < request.ScheduledStart)
            throw new ArgumentException("ScheduledEnd cannot be before ScheduledStart");
            
        var order = await _db.MaintenanceOrders.FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);
        if (order == null)
            throw new ArgumentException("Maintenance order not found");

        if (order.State != "approved" && order.State != "draft")
            throw new InvalidOperationException($"Cannot schedule order in state {order.State}");

        order.AssignedEmployeeId = request.AssignedEmployeeId;
        order.ScheduledStart = request.ScheduledStart;
        order.ScheduledEnd = request.ScheduledEnd;
        
        // Asumiendo avance en el ciclo de vida
        if (order.State == "approved")
        {
            order.State = "scheduled";
        }
        
        await _db.SaveChangesAsync(cancellationToken);
        
        return Unit.Value;
    }
}
