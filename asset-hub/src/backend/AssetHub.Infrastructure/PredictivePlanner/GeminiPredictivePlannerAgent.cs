using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.PredictivePlanner;
using AssetHub.Infrastructure.AssetArchitect;
using Google.GenAI;
using Google.GenAI.Types;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AssetHub.Infrastructure.PredictivePlanner;

/// <summary>
/// Gemini adapter for the Predictive Maintenance &amp; Spares Planner. The model only
/// receives the deterministic snapshot and produces narrative JSON; it never computes
/// dates, burn rates, demand, deficits or budget amounts.
/// </summary>
public sealed class GeminiPredictivePlannerAgent : IPredictivePlannerAgent
{
    private const float Temperature = 0.2f;
    private const int MaxPromptServices = 80;
    private const int MaxPromptStockouts = 60;
    private const int MaxPromptMeterProjections = 60;

    private static readonly string[] CandidateModels =
    {
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash"
    };

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly GeminiOptions _options;
    private readonly ILogger<GeminiPredictivePlannerAgent> _logger;
    private readonly Client? _client;

    public GeminiPredictivePlannerAgent(
        IOptions<GeminiOptions> options,
        ILogger<GeminiPredictivePlannerAgent> logger)
    {
        _options = options.Value;
        _logger = logger;

        var apiKey = _options.ApiKey ?? System.Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning(
                "Gemini API key is not configured. The predictive planner will degrade to the deterministic forecast.");
            _client = null;
        }
        else
        {
            _client = new Client(apiKey: apiKey);
        }
    }

    public async Task<PredictivePlannerAdvisoryDraft> AnalyzeAsync(
        PredictiveForecastSnapshot snapshot,
        string preferredLanguage,
        CancellationToken cancellationToken = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Gemini API key is not configured.");

        var config = new GenerateContentConfig
        {
            Temperature = Temperature,
            ResponseMimeType = "application/json",
            SystemInstruction = new Content
            {
                Parts = new List<Part> { new() { Text = BuildSystemPrompt(preferredLanguage) } }
            }
        };

        var userContent = new Content
        {
            Role = "user",
            Parts = new List<Part> { new() { Text = BuildUserPrompt(snapshot) } }
        };

        var candidateModels = CandidateModels
            .Prepend(string.IsNullOrWhiteSpace(_options.Model) ? string.Empty : _options.Model)
            .Where(m => !string.IsNullOrWhiteSpace(m))
            .Distinct(StringComparer.OrdinalIgnoreCase);

        string? rawJson = null;
        Exception? lastException = null;

        foreach (var modelName in candidateModels)
        {
            try
            {
                _logger.LogInformation(
                    "Attempting Gemini model {Model} for Predictive Planner (Horizon: {HorizonDays} days)",
                    modelName,
                    snapshot.HorizonDays);

                var response = await _client.Models.GenerateContentAsync(
                    model: modelName,
                    contents: userContent,
                    config: config,
                    cancellationToken: cancellationToken);

                rawJson = ExtractCandidateText(response);

                if (!string.IsNullOrWhiteSpace(rawJson))
                    break;
            }
            catch (Exception ex) when (IsRetryableModelError(ex))
            {
                _logger.LogWarning(ex, "Model {Model} unavailable for Predictive Planner. Trying next candidate...", modelName);
                lastException = ex;
            }
        }

        if (string.IsNullOrWhiteSpace(rawJson))
        {
            throw new InvalidOperationException(
                "Gemini returned an empty response or all candidate models were unavailable.",
                lastException);
        }

        try
        {
            var draft = JsonSerializer.Deserialize<PredictivePlannerAdvisoryDraft>(
                StripMarkdownFences(rawJson),
                SerializerOptions);

            if (draft is null)
                throw new InvalidOperationException("Failed to deserialize Gemini output into PredictivePlannerAdvisoryDraft.");

            return draft;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse structured JSON from Gemini Predictive Planner. Raw text: {RawJson}", rawJson);
            throw new InvalidOperationException("The AI predictive planner generated an invalid JSON structure.", ex);
        }
    }

    private static bool IsRetryableModelError(Exception ex)
    {
        var msg = ex.Message;
        return msg.Contains("high demand", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("503", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("429", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("no longer available", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("not found", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("404", StringComparison.OrdinalIgnoreCase);
    }

    private static string ExtractCandidateText(GenerateContentResponse? response)
    {
        var parts = response?.Candidates?.FirstOrDefault()?.Content?.Parts;
        if (parts is null || parts.Count == 0)
            return string.Empty;

        return string.Join(
            System.Environment.NewLine,
            parts
                .Where(p => p.Thought != true && !string.IsNullOrWhiteSpace(p.Text))
                .Select(p => p.Text!.Trim()));
    }

    private static string StripMarkdownFences(string text)
    {
        var trimmed = text.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
            return trimmed;

        var firstNewline = trimmed.IndexOf('\n');
        if (firstNewline >= 0)
            trimmed = trimmed.Substring(firstNewline + 1);

        if (trimmed.EndsWith("```", StringComparison.Ordinal))
            trimmed = trimmed.Substring(0, trimmed.Length - 3);

        return trimmed.Trim();
    }

    private static string BuildSystemPrompt(string preferredLanguage)
    {
        var outputLang = string.Equals(preferredLanguage, "en", StringComparison.OrdinalIgnoreCase)
            ? "English"
            : "neutral professional Spanish";

        return $$"""
You are AssetHub's Senior Predictive Maintenance & Spares Planning Analyst.
You receive a DETERMINISTIC forecast that has already been computed in C#: projected services,
stockout crossings, weekly workshop saturation and budget breakdown. Your job is to explain,
prioritize and recommend actions. You NEVER calculate dates, burn rates, quantities, deficits,
saturation percentages or money.

### OUTPUT LANGUAGE
Write every narrative field in {{outputLang}}.

### STRICT JSON OUTPUT CONTRACT
Return ONLY valid JSON matching this schema:
{
  "executiveSummary": "Clear executive diagnosis of the horizon (3-6 sentences)",
  "earlyWarnings": [
    {
      "severity": "Critical | High | Medium",
      "type": "Stockout | WorkshopOverload | HealthRisk | BudgetSpike",
      "message": "Direct actionable warning, e.g. 'In 18 days 4 trucks hit 5,000 hrs and only 2 transmission filters remain (deficit: 2); raise a purchase requisition now.'",
      "daysAhead": 18,
      "affectedAssetIds": ["exact asset GUID from the snapshot"],
      "affectedCatalogItemIds": ["exact catalog item GUID from the snapshot"]
    }
  ],
  "purchaseSuggestions": [
    {
      "catalogItemId": "exact catalogItemId copied verbatim from stockoutForecasts",
      "code": "exact code copied verbatim from stockoutForecasts",
      "quantityToBuy": 2,
      "estimatedCost": 1500.00,
      "neededByDate": "exact stockoutDate ISO-8601 copied from stockoutForecasts",
      "affectedAssetIds": ["exact asset GUID from the snapshot"],
      "rationale": "Why this purchase is needed now"
    }
  ],
  "scheduleRecommendations": [
    {
      "recommendation": "Concrete scheduling action to level workshop load",
      "affectedAssetIds": ["exact asset GUID from the snapshot"],
      "suggestedDate": "ISO-8601 date inside the forecast horizon or null",
      "rationale": "Why this rebalancing helps"
    }
  ]
}

### STRICT ANTI-HALLUCINATION RULES
1. Use only IDs that appear verbatim in the snapshot (`projectedServices[].assetId`, `stockoutForecasts[].catalogItemId`, `stockoutForecasts[].affectedAssetIds`). NEVER invent IDs.
2. `purchaseSuggestions` MUST be a subset of `stockoutForecasts`. Copy `catalogItemId`, `code`, `shortfallQuantity` (as `quantityToBuy`), `estimatedRestockCost` (as `estimatedCost`) and `stockoutDate` (as `neededByDate`) verbatim. Do not recompute them.
3. `earlyWarnings[].daysAhead` MUST come from `daysUntilStockout`, `daysUntilDue` or a workshop week offset already present in the snapshot.
4. `scheduleRecommendations[].suggestedDate` MUST fall inside `horizonStart..horizonEnd`. Use null if no concrete date is justified.
5. Prioritize Critical > High > Medium. A stockout that happens before the projected service is Critical.
6. If the snapshot has no risks, return empty arrays and say so in the executive summary.
7. Never suggest creating orders, consuming stock or changing inventory automatically. This is a Human-in-the-Loop advisory only.
""";
    }

    private static string BuildUserPrompt(PredictiveForecastSnapshot snapshot)
    {
        var sb = new StringBuilder();
        sb.AppendLine("### DETERMINISTIC FORECAST SNAPSHOT (authoritative numbers, do not recompute)");
        sb.AppendLine($"generatedAt: {snapshot.GeneratedAt:O}");
        sb.AppendLine($"horizonDays: {snapshot.HorizonDays}");
        sb.AppendLine($"horizonStart: {snapshot.HorizonStart:yyyy-MM-dd}");
        sb.AppendLine($"horizonEnd: {snapshot.HorizonEnd:yyyy-MM-dd}");
        sb.AppendLine($"currency: {snapshot.Currency}");
        sb.AppendLine();

        sb.AppendLine("### PROJECTED SERVICES (sorted chronologically)");
        if (snapshot.ProjectedServices.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var s in snapshot.ProjectedServices.Take(MaxPromptServices))
            {
                sb.AppendLine(
                    $"- serviceKey: {s.ServiceKey} | assetId: {s.AssetId} | assetCode: {s.AssetCode} | assetName: {s.AssetName} | source: {s.Source} | label: {s.Label} | dueDate: {s.DueDate:yyyy-MM-dd} | daysUntilDue: {s.DaysUntilDue}"
                    + (s.MeterKey is not null ? $" | meterKey: {s.MeterKey} | current: {s.CurrentMeterValue} | target: {s.TargetMeterValue} | burnRatePerDay: {s.BurnRatePerDay} | confidence: {s.BurnRateConfidence}" : string.Empty)
                    + (s.RiskLevel is not null ? $" | riskLevel: {s.RiskLevel}" : string.Empty));
            }
            if (snapshot.ProjectedServices.Count > MaxPromptServices)
            {
                sb.AppendLine($"... ({snapshot.ProjectedServices.Count - MaxPromptServices} additional projected services omitted)");
            }
        }
        sb.AppendLine();

        sb.AppendLine("### STOCKOUT FORECASTS");
        if (snapshot.StockoutForecasts.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var s in snapshot.StockoutForecasts.Take(MaxPromptStockouts))
            {
                sb.AppendLine(
                    $"- catalogItemId: {s.CatalogItemId} | code: {s.Code} | label: {s.Label} | requiredQuantity: {s.RequiredQuantity} | availableQuantity: {s.AvailableQuantity} | shortfallQuantity: {s.ShortfallQuantity} | daysUntilStockout: {s.DaysUntilStockout} | stockoutDate: {s.StockoutDate:yyyy-MM-dd} | estimatedRestockCost: {s.EstimatedRestockCost} | currency: {s.Currency} | affectedAssets: [{string.Join(", ", s.AffectedAssetCodes)}] | affectedAssetIds: [{string.Join(", ", s.AffectedAssetIds)}]");
            }
            if (snapshot.StockoutForecasts.Count > MaxPromptStockouts)
            {
                sb.AppendLine($"... ({snapshot.StockoutForecasts.Count - MaxPromptStockouts} additional stockout forecasts omitted)");
            }
        }
        sb.AppendLine();

        sb.AppendLine("### WEEKLY WORKSHOP LOAD");
        if (snapshot.WeeklyWorkshopLoad.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var w in snapshot.WeeklyWorkshopLoad)
            {
                sb.AppendLine(
                    $"- ISO {w.IsoYear}-W{w.IsoWeek:00} ({w.WeekStart:yyyy-MM-dd}..{w.WeekEnd:yyyy-MM-dd}) | projectedServices: {w.ProjectedServices} | backlogTasks: {w.BacklogTasks} | projectedHours: {w.ProjectedHours} | availableHours: {w.AvailableHours} | saturationPercent: {w.SaturationPercent} | overloaded: {w.IsOverloaded}");
            }
        }
        sb.AppendLine();

        var b = snapshot.BudgetProjection;
        sb.AppendLine("### BUDGET PROJECTION");
        sb.AppendLine($"currency: {b.Currency}");
        sb.AppendLine($"coveredPartsCost: {b.CoveredPartsCost}");
        sb.AppendLine($"urgentPurchaseCost: {b.UrgentPurchaseCost}");
        sb.AppendLine($"estimatedLaborCost: {b.EstimatedLaborCost}");
        sb.AppendLine($"historicalRunRateCost: {b.HistoricalRunRateCost}");
        sb.AppendLine($"estimatedTotalCost: {b.EstimatedTotalCost}");
        sb.AppendLine($"projectedServiceCount: {b.ProjectedServiceCount}");
        sb.AppendLine($"averageCostPerService: {b.AverageCostPerService}");
        sb.AppendLine($"historicalDailyCost: {b.HistoricalDailyCost}");
        sb.AppendLine();

        sb.AppendLine("### METER PROJECTIONS (diagnostics)");
        if (snapshot.MeterProjections.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var m in snapshot.MeterProjections.Take(MaxPromptMeterProjections))
            {
                sb.AppendLine(
                    $"- assetId: {m.AssetId} | assetCode: {m.AssetCode} | meterKey: {m.MeterKey} | current: {m.CurrentValue} | target: {m.TargetValue} | interval: {m.Interval} | burnRatePerDay: {m.BurnRatePerDay} | confidence: {m.Confidence} | projectedServiceDate: {m.ProjectedServiceDate:yyyy-MM-dd}");
            }
            if (snapshot.MeterProjections.Count > MaxPromptMeterProjections)
            {
                sb.AppendLine($"... ({snapshot.MeterProjections.Count - MaxPromptMeterProjections} additional meter projections omitted)");
            }
        }

        return sb.ToString();
    }
}
