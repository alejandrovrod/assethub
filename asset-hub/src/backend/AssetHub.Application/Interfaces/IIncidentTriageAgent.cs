using System.Threading;
using System.Threading.Tasks;

namespace AssetHub.Application.Interfaces;

/// <summary>
/// Port for the AI Incident Triage Agent. Produces a reviewable diagnostic and dispatch
/// proposal without persisting any changes (Human-in-the-Loop).
/// </summary>
public interface IIncidentTriageAgent
{
    Task<AssetHub.Application.IncidentTriage.IncidentTriageDraft> AnalyzeAsync(
        AssetHub.Application.IncidentTriage.IncidentTriageRequest request,
        CancellationToken cancellationToken = default);
}
