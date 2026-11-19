using System;
using System.Collections.Generic;
using System.Linq;

namespace AssetHub.Application.IncidentTriage;

/// <summary>
/// Pure, deterministic validator and grounder for AI triage output.
/// Ensures every ID, state, and spare part matches real tenant entities and replaces
/// any LLM-supplied stock or cost numbers with authoritative database values.
/// </summary>
public static class IncidentTriageProposalValidator
{
    private const int MaxListItems = 8;

    private static readonly Dictionary<string, string> AllowedSeverities = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Low"] = "Low",
        ["Medium"] = "Medium",
        ["High"] = "High",
        ["Critical"] = "Critical"
    };

    public static ValidatedIncidentTriageProposal ValidateAndGround(
        IncidentTriageDraft? draft,
        IncidentTriageRequest context)
    {
        if (draft is null || string.IsNullOrWhiteSpace(draft.Summary))
        {
            throw new InvalidOperationException("The AI triage agent returned an empty or incomplete proposal.");
        }

        var warnings = new List<string>();

        var severity = NormalizeSeverity(draft.RecommendedSeverity, warnings);
        var confidence = Math.Clamp(draft.ConfidenceScore, 0.0, 1.0);

        var priorityId = ResolvePriorityId(draft, context.Priorities, warnings);
        var technicianId = ResolveTechnicianId(draft, context.Technicians, warnings);
        var targetState = ResolveTargetState(draft, context.ReachableStates, warnings);
        var suggestedParts = ResolveParts(draft.SuggestedParts, context.CandidateParts, warnings);

        return new ValidatedIncidentTriageProposal(
            Summary: draft.Summary.Trim(),
            RecommendedSeverity: severity,
            SeverityRationale: draft.SeverityRationale?.Trim() ?? string.Empty,
            ConfidenceScore: confidence,
            VisualFindings: string.IsNullOrWhiteSpace(draft.VisualFindings) ? null : draft.VisualFindings.Trim(),
            SuggestedPriorityId: priorityId,
            SuggestedTechnicianId: technicianId,
            TechnicianRationale: string.IsNullOrWhiteSpace(draft.TechnicianRationale) ? null : draft.TechnicianRationale.Trim(),
            SuggestedTargetState: targetState,
            RecommendWorkOrder: draft.RecommendWorkOrder,
            ProbableRootCauses: CleanList(draft.ProbableRootCauses),
            DiagnosticSteps: CleanList(draft.DiagnosticSteps),
            SafetyPrecautions: CleanList(draft.SafetyPrecautions),
            SuggestedParts: suggestedParts,
            ValidationWarnings: warnings
        );
    }

    private static string NormalizeSeverity(string? rawSeverity, List<string> warnings)
    {
        if (!string.IsNullOrWhiteSpace(rawSeverity) &&
            AllowedSeverities.TryGetValue(rawSeverity.Trim(), out var canonical))
        {
            return canonical;
        }

        warnings.Add($"Unrecognized severity '{rawSeverity}' defaulted to 'Medium'.");
        return "Medium";
    }

    private static Guid? ResolvePriorityId(
        IncidentTriageDraft draft,
        IReadOnlyList<TriagePriorityOption> priorities,
        List<string> warnings)
    {
        if (priorities.Count == 0)
            return null;

        if (!string.IsNullOrWhiteSpace(draft.SuggestedPriorityId) &&
            Guid.TryParse(draft.SuggestedPriorityId.Trim(), out var parsedId))
        {
            var exact = priorities.FirstOrDefault(p => p.Id == parsedId);
            if (exact is not null)
                return exact.Id;
        }

        if (!string.IsNullOrWhiteSpace(draft.SuggestedPriorityCode))
        {
            var token = draft.SuggestedPriorityCode.Trim();
            var byCodeOrLabel = priorities.FirstOrDefault(p =>
                string.Equals(p.Code, token, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(p.Label, token, StringComparison.OrdinalIgnoreCase));

            if (byCodeOrLabel is not null)
                return byCodeOrLabel.Id;
        }

        if (!string.IsNullOrWhiteSpace(draft.SuggestedPriorityId) || !string.IsNullOrWhiteSpace(draft.SuggestedPriorityCode))
        {
            warnings.Add("Suggested priority did not match any tenant priority catalog item and was cleared.");
        }

        return null;
    }

    private static Guid? ResolveTechnicianId(
        IncidentTriageDraft draft,
        IReadOnlyList<TriageTechnicianOption> technicians,
        List<string> warnings)
    {
        if (technicians.Count == 0)
            return null;

        if (!string.IsNullOrWhiteSpace(draft.SuggestedTechnicianId) &&
            Guid.TryParse(draft.SuggestedTechnicianId.Trim(), out var parsedId))
        {
            var exact = technicians.FirstOrDefault(t => t.Id == parsedId);
            if (exact is not null)
                return exact.Id;
        }

        if (!string.IsNullOrWhiteSpace(draft.SuggestedTechnicianName))
        {
            var token = draft.SuggestedTechnicianName.Trim();
            var byName = technicians.FirstOrDefault(t =>
                string.Equals(t.FullName, token, StringComparison.OrdinalIgnoreCase));

            if (byName is not null)
                return byName.Id;
        }

        if (!string.IsNullOrWhiteSpace(draft.SuggestedTechnicianId) || !string.IsNullOrWhiteSpace(draft.SuggestedTechnicianName))
        {
            warnings.Add("Suggested technician did not match an active tenant employee and was cleared.");
        }

        return null;
    }

    private static string? ResolveTargetState(
        IncidentTriageDraft draft,
        IReadOnlyList<TriageReachableStateOption> reachableStates,
        List<string> warnings)
    {
        if (string.IsNullOrWhiteSpace(draft.SuggestedTargetState))
            return null;

        var token = draft.SuggestedTargetState.Trim();
        var match = reachableStates.FirstOrDefault(s =>
            string.Equals(s.Name, token, StringComparison.OrdinalIgnoreCase));

        if (match is not null)
            return match.Name;

        warnings.Add($"Suggested target state '{draft.SuggestedTargetState}' is not reachable from the current state and was cleared.");
        return null;
    }

    private static IReadOnlyList<ValidatedSuggestedPart> ResolveParts(
        IEnumerable<SuggestedPartDraft>? rawParts,
        IReadOnlyList<TriageCandidatePartOption> candidateParts,
        List<string> warnings)
    {
        if (rawParts is null)
            return Array.Empty<ValidatedSuggestedPart>();

        var result = new List<ValidatedSuggestedPart>();
        var seen = new HashSet<Guid>();

        foreach (var raw in rawParts)
        {
            if (raw is null)
                continue;

            TriageCandidatePartOption? matched = null;

            if (!string.IsNullOrWhiteSpace(raw.CatalogItemId) &&
                Guid.TryParse(raw.CatalogItemId.Trim(), out var parsedId))
            {
                matched = candidateParts.FirstOrDefault(p => p.CatalogItemId == parsedId);
            }

            if (matched is null && !string.IsNullOrWhiteSpace(raw.Code))
            {
                var codeToken = raw.Code.Trim();
                matched = candidateParts.FirstOrDefault(p =>
                    string.Equals(p.Code, codeToken, StringComparison.OrdinalIgnoreCase));
            }

            if (matched is null)
            {
                warnings.Add($"Suggested spare part '{raw.Code ?? raw.CatalogItemId ?? "unknown"}' was ignored because it is not in the tenant inventory context.");
                continue;
            }

            if (!seen.Add(matched.CatalogItemId))
                continue;

            var clampedQty = Math.Clamp(raw.Quantity, 1, 999);
            result.Add(new ValidatedSuggestedPart(
                CatalogItemId: matched.CatalogItemId,
                Code: matched.Code,
                Label: matched.Label,
                Quantity: clampedQty,
                Reason: raw.Reason?.Trim() ?? string.Empty,
                AvailableStock: matched.AvailableStock,
                PrimaryWarehouseId: matched.PrimaryWarehouseId,
                WarehouseName: matched.WarehouseName,
                EstimatedUnitCost: matched.AverageUnitCost
            ));
        }

        return result;
    }

    private static IReadOnlyList<string> CleanList(IEnumerable<string>? items)
    {
        if (items is null)
            return Array.Empty<string>();

        return items
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxListItems)
            .ToList();
    }
}
