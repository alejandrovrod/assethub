using System.Diagnostics.Metrics;

namespace AssetHub.Api.Http;

/// <summary>
/// Contadores de idempotencia. Se exponen por el nombre de meter
/// <c>AssetHub.Idempotency</c> para que cualquier exporter (OpenTelemetry,
/// Prometheus) los recoja sin instrumentación adicional.
/// </summary>
public static class IdempotencyMetrics
{
    private static readonly Meter Meter = new("AssetHub.Idempotency", "1.0.0");

    public static readonly Counter<long> Reserved =
        Meter.CreateCounter<long>("idempotency.reserved", unit: "requests");

    public static readonly Counter<long> Replays =
        Meter.CreateCounter<long>("idempotency.replay", unit: "requests");

    public static readonly Counter<long> KeyReuseConflicts =
        Meter.CreateCounter<long>("idempotency.conflict", unit: "requests");

    public static readonly Counter<long> InProgressConflicts =
        Meter.CreateCounter<long>("idempotency.in_progress", unit: "requests");

    public static readonly Counter<long> Released =
        Meter.CreateCounter<long>("idempotency.released", unit: "requests");
}
