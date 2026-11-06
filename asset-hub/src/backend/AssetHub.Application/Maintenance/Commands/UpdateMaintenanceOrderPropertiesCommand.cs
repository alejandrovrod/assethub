using System;
using MediatR;

namespace AssetHub.Application.Maintenance.Commands;

public class UpdateMaintenanceOrderPropertiesCommand : IRequest<Unit>
{
    public Guid MaintenanceOrderId { get; set; }
    public string PropertiesJson { get; set; } = "{}";
}

