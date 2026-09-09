using System;

namespace AssetHub.Domain.Inventory;

public class TenantInventorySettings
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public bool Enabled { get; set; }
    public string OperatingMode { get; set; } = InventoryOperatingMode.External;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
