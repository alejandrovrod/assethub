using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class RecordMaintenanceCostsCommand : IRequest<Unit>
{
    public Guid MaintenanceOrderId { get; set; }
    public decimal LaborCost { get; set; }
    
    public List<PartDto> Parts { get; set; } = new();

    public class PartDto
    {
        public Guid CatalogItemId { get; set; }
        public int Quantity { get; set; }
        public decimal UnitCost { get; set; }
    }
}

public class RecordMaintenanceCostsCommandHandler : IRequestHandler<RecordMaintenanceCostsCommand, Unit>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public RecordMaintenanceCostsCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<Unit> Handle(RecordMaintenanceCostsCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();
        
        var order = await _db.MaintenanceOrders.FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);
        if (order == null)
            throw new ArgumentException("Maintenance order not found");
            
        if (order.State == "verified")
            throw new InvalidOperationException("Cannot record costs on a verified maintenance order");
            
        order.LaborCost = request.LaborCost;

        foreach (var part in request.Parts)
        {
            var itemExists = await _db.CatalogItems.AnyAsync(c => c.Id == part.CatalogItemId, cancellationToken);
            if (!itemExists)
                throw new ArgumentException($"Catalog item {part.CatalogItemId} not found");

            _db.MaintenanceParts.Add(new MaintenancePart
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId.Value,
                MaintenanceOrderId = order.Id,
                CatalogItemId = part.CatalogItemId,
                Quantity = part.Quantity,
                UnitCost = part.UnitCost
            });
        }
        
        await _db.SaveChangesAsync(cancellationToken);
        
        return Unit.Value;
    }
}
