using System;
using System.Collections.Generic;
using AssetHub.Application.IncidentTriage;
using AssetHub.Application.Interfaces;
using Xunit;

namespace AssetHub.Api.Tests.IncidentTriage;

public class IncidentTriageProposalValidatorTests
{
    private static readonly Guid PriorityHighId = Guid.NewGuid();
    private static readonly Guid TechAliceId = Guid.NewGuid();
    private static readonly Guid PartSealId = Guid.NewGuid();
    private static readonly Guid WarehouseMainId = Guid.NewGuid();

    private static IncidentTriageRequest BuildContext()
    {
        return new IncidentTriageRequest(
            Incident: new IncidentSnapshot(
                Id: Guid.NewGuid(),
                Title: "Hydraulic pressure drop",
                Description: "Main boom cylinder leaking oil under load",
                State: "reported",
                ReportedAt: DateTime.UtcNow,
                SanitizedPropertiesJson: "{}",
                AdditionalSupervisorNotes: null),
            Asset: new AssetSnapshot(
                Id: Guid.NewGuid(),
                Code: "EXC-01",
                Name: "Excavator 01",
                State: "OPERATIONAL",
                ConditionIndex: 68m,
                TemplateName: "Hydraulic Excavator",
                MaintenanceChecklist: string.Empty,
                SanitizedPropertiesJson: "{}",
                HealthRiskLevel: "High",
                HealthRiskProbability: 0.82m),
            RecentIncidents: Array.Empty<HistoricalIncidentSnapshot>(),
            RecentCorrectiveOrders: Array.Empty<HistoricalOrderSnapshot>(),
            Priorities: new[]
            {
                new TriagePriorityOption(PriorityHighId, "HIGH", "High")
            },
            Technicians: new[]
            {
                new TriageTechnicianOption(
                    TechAliceId,
                    "Alice hydraulics",
                    "Senior Technician",
                    new[] { "Hydraulics" },
                    new[] { "Field Team A" },
                    true,
                    ActiveOrdersCount: 1,
                    ActiveTasksCount: 1)
            },
            ReachableStates: new[]
            {
                new TriageReachableStateOption("triaged", false),
                new TriageReachableStateOption("assigned", true)
            },
            CandidateParts: new[]
            {
                new TriageCandidatePartOption(
                    CatalogItemId: PartSealId,
                    Code: "SEAL-HYD-01",
                    Label: "Hydraulic Seal Kit",
                    IsBomPart: true,
                    IsCritical: true,
                    AvailableStock: 12m,
                    PrimaryWarehouseId: WarehouseMainId,
                    WarehouseName: "Central Warehouse",
                    AverageUnitCost: 145.50m)
            },
            Images: Array.Empty<LoadedIncidentImage>(),
            PreferredLanguage: "en");
    }

    [Fact]
    public void ValidateAndGround_ValidDraft_ResolvesIdsAndEnrichesPartInventoryFromDb()
    {
        var context = BuildContext();
        var draft = new IncidentTriageDraft
        {
            Summary = "Seal failure on boom cylinder.",
            RecommendedSeverity = "High",
            SeverityRationale = "Visible oil loss affects lifting safety.",
            ConfidenceScore = 0.91,
            SuggestedPriorityId = PriorityHighId.ToString(),
            SuggestedTechnicianId = TechAliceId.ToString(),
            TechnicianRationale = "Hydraulics specialist with low workload.",
            SuggestedTargetState = "assigned",
            RecommendWorkOrder = true,
            ProbableRootCauses = new List<string> { "Worn piston seal" },
            DiagnosticSteps = new List<string> { "Inspect cylinder rod scoring" },
            SafetyPrecautions = new List<string> { "Lower boom and relieve hydraulic pressure" },
            SuggestedParts = new List<SuggestedPartDraft>
            {
                new() { CatalogItemId = PartSealId.ToString(), Code = "SEAL-HYD-01", Quantity = 2, Reason = "Replace leaking seal" }
            }
        };

        var result = IncidentTriageProposalValidator.ValidateAndGround(draft, context);

        Assert.Equal("High", result.RecommendedSeverity);
        Assert.Equal(0.91, result.ConfidenceScore);
        Assert.Equal(PriorityHighId, result.SuggestedPriorityId);
        Assert.Equal(TechAliceId, result.SuggestedTechnicianId);
        Assert.Equal("assigned", result.SuggestedTargetState);
        Assert.Single(result.SuggestedParts);
        Assert.Equal(12m, result.SuggestedParts[0].AvailableStock);
        Assert.Equal(145.50m, result.SuggestedParts[0].EstimatedUnitCost);
        Assert.Equal("Central Warehouse", result.SuggestedParts[0].WarehouseName);
        Assert.Empty(result.ValidationWarnings);
    }

    [Fact]
    public void ValidateAndGround_HallucinatedIdsWithValidFallbackNames_ResolvesByCodeOrName()
    {
        var context = BuildContext();
        var draft = new IncidentTriageDraft
        {
            Summary = "Likely hydraulic leak.",
            RecommendedSeverity = "Critical",
            ConfidenceScore = 0.8,
            SuggestedPriorityId = Guid.NewGuid().ToString(),
            SuggestedPriorityCode = "high",
            SuggestedTechnicianId = "not-a-guid",
            SuggestedTechnicianName = "alice hydraulics",
            SuggestedTargetState = "ASSIGNED",
            SuggestedParts = new List<SuggestedPartDraft>
            {
                new() { CatalogItemId = Guid.NewGuid().ToString(), Code = "seal-hyd-01", Quantity = 1, Reason = "Match by code" }
            }
        };

        var result = IncidentTriageProposalValidator.ValidateAndGround(draft, context);

        Assert.Equal(PriorityHighId, result.SuggestedPriorityId);
        Assert.Equal(TechAliceId, result.SuggestedTechnicianId);
        Assert.Equal("assigned", result.SuggestedTargetState);
        Assert.Single(result.SuggestedParts);
        Assert.Equal(PartSealId, result.SuggestedParts[0].CatalogItemId);
    }

    [Fact]
    public void ValidateAndGround_HallucinatedPartsAndUnreachableState_DropsUnknownsAndEmitsWarnings()
    {
        var context = BuildContext();
        var draft = new IncidentTriageDraft
        {
            Summary = "Unknown electrical issue.",
            RecommendedSeverity = "ExtremeHazard",
            ConfidenceScore = 1.75,
            SuggestedPriorityId = Guid.NewGuid().ToString(),
            SuggestedTechnicianId = Guid.NewGuid().ToString(),
            SuggestedTargetState = "closed",
            SuggestedParts = new List<SuggestedPartDraft>
            {
                new() { CatalogItemId = Guid.NewGuid().ToString(), Code = "FAKE-999", Quantity = 5, Reason = "Invented SKU" }
            }
        };

        var result = IncidentTriageProposalValidator.ValidateAndGround(draft, context);

        Assert.Equal("Medium", result.RecommendedSeverity);
        Assert.Equal(1.0, result.ConfidenceScore);
        Assert.Null(result.SuggestedPriorityId);
        Assert.Null(result.SuggestedTechnicianId);
        Assert.Null(result.SuggestedTargetState);
        Assert.Empty(result.SuggestedParts);
        Assert.True(result.ValidationWarnings.Count >= 4);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ValidateAndGround_NullOrEmptySummaryDraft_ThrowsInvalidOperationException(bool useNullDraft)
    {
        var context = BuildContext();
        var draft = useNullDraft ? null : new IncidentTriageDraft { Summary = "   " };

        Assert.Throws<InvalidOperationException>(() =>
            IncidentTriageProposalValidator.ValidateAndGround(draft, context));
    }
}
