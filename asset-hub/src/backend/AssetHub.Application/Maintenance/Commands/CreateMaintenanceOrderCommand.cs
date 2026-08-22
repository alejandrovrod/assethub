using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class CreateMaintenanceOrderCommand : IRequest<Guid>
{
    public string Kind { get; set; } = MaintenanceOrderKinds.Corrective;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid AssetId { get; set; }

    public Guid? PreventivePlanId { get; set; }
    public Guid? WorkflowTemplateId { get; set; }
    public Guid? IncidentId { get; set; }
}

public class CreateMaintenanceOrderCommandHandler : IRequestHandler<CreateMaintenanceOrderCommand, Guid>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public CreateMaintenanceOrderCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<Guid> Handle(CreateMaintenanceOrderCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();

        var assetExists = await _db.Assets.AnyAsync(a => a.Id == request.AssetId, cancellationToken);
        if (!assetExists)
            throw new ArgumentException("Asset not found");

        if (string.IsNullOrWhiteSpace(request.Kind))
            throw new ArgumentException("Kind cannot be empty.");

        if (request.PreventivePlanId.HasValue && request.IncidentId.HasValue)
            throw new ArgumentException("Order cannot have both a PreventivePlanId and an IncidentId");

        var order = new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            Kind = request.Kind,
            State = MaintenanceOrderStates.Draft,
            Title = request.Title,
            Description = request.Description,
            AssetId = request.AssetId,
            PreventivePlanId = request.PreventivePlanId,
            IncidentId = request.IncidentId,
            WorkflowTemplateId = request.WorkflowTemplateId
        };

        _db.MaintenanceOrders.Add(order);
        await _db.SaveChangesAsync(cancellationToken);

        return order.Id;
    }
}
