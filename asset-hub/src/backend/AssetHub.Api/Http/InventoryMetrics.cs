using System.Diagnostics.Metrics;

namespace AssetHub.Api.Http;

/// <summary>
/// Contadores de inventario expuestos bajo el meter <c>AssetHub.Inventory</c>.
/// </summary>
public static class InventoryMetrics
{
    private static readonly Meter Meter = new("AssetHub.Inventory", "1.0.0");

    /// <summary>
    /// <c>POST /inventory/adjustments</c> sin <c>Idempotency-Key</c>.
    ///
    /// El endpoint sigue generando una key para no romper a los clientes actuales, pero
    /// eso es exactamente lo que hace que un reintento de red descuadre el stock: cada
    /// llamada sin key es un movimiento distinto. El contador existe para medir cuánto
    /// falta para poder exigir la key también ahí.
    /// </summary>
    public static readonly Counter<long> AdjustmentMissingKey =
        Meter.CreateCounter<long>("inventory.adjustment.missing_key", unit: "requests");
}
