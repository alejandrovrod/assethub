using System;
using AssetHub.Domain.Catalogs;

namespace AssetHub.Domain.Maintenance;

public class MaintenancePart
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public Guid MaintenanceOrderId { get; set; }
    public MaintenanceOrder? MaintenanceOrder { get; set; }
    
    public Guid CatalogItemId { get; set; }
    public CatalogItem? CatalogItem { get; set; }
    
    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
}
