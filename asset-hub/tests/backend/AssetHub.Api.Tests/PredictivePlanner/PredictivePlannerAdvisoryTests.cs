using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.PredictivePlanner;
using AssetHub.Application.Resources;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.PredictivePlanner;

public class PredictivePlannerAdvisoryTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static PredictiveForecastSnapshot BuildSnapshot(Guid assetId, Guid itemId)
    {
        var service = new ProjectedService(
            ServiceKey: "plan:1",
            AssetId: assetId,
            AssetCode: "TRK-01",
            AssetName: "Truck 01",
            AssetTemplateId: null,
            Label: "Weekly inspection",
            Source: ServiceSource.PreventivePlan,
            DueDate: Now.AddDays(5),
            DaysUntilDue: 5,
            PreventivePlanId: null,
            MeterKey: null,
            CurrentMeterValue: null,
            TargetMeterValue: null,
            BurnRatePerDay: null,
            BurnRateConfidence: null,
            RiskLevel: null);

        var stockout = new StockoutForecast(
            CatalogItemId: itemId,
            Code: "FLT-01",
            Label: "Transmission filter",
            RequiredQuantity: 10m,
            AvailableQuantity: 8m,
            ShortfallQuantity: 2m,
            DaysUntilStockout: 5,
            StockoutDate: Now.Date.AddDays(5),
            EstimatedRestockCost: 100m,
            Currency: "MXN",
            AffectedAssetIds: new[] { assetId },
            AffectedAssetCodes: new[] { "TRK-01" });

        var budget = new BudgetProjection(
            Currency: "MXN",
            CoveredPartsCost: 80m,
            UrgentPurchaseCost: 100m,
            EstimatedLaborCost: 50m,
            HistoricalRunRateCost: 120m,
            EstimatedTotalCost: 230m,
            ProjectedServiceCount: 1,
            AverageCostPerService: 50m,
            HistoricalDailyCost: 4m);

        return new PredictiveForecastSnapshot(
            GeneratedAt: Now,
            HorizonDays: 30,
            HorizonStart: Now.Date,
            HorizonEnd: Now.Date.AddDays(30),
            AssetTemplateId: null,
            WarehouseId: null,
            Currency: "MXN",
            ProjectedServices: new[] { service },
            StockoutForecasts: new[] { stockout },
            WeeklyWorkshopLoad: Array.Empty<WeeklyWorkshopLoad>(),
            BudgetProjection: budget,
            MeterProjections: Array.Empty<MeterProjection>());
    }

    [Fact]
    public void Validator_DiscardsInventedIdsAndCorrectsQuantitiesAndCosts()
    {
        var assetId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var snapshot = BuildSnapshot(assetId, itemId);

        var draft = new PredictivePlannerAdvisoryDraft
        {
            ExecutiveSummary = "Two critical risks in the next 30 days.",
            EarlyWarnings = new List<EarlyWarningDraft>
            {
                new()
                {
                    Severity = "Critical",
                    Type = "Stockout",
                    Message = "Transmission filters run out before the service.",
                    DaysAhead = 5,
                    AffectedAssetIds = new List<string> { assetId.ToString() },
                    AffectedCatalogItemIds = new List<string> { itemId.ToString() }
                },
                new()
                {
                    Severity = "High",
                    Type = "Stockout",
                    Message = "Invented asset warning",
                    DaysAhead = 3,
                    AffectedAssetIds = new List<string> { Guid.NewGuid().ToString() }
                }
            },
            PurchaseSuggestions = new List<PurchaseSuggestionDraft>
            {
                new()
                {
                    CatalogItemId = itemId.ToString(),
                    Code = "FLT-01",
                    QuantityToBuy = 999m,
                    EstimatedCost = 999999m,
                    NeededByDate = Now.AddYears(2),
                    AffectedAssetIds = new List<string> { Guid.NewGuid().ToString() },
                    Rationale = "Cover the deficit."
                },
                new()
                {
                    CatalogItemId = Guid.NewGuid().ToString(),
                    Code = "INVENTED-SKU",
                    QuantityToBuy = 50m,
                    EstimatedCost = 10m,
                    AffectedAssetIds = new List<string>(),
                    Rationale = "Hallucinated part."
                }
            },
            ScheduleRecommendations = new List<ScheduleRecommendationDraft>
            {
                new()
                {
                    Recommendation = "Advance the service one week.",
                    AffectedAssetIds = new List<string> { assetId.ToString() },
                    SuggestedDate = Now.AddDays(12),
                    Rationale = "Level the workshop load."
                },
                new()
                {
                    Recommendation = "Invented asset rebalance.",
                    AffectedAssetIds = new List<string> { Guid.NewGuid().ToString() },
                    SuggestedDate = Now.AddDays(3),
                    Rationale = "Invalid."
                },
                new()
                {
                    Recommendation = "Valid assets but date outside horizon.",
                    AffectedAssetIds = new List<string> { assetId.ToString() },
                    SuggestedDate = Now.AddDays(200),
                    Rationale = "Too far out."
                }
            }
        };

        var advisory = PredictivePlannerAdvisoryValidator.ValidateAndGround(draft, snapshot);

        Assert.Single(advisory.EarlyWarnings);
        Assert.Equal("FLT-01", advisory.PurchaseSuggestions[0].Code);
        Assert.Equal(2m, advisory.PurchaseSuggestions[0].QuantityToBuy);
        Assert.Equal(100m, advisory.PurchaseSuggestions[0].EstimatedCost);
        Assert.Equal(snapshot.StockoutForecasts[0].StockoutDate, advisory.PurchaseSuggestions[0].NeededByDate);
        Assert.Single(advisory.PurchaseSuggestions);
        Assert.Contains(assetId, advisory.PurchaseSuggestions[0].AffectedAssetIds);

        Assert.Equal(2, advisory.ScheduleRecommendations.Count);
        Assert.Null(advisory.ScheduleRecommendations[1].SuggestedDate);
        Assert.NotEmpty(advisory.ValidationWarnings);
    }

    [Fact]
    public void Validator_DropsWarningsThatOnlyReferenceUnknownCatalogItems()
    {
        var assetId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var snapshot = BuildSnapshot(assetId, itemId);

        var draft = new PredictivePlannerAdvisoryDraft
        {
            ExecutiveSummary = "Summary.",
            EarlyWarnings = new List<EarlyWarningDraft>
            {
                new()
                {
                    Severity = "Critical",
                    Type = "Stockout",
                    Message = "Unknown part warning.",
                    DaysAhead = 1,
                    AffectedAssetIds = new List<string> { assetId.ToString() },
                    AffectedCatalogItemIds = new List<string> { Guid.NewGuid().ToString() }
                }
            }
        };

        var advisory = PredictivePlannerAdvisoryValidator.ValidateAndGround(draft, snapshot);

        Assert.Single(advisory.EarlyWarnings);
        Assert.Empty(advisory.EarlyWarnings[0].AffectedCatalogItemIds);
        Assert.NotEmpty(advisory.ValidationWarnings);
    }

    [Fact]
    public async Task Handler_WhenGeminiUnavailable_DegradesToDeterministicForecast()
    {
        var assetId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var snapshot = BuildSnapshot(assetId, itemId);

        var engine = new Mock<IPredictivePlannerEngine>();
        engine
            .Setup(e => e.BuildSnapshotAsync(
                It.IsAny<PredictiveForecastRequest>(),
                It.IsAny<DateTime>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(snapshot);

        var agent = new Mock<IPredictivePlannerAgent>();
        agent
            .Setup(a => a.AnalyzeAsync(
                It.IsAny<PredictiveForecastSnapshot>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Gemini API key is not configured."));

        var handler = new GeneratePredictiveForecastQueryHandler(
            engine.Object,
            agent.Object,
            NullLogger<GeneratePredictiveForecastQueryHandler>.Instance);

        var response = await handler.Handle(new GeneratePredictiveForecastQuery { HorizonDays = 30 }, CancellationToken.None);

        Assert.False(response.AdvisoryGenerated);
        Assert.Null(response.Advisory);
        Assert.Same(snapshot, response.Forecast);
        Assert.Single(response.Warnings);
        Assert.NotEmpty(response.Forecast.StockoutForecasts);
    }

    [Fact]
    public async Task Handler_WhenGeminiReturnsInvalidDraft_AlsoDegrades()
    {
        var assetId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var snapshot = BuildSnapshot(assetId, itemId);

        var engine = new Mock<IPredictivePlannerEngine>();
        engine
            .Setup(e => e.BuildSnapshotAsync(
                It.IsAny<PredictiveForecastRequest>(),
                It.IsAny<DateTime>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(snapshot);

        var agent = new Mock<IPredictivePlannerAgent>();
        agent
            .Setup(a => a.AnalyzeAsync(
                It.IsAny<PredictiveForecastSnapshot>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PredictivePlannerAdvisoryDraft { ExecutiveSummary = string.Empty });

        var handler = new GeneratePredictiveForecastQueryHandler(
            engine.Object,
            agent.Object,
            NullLogger<GeneratePredictiveForecastQueryHandler>.Instance);

        var response = await handler.Handle(new GeneratePredictiveForecastQuery { HorizonDays = 30 }, CancellationToken.None);

        Assert.False(response.AdvisoryGenerated);
        Assert.Single(response.Warnings);
    }

    [Fact]
    public void Validator_DropsEarlyWarningWithOnlyUnknownCatalogItemsAndNoAssets()
    {
        var assetId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var snapshot = BuildSnapshot(assetId, itemId);

        var draft = new PredictivePlannerAdvisoryDraft
        {
            ExecutiveSummary = "Summary.",
            EarlyWarnings = new List<EarlyWarningDraft>
            {
                new()
                {
                    Severity = "Critical",
                    Type = "Stockout",
                    Message = "Hallucinated catalog warning.",
                    DaysAhead = 2,
                    AffectedAssetIds = new List<string>(),
                    AffectedCatalogItemIds = new List<string> { Guid.NewGuid().ToString() }
                }
            }
        };

        var advisory = PredictivePlannerAdvisoryValidator.ValidateAndGround(draft, snapshot);

        Assert.Empty(advisory.EarlyWarnings);
        Assert.NotEmpty(advisory.ValidationWarnings);
    }

    [Fact]
    public void Validator_ScopesPurchaseSuggestionAssetsAndScalesCeiledCost()
    {
        var affectedAssetId = Guid.NewGuid();
        var unrelatedAssetId = Guid.NewGuid();
        var itemId = Guid.NewGuid();

        var serviceA = new ProjectedService(
            ServiceKey: "plan:1",
            AssetId: affectedAssetId,
            AssetCode: "TRK-01",
            AssetName: "Truck 01",
            AssetTemplateId: null,
            Label: "Weekly inspection",
            Source: ServiceSource.PreventivePlan,
            DueDate: Now.AddDays(5),
            DaysUntilDue: 5,
            PreventivePlanId: null,
            MeterKey: null,
            CurrentMeterValue: null,
            TargetMeterValue: null,
            BurnRatePerDay: null,
            BurnRateConfidence: null,
            RiskLevel: null);

        var serviceB = serviceA with
        {
            ServiceKey = "plan:2",
            AssetId = unrelatedAssetId,
            AssetCode = "TRK-02",
            AssetName = "Truck 02"
        };

        var stockout = new StockoutForecast(
            CatalogItemId: itemId,
            Code: "FLT-01",
            Label: "Transmission filter",
            RequiredQuantity: 2.5m,
            AvailableQuantity: 1m,
            ShortfallQuantity: 1.5m,
            DaysUntilStockout: 5,
            StockoutDate: Now.Date.AddDays(5),
            EstimatedRestockCost: 150m,
            Currency: "MXN",
            AffectedAssetIds: new[] { affectedAssetId },
            AffectedAssetCodes: new[] { "TRK-01" });

        var snapshot = BuildSnapshot(affectedAssetId, itemId) with
        {
            ProjectedServices = new[] { serviceA, serviceB },
            StockoutForecasts = new[] { stockout }
        };

        var draft = new PredictivePlannerAdvisoryDraft
        {
            ExecutiveSummary = "Stockout risk detected.",
            PurchaseSuggestions = new List<PurchaseSuggestionDraft>
            {
                new()
                {
                    CatalogItemId = itemId.ToString(),
                    Code = "FLT-01",
                    AffectedAssetIds = new List<string> { unrelatedAssetId.ToString() },
                    Rationale = "Buy filters."
                }
            }
        };

        var advisory = PredictivePlannerAdvisoryValidator.ValidateAndGround(draft, snapshot);

        var suggestion = Assert.Single(advisory.PurchaseSuggestions);
        Assert.Equal(2m, suggestion.QuantityToBuy);
        Assert.Equal(200m, suggestion.EstimatedCost);
        Assert.Equal(new[] { affectedAssetId }, suggestion.AffectedAssetIds);
        Assert.NotEmpty(advisory.ValidationWarnings);
    }

    [Fact]
    public async Task Handler_PropagatesOperationCanceledException()
    {
        var assetId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var snapshot = BuildSnapshot(assetId, itemId);

        var engine = new Mock<IPredictivePlannerEngine>();
        engine
            .Setup(e => e.BuildSnapshotAsync(
                It.IsAny<PredictiveForecastRequest>(),
                It.IsAny<DateTime>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(snapshot);

        var agent = new Mock<IPredictivePlannerAgent>();
        agent
            .Setup(a => a.AnalyzeAsync(
                It.IsAny<PredictiveForecastSnapshot>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());

        var handler = new GeneratePredictiveForecastQueryHandler(
            engine.Object,
            agent.Object,
            NullLogger<GeneratePredictiveForecastQueryHandler>.Instance);

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            handler.Handle(new GeneratePredictiveForecastQuery { HorizonDays = 30 }, CancellationToken.None));
    }

    [Fact]
    public void QueryValidator_RejectsNonPositiveMeterIntervalAndHorizon()
    {
        var localizer = new Mock<IStringLocalizer<SharedResource>>();
        localizer
            .Setup(l => l[It.IsAny<string>()])
            .Returns((string key) => new LocalizedString(key, key));

        var validator = new GeneratePredictiveForecastQueryValidator(localizer.Object);

        var invalidResult = validator.Validate(new GeneratePredictiveForecastQuery
        {
            HorizonDays = 0,
            MeterIntervalOverride = 0m
        });

        Assert.False(invalidResult.IsValid);
        Assert.Contains(invalidResult.Errors, e => e.PropertyName == nameof(GeneratePredictiveForecastQuery.HorizonDays));
        Assert.Contains(invalidResult.Errors, e => e.PropertyName == nameof(GeneratePredictiveForecastQuery.MeterIntervalOverride));

        var validResult = validator.Validate(new GeneratePredictiveForecastQuery
        {
            HorizonDays = 30,
            MeterIntervalOverride = 250m
        });

        Assert.True(validResult.IsValid);
    }
}
