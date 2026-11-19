using System;
using System.Collections.Generic;
using AssetHub.Application.Interfaces;

namespace AssetHub.Application.IncidentTriage;

/// <summary>
/// Domain-grounded request sent to the Incident Triage AI Agent. Every selectable ID
/// (priority, technician, target state, spare part) originates from real tenant data so
/// downstream validation can eliminate hallucinations.
/// </summary>
public sealed record IncidentTriageRequest(
    IncidentSnapshot Incident,
    AssetSnapshot Asset,
    IReadOnlyList<HistoricalIncidentSnapshot> RecentIncidents,
    IReadOnlyList<HistoricalOrderSnapshot> RecentCorrectiveOrders,
    IReadOnlyList<TriagePriorityOption> Priorities,
    IReadOnlyList<TriageTechnicianOption> Technicians,
    IReadOnlyList<TriageReachableStateOption> ReachableStates,
    IReadOnlyList<TriageCandidatePartOption> CandidateParts,
    IReadOnlyList<LoadedIncidentImage> Images,
    string PreferredLanguage
);

public sealed record IncidentSnapshot(
    Guid Id,
    string Title,
    string? Description,
    string State,
    DateTime ReportedAt,
    string SanitizedPropertiesJson,
    string? AdditionalSupervisorNotes
);

public sealed record AssetSnapshot(
    Guid Id,
    string Code,
    string Name,
    string State,
    decimal? ConditionIndex,
    string TemplateName,
    string MaintenanceChecklist,
    string SanitizedPropertiesJson,
    string? HealthRiskLevel,
    decimal? HealthRiskProbability
);

public sealed record HistoricalIncidentSnapshot(
    Guid Id,
    string Title,
    string? Description,
    string State,
    DateTime ReportedAt,
    DateTime? ResolvedAt
);

public sealed record HistoricalOrderSnapshot(
    Guid Id,
    string Title,
    string State,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    IReadOnlyList<string> UsedPartLabels
);

public sealed record TriagePriorityOption(
    Guid Id,
    string Code,
    string Label
);

public sealed record TriageTechnicianOption(
    Guid Id,
    string FullName,
    string RoleLabel,
    IReadOnlyList<string> Skills,
    IReadOnlyList<string> Teams,
    bool IsAvailableToday,
    int ActiveOrdersCount,
    int ActiveTasksCount
);

public sealed record TriageReachableStateOption(
    string Name,
    bool TriggersWorkOrder
);

public sealed record TriageCandidatePartOption(
    Guid CatalogItemId,
    string Code,
    string Label,
    bool IsBomPart,
    bool IsCritical,
    decimal AvailableStock,
    Guid? PrimaryWarehouseId,
    string? WarehouseName,
    decimal AverageUnitCost
);

/// <summary>
/// Raw structured JSON output produced by the LLM before deterministic grounding.
/// IDs remain nullable strings so malformed model tokens never break deserialization.
/// </summary>
public sealed class IncidentTriageDraft
{
    public string Summary { get; set; } = string.Empty;
    public string RecommendedSeverity { get; set; } = "Medium";
    public string SeverityRationale { get; set; } = string.Empty;
    public double ConfidenceScore { get; set; } = 0.5;
    public string? SuggestedPriorityId { get; set; }
    public string? SuggestedPriorityCode { get; set; }
    public string? SuggestedTechnicianId { get; set; }
    public string? SuggestedTechnicianName { get; set; }
    public string? TechnicianRationale { get; set; }
    public string? SuggestedTargetState { get; set; }
    public bool RecommendWorkOrder { get; set; }
    public List<string> ProbableRootCauses { get; set; } = new();
    public List<string> DiagnosticSteps { get; set; } = new();
    public List<string> SafetyPrecautions { get; set; } = new();
    public List<SuggestedPartDraft> SuggestedParts { get; set; } = new();
    public string? VisualFindings { get; set; }
}

public sealed class SuggestedPartDraft
{
    public string? CatalogItemId { get; set; }
    public string? Code { get; set; }
    public int Quantity { get; set; } = 1;
    public string Reason { get; set; } = string.Empty;
}

/// <summary>
/// Deterministic, domain-grounded proposal after validating LLM output against tenant records.
/// </summary>
public sealed record ValidatedIncidentTriageProposal(
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
    IReadOnlyList<string> ValidationWarnings
);

public sealed record ValidatedSuggestedPart(
    Guid CatalogItemId,
    string Code,
    string Label,
    int Quantity,
    string Reason,
    decimal AvailableStock,
    Guid? PrimaryWarehouseId,
    string? WarehouseName,
    decimal EstimatedUnitCost
);
