using System;
using AssetHub.Domain.Catalogs;

namespace AssetHub.Domain.Inventory;

public class InventoryTransaction
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    public Guid WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }

    public Guid CatalogItemId { get; set; }
    public CatalogItem? CatalogItem { get; set; }

    public Guid? MaintenanceOrderId { get; set; }

    /// <summary>
    /// Tarea que consumió el material. Nullable porque las recepciones y ajustes del
    /// backoffice no nacen de una tarea.
    ///
    /// Sin este vínculo, "¿qué repuestos gastó esta OT?" sólo se puede responder por
    /// heurística de fecha o de texto en <see cref="Reason"/>, y el técnico no puede
    /// justificar el consumo desde la tablet.
    /// </summary>
    public Guid? WorkTaskId { get; set; }

    public string Type { get; set; } = string.Empty; // Receipt, Issue, Adjustment, Reversal
    public string State { get; set; } = InventoryTransactionState.Draft;

    public decimal Quantity { get; set; }
    public decimal UnitCost { get; set; }
    
    public string? Reason { get; set; }
    public string? CreatedBy { get; set; }
    
    public DateTime CreatedAt { get; set; }
    public DateTime? PostedAt { get; set; }
    
    public Guid? ReversalOfId { get; set; }
    
    public string IdempotencyKey { get; set; } = string.Empty;
}
