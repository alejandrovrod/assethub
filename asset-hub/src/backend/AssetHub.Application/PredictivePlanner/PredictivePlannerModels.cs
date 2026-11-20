using System;
using System.Collections.Generic;

namespace AssetHub.Application.PredictivePlanner;

/// <summary>
/// Input for the deterministic predictive planner. Only existing tenant entities are read;
/// nothing is persisted (Human-in-the-Loop, zero migrations).
/// </summary>
public sealed record PredictiveForecastRequest(
    int HorizonDays = 30,
    Guid? AssetTemplateId = null,
    Guid? WarehouseId = null,
    decimal? MeterIntervalOverride = null,
    string? MeterKeyOverride = null);

public enum ServiceSource
{
    PreventivePlan,
    MeterBurnRate,
    HealthRisk
}

/// <summary>One service occurrence expanded into the forecast horizon.</summary>
public sealed record ProjectedService(
    string ServiceKey,
    Guid AssetId,
    string AssetCode,
    string AssetName,
    Guid? AssetTemplateId,
    string Label,
    ServiceSource Source,
    DateTime DueDate,
    int DaysUntilDue,
    Guid? PreventivePlanId,
    string? MeterKey,
    decimal? CurrentMeterValue,
    decimal? TargetMeterValue,
    decimal? BurnRatePerDay,
    string? BurnRateConfidence,
    string? RiskLevel);

/// <summary>Diagnostics about how the meter burn rate was derived per asset.</summary>
public sealed record MeterProjection(
    Guid AssetId,
    string AssetCode,
    string MeterKey,
    decimal CurrentValue,
    decimal? TargetValue,
    decimal? Interval,
    decimal? BurnRatePerDay,
    string Confidence,
    DateTime? ProjectedServiceDate);

/// <summary>Chronological inventory crossing: cumulative demand vs. free stock.</summary>
public sealed record StockoutForecast(
    Guid CatalogItemId,
    string Code,
    string Label,
    decimal RequiredQuantity,
    decimal AvailableQuantity,
    decimal ShortfallQuantity,
    int? DaysUntilStockout,
    DateTime? StockoutDate,
    decimal EstimatedRestockCost,
    string Currency,
    IReadOnlyList<Guid> AffectedAssetIds,
    IReadOnlyList<string> AffectedAssetCodes);

/// <summary>ISO-week workshop saturation from projected services plus open backlog.</summary>
public sealed record WeeklyWorkshopLoad(
    int IsoYear,
    int IsoWeek,
    DateTime WeekStart,
    DateTime WeekEnd,
    int ProjectedServices,
    int BacklogTasks,
    decimal ProjectedHours,
    decimal AvailableHours,
    decimal SaturationPercent,
    bool IsOverloaded);

/// <summary>Budget projection derived from inventory crossings plus historical costs.</summary>
public sealed record BudgetProjection(
    string Currency,
    decimal CoveredPartsCost,
    decimal UrgentPurchaseCost,
    decimal EstimatedLaborCost,
    decimal HistoricalRunRateCost,
    decimal EstimatedTotalCost,
    int ProjectedServiceCount,
    decimal AverageCostPerService,
    decimal HistoricalDailyCost);

/// <summary>
/// Fully deterministic numeric forecast computed in C#. This is the only input the LLM
/// is allowed to reason about.
/// </summary>
public sealed record PredictiveForecastSnapshot(
    DateTime GeneratedAt,
    int HorizonDays,
    DateTime HorizonStart,
    DateTime HorizonEnd,
    Guid? AssetTemplateId,
    Guid? WarehouseId,
    string Currency,
    IReadOnlyList<ProjectedService> ProjectedServices,
    IReadOnlyList<StockoutForecast> StockoutForecasts,
    IReadOnlyList<WeeklyWorkshopLoad> WeeklyWorkshopLoad,
    BudgetProjection BudgetProjection,
    IReadOnlyList<MeterProjection> MeterProjections);

/// <summary>Raw structured JSON produced by the LLM before deterministic grounding.</summary>
public sealed class PredictivePlannerAdvisoryDraft
{
    public string ExecutiveSummary { get; set; } = string.Empty;
    public List<EarlyWarningDraft> EarlyWarnings { get; set; } = new();
    public List<PurchaseSuggestionDraft> PurchaseSuggestions { get; set; } = new();
    public List<ScheduleRecommendationDraft> ScheduleRecommendations { get; set; } = new();
}

public sealed class EarlyWarningDraft
{
    public string Severity { get; set; } = "Medium";
    public string Type { get; set; } = "Stockout";
    public string Message { get; set; } = string.Empty;
    public int DaysAhead { get; set; }
    public List<string> AffectedAssetIds { get; set; } = new();
    public List<string> AffectedCatalogItemIds { get; set; } = new();
}

public sealed class PurchaseSuggestionDraft
{
    public string? CatalogItemId { get; set; }
    public string? Code { get; set; }
    public decimal QuantityToBuy { get; set; }
    public decimal EstimatedCost { get; set; }
    public DateTime? NeededByDate { get; set; }
    public List<string> AffectedAssetIds { get; set; } = new();
    public string Rationale { get; set; } = string.Empty;
}

public sealed class ScheduleRecommendationDraft
{
    public string Recommendation { get; set; } = string.Empty;
    public List<string> AffectedAssetIds { get; set; } = new();
    public DateTime? SuggestedDate { get; set; }
    public string Rationale { get; set; } = string.Empty;
}

/// <summary>Advisory after validating every ID, quantity, cost and date against the snapshot.</summary>
public sealed record PredictivePlannerAdvisory(
    string ExecutiveSummary,
    IReadOnlyList<PredictiveEarlyWarning> EarlyWarnings,
    IReadOnlyList<PredictivePurchaseSuggestion> PurchaseSuggestions,
    IReadOnlyList<PredictiveScheduleRecommendation> ScheduleRecommendations,
    IReadOnlyList<string> ValidationWarnings);

public sealed record PredictiveEarlyWarning(
    string Severity,
    string Type,
    string Message,
    int DaysAhead,
    IReadOnlyList<Guid> AffectedAssetIds,
    IReadOnlyList<Guid> AffectedCatalogItemIds);

public sealed record PredictivePurchaseSuggestion(
    Guid CatalogItemId,
    string Code,
    decimal QuantityToBuy,
    decimal EstimatedCost,
    DateTime? NeededByDate,
    IReadOnlyList<Guid> AffectedAssetIds,
    string Rationale);

public sealed record PredictiveScheduleRecommendation(
    string Recommendation,
    IReadOnlyList<Guid> AffectedAssetIds,
    DateTime? SuggestedDate,
    string Rationale);

/// <summary>
/// API response. When the AI advisory cannot be produced the deterministic snapshot is
/// still returned in full and <see cref="AdvisoryGenerated"/> is false.
/// </summary>
public sealed record PredictivePlannerForecastResponse(
    PredictiveForecastSnapshot Forecast,
    PredictivePlannerAdvisory? Advisory,
    bool AdvisoryGenerated,
    IReadOnlyList<string> Warnings);
