using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class AddMaintenancePartCommand : IRequest<Guid>
{
    public Guid MaintenanceOrderId { get; set; }
    public Guid CatalogItemId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
    
    // Inventory integration
    public string SourceType { get; set; } = "None"; // None, Internal, External
    public Guid? WarehouseId { get; set; }
    public string? ExternalSupplierName { get; set; }
    public string? ExternalReference { get; set; }
}

public class AddMaintenancePartCommandHandler : IRequestHandler<AddMaintenancePartCommand, Guid>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;
    private readonly IInventoryPostingService _inventoryPostingService;

    public AddMaintenancePartCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver, IInventoryPostingService inventoryPostingService)
    {
        _db = db;
        _tenantResolver = tenantResolver;
        _inventoryPostingService = inventoryPostingService;
    }

    public async Task<Guid> Handle(AddMaintenancePartCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();

        var order = await _db.MaintenanceOrders.FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);
        if (order == null)
            throw new ArgumentException("Maintenance order not found");

        if (order.State == MaintenanceOrderStates.Verified)
            throw new InvalidOperationException("Cannot add parts to a verified maintenance order");

        var catalogItemExists = await _db.CatalogItems.AnyAsync(c => c.Id == request.CatalogItemId, cancellationToken);
        if (!catalogItemExists)
            throw new ArgumentException($"Catalog item {request.CatalogItemId} not found");

        var part = new MaintenancePart
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            MaintenanceOrderId = order.Id,
            CatalogItemId = request.CatalogItemId,
            Quantity = request.Quantity,
            UnitCost = request.UnitCost,
            SourceType = request.SourceType,
            WarehouseId = request.WarehouseId,
            ExternalSupplierName = request.ExternalSupplierName,
            ExternalReference = request.ExternalReference
        };

        if (request.SourceType == "Internal" && request.WarehouseId.HasValue)
        {
            // Post transaction
            var transaction = await _inventoryPostingService.PostTransactionAsync(
                warehouseId: request.WarehouseId.Value,
                catalogItemId: request.CatalogItemId,
                quantity: -request.Quantity, // Consuming, so negative
                unitCost: request.UnitCost,
                type: "Consumption",
                reason: $"Consumption for Order {order.Id}",
                idempotencyKey: $"Consume_{part.Id}",
                maintenanceOrderId: order.Id,
                cancellationToken: cancellationToken
            );

            part.InventoryTransactionId = transaction.Id;
            part.UnitCost = transaction.UnitCost; // Inherit moving average cost
        }

        _db.MaintenanceParts.Add(part);
        await _db.SaveChangesAsync(cancellationToken);

        return part.Id;
    }
}
