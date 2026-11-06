using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Common.Workflow;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Maintenance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Commands;

public class UpdateMaintenanceOrderPropertiesCommandHandler : IRequestHandler<UpdateMaintenanceOrderPropertiesCommand, Unit>
{
    private readonly ITenantDbContext _db;

    public UpdateMaintenanceOrderPropertiesCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<Unit> Handle(UpdateMaintenanceOrderPropertiesCommand request, CancellationToken cancellationToken)
    {
        var order = await _db.MaintenanceOrders
            .FirstOrDefaultAsync(o => o.Id == request.MaintenanceOrderId, cancellationToken);
        if (order == null)
            throw new NotFoundException("Orden de mantenimiento no encontrada");

        if (order.State == MaintenanceOrderStates.Verified)
            throw new InvalidOperationException("No se puede actualizar una orden verificada");

        var propertiesChanged = !PropertyPropagation.SemanticJsonEquals(order.PropertiesJson, request.PropertiesJson);
        order.PropertiesJson = request.PropertiesJson;

        if (propertiesChanged)
        {
            await PropertyPropagation.PropagateOrderPropertiesToTasksAsync(
                _db,
                order.Id,
                request.PropertiesJson,
                cancellationToken);
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
