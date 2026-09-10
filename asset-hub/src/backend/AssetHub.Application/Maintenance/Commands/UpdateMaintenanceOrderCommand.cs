using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.Dtos;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class UpdateMaintenanceOrderCommand : IRequest<MaintenanceOrderSummaryDto>
{
    public Guid MaintenanceOrderId { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public Guid? AssignedEmployeeId { get; set; }
    public DateTime? ScheduledStart { get; set; }
    public DateTime? ScheduledEnd { get; set; }
    public bool? RemovePreventivePlan { get; set; }
    public string? PropertiesJson { get; set; }
}

public class UpdateMaintenanceOrderCommandHandler : IRequestHandler<UpdateMaintenanceOrderCommand, MaintenanceOrderSummaryDto>
{
    private readonly ITenantDbContext _db;

    public UpdateMaintenanceOrderCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<MaintenanceOrderSummaryDto> Handle(UpdateMaintenanceOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _db.MaintenanceOrders
            .Include(o => o.Asset)
            .Include(o => o.PreventivePlan)
            .Include(o => o.Incident)
            .Include(o => o.AssignedEmployee)
            .FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);
        if (order == null)
            throw new ArgumentException("Orden de mantenimiento no encontrada");

        if (order.State == MaintenanceOrderStates.Verified)
            throw new InvalidOperationException("No se puede actualizar una orden verificada");

        if (request.Title != null)
            order.Title = request.Title;
        if (request.Description != null)
            order.Description = request.Description;
        if (request.AssignedEmployeeId.HasValue)
            order.AssignedEmployeeId = request.AssignedEmployeeId.Value;
        if (request.ScheduledStart.HasValue)
            order.ScheduledStart = request.ScheduledStart.Value;
        if (request.ScheduledEnd.HasValue)
            order.ScheduledEnd = request.ScheduledEnd.Value;
        if (request.RemovePreventivePlan == true)
            order.PreventivePlanId = null;
        if (request.PropertiesJson != null)
            order.PropertiesJson = request.PropertiesJson;

        await _db.SaveChangesAsync(cancellationToken);

        return new MaintenanceOrderSummaryDto
        {
            Id = order.Id,
            Kind = order.Kind,
            State = order.State,
            Title = order.Title,
            CreatedAt = order.CreatedAt,
            ScheduledStart = order.ScheduledStart,
            ScheduledEnd = order.ScheduledEnd,
            CompletedAt = order.CompletedAt,
            LaborCost = order.LaborCost,
            PartsCount = order.Parts.Count,
            AssetId = order.AssetId,
            AssetName = order.Asset?.Name,
            PreventivePlanId = order.PreventivePlanId,
            PreventivePlanName = order.PreventivePlan?.Name,
            IncidentId = order.IncidentId,
            IncidentTitle = order.Incident?.Title,
            AssignedEmployeeId = order.AssignedEmployeeId,
            AssignedEmployeeName = order.AssignedEmployee != null ? $"{order.AssignedEmployee.FirstName} {order.AssignedEmployee.LastName}" : null
        };
    }
}
