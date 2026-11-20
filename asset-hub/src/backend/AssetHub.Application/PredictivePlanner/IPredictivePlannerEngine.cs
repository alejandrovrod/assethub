using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.PredictivePlanner;

namespace AssetHub.Application.PredictivePlanner;

/// <summary>
/// Deterministic projection engine. Reads only existing tenant entities and never
/// performs arithmetic inside the LLM or persists rows.
/// </summary>
public interface IPredictivePlannerEngine
{
    Task<PredictiveForecastSnapshot> BuildSnapshotAsync(
        PredictiveForecastRequest request,
        DateTime utcNow,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Port for the AI advisory layer. Receives the already-validated deterministic snapshot
/// and returns a narrative proposal only (Human-in-the-Loop).
/// </summary>
public interface IPredictivePlannerAgent
{
    Task<PredictivePlannerAdvisoryDraft> AnalyzeAsync(
        PredictiveForecastSnapshot snapshot,
        string preferredLanguage,
        CancellationToken cancellationToken = default);
}
