using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Resources;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;

namespace AssetHub.Application.PredictivePlanner;

/// <summary>
/// Human-in-the-Loop forecast request. The engine computes the numeric snapshot first and
/// the AI layer only receives that validated snapshot.
/// </summary>
public sealed record GeneratePredictiveForecastQuery : IRequest<PredictivePlannerForecastResponse>
{
    public int HorizonDays { get; init; } = 30;
    public Guid? AssetTemplateId { get; init; }
    public Guid? WarehouseId { get; init; }
    public decimal? MeterIntervalOverride { get; init; }
    public string? MeterKeyOverride { get; init; }
}

public sealed class GeneratePredictiveForecastQueryValidator : AbstractValidator<GeneratePredictiveForecastQuery>
{
    public GeneratePredictiveForecastQueryValidator(IStringLocalizer<SharedResource> localizer)
    {
        RuleFor(x => x.HorizonDays)
            .GreaterThan(0)
            .WithMessage(localizer["Validation_GreaterThan"])
            .LessThanOrEqualTo(365);

        RuleFor(x => x.MeterIntervalOverride)
            .GreaterThan(0m)
            .When(x => x.MeterIntervalOverride.HasValue)
            .WithMessage(localizer["Validation_GreaterThan"]);

        RuleFor(x => x.MeterKeyOverride)
            .MaximumLength(100)
            .When(x => x.MeterKeyOverride is not null);
    }
}

public sealed class GeneratePredictiveForecastQueryHandler
    : IRequestHandler<GeneratePredictiveForecastQuery, PredictivePlannerForecastResponse>
{
    private readonly IPredictivePlannerEngine _engine;
    private readonly IPredictivePlannerAgent _agent;
    private readonly ILogger<GeneratePredictiveForecastQueryHandler> _logger;

    public GeneratePredictiveForecastQueryHandler(
        IPredictivePlannerEngine engine,
        IPredictivePlannerAgent agent,
        ILogger<GeneratePredictiveForecastQueryHandler> logger)
    {
        _engine = engine;
        _agent = agent;
        _logger = logger;
    }

    public async Task<PredictivePlannerForecastResponse> Handle(
        GeneratePredictiveForecastQuery request,
        CancellationToken cancellationToken)
    {
        var forecastRequest = new PredictiveForecastRequest(
            HorizonDays: request.HorizonDays,
            AssetTemplateId: request.AssetTemplateId,
            WarehouseId: request.WarehouseId,
            MeterIntervalOverride: request.MeterIntervalOverride,
            MeterKeyOverride: request.MeterKeyOverride);

        var snapshot = await _engine.BuildSnapshotAsync(
            forecastRequest,
            DateTime.UtcNow,
            cancellationToken);

        var warnings = new List<string>();
        PredictivePlannerAdvisory? advisory = null;

        try
        {
            var draft = await _agent.AnalyzeAsync(
                snapshot,
                ResolvePreferredLanguage(),
                cancellationToken);

            advisory = PredictivePlannerAdvisoryValidator.ValidateAndGround(draft, snapshot);
            warnings.AddRange(advisory.ValidationWarnings);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Graceful degradation: the deterministic forecast is always returned in full.
            _logger.LogWarning(ex, "Predictive planner AI advisory failed; returning deterministic forecast only.");
            warnings.Add(
                "The AI advisory could not be generated. The deterministic forecast is shown without narrative analysis.");
        }

        return new PredictivePlannerForecastResponse(
            Forecast: snapshot,
            Advisory: advisory,
            AdvisoryGenerated: advisory is not null,
            Warnings: warnings);
    }

    private static string ResolvePreferredLanguage()
    {
        var iso = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        return string.Equals(iso, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "es";
    }
}
