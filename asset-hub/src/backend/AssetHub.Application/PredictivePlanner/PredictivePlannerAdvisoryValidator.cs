using System;
using System.Collections.Generic;
using System.Linq;

namespace AssetHub.Application.PredictivePlanner;

/// <summary>
/// Pure deterministic validator/grounder for the AI advisory. Every ID, quantity, cost and
/// date proposed by the model is matched against the deterministic snapshot; anything that
/// does not exist is discarded or replaced with the authoritative value.
/// </summary>
public static class PredictivePlannerAdvisoryValidator
{
    private const int MaxEarlyWarnings = 12;
    private const int MaxScheduleRecommendations = 10;

    private static readonly Dictionary<string, string> AllowedSeverities = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Critical"] = "Critical",
        ["High"] = "High",
        ["Medium"] = "Medium"
    };

    private static readonly Dictionary<string, string> AllowedWarningTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Stockout"] = "Stockout",
        ["WorkshopOverload"] = "WorkshopOverload",
        ["HealthRisk"] = "HealthRisk",
        ["BudgetSpike"] = "BudgetSpike"
    };

    public static PredictivePlannerAdvisory ValidateAndGround(
        PredictivePlannerAdvisoryDraft? draft,
        PredictiveForecastSnapshot snapshot)
    {
        if (draft is null || string.IsNullOrWhiteSpace(draft.ExecutiveSummary))
            throw new InvalidOperationException("The AI advisory agent returned an empty or incomplete response.");

        var warnings = new List<string>();

        var knownAssetIds = snapshot.ProjectedServices.Select(s => s.AssetId)
            .Concat(snapshot.StockoutForecasts.SelectMany(s => s.AffectedAssetIds))
            .ToHashSet();

        var knownCatalogItems = snapshot.StockoutForecasts
            .GroupBy(s => s.CatalogItemId)
            .ToDictionary(g => g.Key, g => g.First());

        var knownCatalogCodes = snapshot.StockoutForecasts
            .Where(s => !string.IsNullOrWhiteSpace(s.Code))
            .GroupBy(s => s.Code, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var earlyWarnings = ResolveEarlyWarnings(
            draft.EarlyWarnings,
            snapshot,
            knownAssetIds,
            knownCatalogItems.Keys.ToHashSet(),
            warnings);

        var purchaseSuggestions = ResolvePurchaseSuggestions(
            draft.PurchaseSuggestions,
            knownCatalogItems,
            knownCatalogCodes,
            knownAssetIds,
            warnings);

        var scheduleRecommendations = ResolveScheduleRecommendations(
            draft.ScheduleRecommendations,
            snapshot,
            knownAssetIds,
            warnings);

        return new PredictivePlannerAdvisory(
            ExecutiveSummary: draft.ExecutiveSummary.Trim(),
            EarlyWarnings: earlyWarnings,
            PurchaseSuggestions: purchaseSuggestions,
            ScheduleRecommendations: scheduleRecommendations,
            ValidationWarnings: warnings);
    }

    private static IReadOnlyList<PredictiveEarlyWarning> ResolveEarlyWarnings(
        IEnumerable<EarlyWarningDraft>? drafts,
        PredictiveForecastSnapshot snapshot,
        HashSet<Guid> knownAssetIds,
        HashSet<Guid> knownCatalogItemIds,
        List<string> warnings)
    {
        if (drafts is null)
            return Array.Empty<PredictiveEarlyWarning>();

        var results = new List<PredictiveEarlyWarning>();

        foreach (var raw in drafts)
        {
            if (raw is null || string.IsNullOrWhiteSpace(raw.Message))
                continue;

            var severity = AllowedSeverities.TryGetValue((raw.Severity ?? string.Empty).Trim(), out var canonicalSeverity)
                ? canonicalSeverity
                : "Medium";

            var type = AllowedWarningTypes.TryGetValue((raw.Type ?? string.Empty).Trim(), out var canonicalType)
                ? canonicalType
                : "Stockout";

            var (assetIds, invalidAssets) = ResolveKnownIds(raw.AffectedAssetIds, knownAssetIds);
            if (invalidAssets && assetIds.Count == 0)
            {
                warnings.Add($"Early warning '{Truncate(raw.Message)}' referenced only unknown assets and was discarded.");
                continue;
            }

            var (catalogItemIds, invalidCatalogItems) = ResolveKnownIds(raw.AffectedCatalogItemIds, knownCatalogItemIds);
            if (invalidCatalogItems && catalogItemIds.Count == 0 && assetIds.Count == 0)
            {
                warnings.Add($"Early warning '{Truncate(raw.Message)}' referenced only unknown catalog items and was discarded.");
                continue;
            }

            if (invalidCatalogItems && catalogItemIds.Count == 0)
            {
                warnings.Add($"Early warning '{Truncate(raw.Message)}' referenced unknown catalog items; those references were cleared.");
            }
            else if (invalidCatalogItems)
            {
                warnings.Add($"Early warning '{Truncate(raw.Message)}' referenced some unknown catalog items; invalid references were cleared.");
            }

            results.Add(new PredictiveEarlyWarning(
                Severity: severity,
                Type: type,
                Message: raw.Message.Trim(),
                DaysAhead: Math.Clamp(raw.DaysAhead, 0, snapshot.HorizonDays),
                AffectedAssetIds: assetIds,
                AffectedCatalogItemIds: catalogItemIds));
        }

        return results.Take(MaxEarlyWarnings).ToList();
    }

    private static IReadOnlyList<PredictivePurchaseSuggestion> ResolvePurchaseSuggestions(
        IEnumerable<PurchaseSuggestionDraft>? drafts,
        IReadOnlyDictionary<Guid, StockoutForecast> knownCatalogItems,
        IReadOnlyDictionary<string, StockoutForecast> knownCatalogCodes,
        HashSet<Guid> knownAssetIds,
        List<string> warnings)
    {
        if (drafts is null)
            return Array.Empty<PredictivePurchaseSuggestion>();

        var results = new List<PredictivePurchaseSuggestion>();
        var seen = new HashSet<Guid>();

        foreach (var raw in drafts)
        {
            if (raw is null)
                continue;

            StockoutForecast? matched = null;

            if (!string.IsNullOrWhiteSpace(raw.CatalogItemId)
                && Guid.TryParse(raw.CatalogItemId.Trim(), out var parsedId)
                && knownCatalogItems.TryGetValue(parsedId, out var byId))
            {
                matched = byId;
            }

            if (matched is null && !string.IsNullOrWhiteSpace(raw.Code)
                && knownCatalogCodes.TryGetValue(raw.Code.Trim(), out var byCode))
            {
                matched = byCode;
            }

            if (matched is null)
            {
                warnings.Add($"Purchase suggestion '{raw.Code ?? raw.CatalogItemId ?? "unknown"}' was discarded because it is not in the deterministic forecast.");
                continue;
            }

            if (!seen.Add(matched.CatalogItemId))
                continue;

            var allowedAssetsForItem = matched.AffectedAssetIds.Count > 0
                ? matched.AffectedAssetIds.ToHashSet()
                : knownAssetIds;
            var (assetIds, invalidAssets) = ResolveKnownIds(raw.AffectedAssetIds, allowedAssetsForItem);
            if (invalidAssets)
                warnings.Add($"Purchase suggestion for '{matched.Code}' referenced unknown or unrelated assets; those references were cleared.");

            var quantity = Math.Ceiling(matched.ShortfallQuantity);
            if (quantity <= 0m)
            {
                warnings.Add($"Purchase suggestion for '{matched.Code}' had no shortfall and was discarded.");
                continue;
            }

            var estimatedCost = quantity == matched.ShortfallQuantity || matched.ShortfallQuantity <= 0m
                ? matched.EstimatedRestockCost
                : decimal.Round((matched.EstimatedRestockCost / matched.ShortfallQuantity) * quantity, 2, MidpointRounding.AwayFromZero);

            results.Add(new PredictivePurchaseSuggestion(
                CatalogItemId: matched.CatalogItemId,
                Code: matched.Code,
                QuantityToBuy: quantity,
                EstimatedCost: estimatedCost,
                NeededByDate: matched.StockoutDate,
                AffectedAssetIds: assetIds.Count > 0 ? assetIds : matched.AffectedAssetIds,
                Rationale: raw.Rationale?.Trim() ?? string.Empty));
        }

        return results;
    }

    private static IReadOnlyList<PredictiveScheduleRecommendation> ResolveScheduleRecommendations(
        IEnumerable<ScheduleRecommendationDraft>? drafts,
        PredictiveForecastSnapshot snapshot,
        HashSet<Guid> knownAssetIds,
        List<string> warnings)
    {
        if (drafts is null)
            return Array.Empty<PredictiveScheduleRecommendation>();

        var results = new List<PredictiveScheduleRecommendation>();

        foreach (var raw in drafts)
        {
            if (raw is null || string.IsNullOrWhiteSpace(raw.Recommendation))
                continue;

            var (assetIds, invalidAssets) = ResolveKnownIds(raw.AffectedAssetIds, knownAssetIds);
            if (invalidAssets && assetIds.Count == 0)
            {
                warnings.Add($"Schedule recommendation '{Truncate(raw.Recommendation)}' referenced only unknown assets and was discarded.");
                continue;
            }

            DateTime? suggestedDate = null;
            if (raw.SuggestedDate.HasValue)
            {
                var date = DateTime.SpecifyKind(raw.SuggestedDate.Value.Date, DateTimeKind.Utc);
                if (date >= snapshot.HorizonStart.Date && date <= snapshot.HorizonEnd.Date)
                {
                    suggestedDate = date;
                }
                else
                {
                    warnings.Add($"Schedule recommendation '{Truncate(raw.Recommendation)}' proposed a date outside the forecast horizon; the date was cleared.");
                }
            }

            results.Add(new PredictiveScheduleRecommendation(
                Recommendation: raw.Recommendation.Trim(),
                AffectedAssetIds: assetIds,
                SuggestedDate: suggestedDate,
                Rationale: raw.Rationale?.Trim() ?? string.Empty));
        }

        return results.Take(MaxScheduleRecommendations).ToList();
    }

    private static (IReadOnlyList<Guid> Ids, bool HadInvalid) ResolveKnownIds(
        IEnumerable<string>? rawIds,
        HashSet<Guid> known)
    {
        var parsed = new List<Guid>();
        var hadInvalid = false;

        foreach (var raw in rawIds ?? Enumerable.Empty<string>())
        {
            if (Guid.TryParse(raw?.Trim(), out var id) && known.Contains(id))
                parsed.Add(id);
            else
                hadInvalid = true;
        }

        return (parsed.Distinct().ToList(), hadInvalid);
    }

    private static string Truncate(string value) =>
        value.Length <= 80 ? value : value[..80] + "…";
}
