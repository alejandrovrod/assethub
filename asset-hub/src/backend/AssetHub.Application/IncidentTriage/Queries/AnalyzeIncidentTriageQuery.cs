using System;
using System.Collections.Generic;
using AssetHub.Application.IncidentTriage;
using MediatR;

namespace AssetHub.Application.IncidentTriage.Queries;

public sealed record AnalyzeIncidentTriageQuery(
    Guid IncidentId,
    string? AdditionalNotes = null
) : IRequest<IncidentTriageProposalResponse>;

public sealed record IncidentTriageProposalResponse(
    Guid IncidentId,
    string CurrentState,
    int ImagesAnalyzedCount,
    string Summary,
    string RecommendedSeverity,
    string SeverityRationale,
    double ConfidenceScore,
    string? VisualFindings,
    Guid? SuggestedPriorityId,
    Guid? SuggestedTechnicianId,
    string? TechnicianRationale,
    string? SuggestedTargetState,
    bool RecommendWorkOrder,
    IReadOnlyList<string> ProbableRootCauses,
    IReadOnlyList<string> DiagnosticSteps,
    IReadOnlyList<string> SafetyPrecautions,
    IReadOnlyList<ValidatedSuggestedPart> SuggestedParts,
    IReadOnlyList<string> ValidationWarnings,
    IReadOnlyList<TriagePriorityOption> AvailablePriorities,
    IReadOnlyList<TriageTechnicianOption> AvailableTechnicians,
    IReadOnlyList<TriageReachableStateOption> ReachableStates,
    IReadOnlyList<TriageCandidatePartOption> AvailableParts,
    int RecentAssetIncidentsCount,
    bool HasExistingCorrectiveOrder
);
