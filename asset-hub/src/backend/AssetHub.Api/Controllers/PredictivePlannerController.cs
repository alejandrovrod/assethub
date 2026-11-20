using AssetHub.Application.PredictivePlanner;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/predictive-planner")]
[Authorize]
[RequirePlanLimits("maintenance")]
public sealed class PredictivePlannerController : ControllerBase
{
    private readonly IMediator _mediator;

    public PredictivePlannerController(IMediator mediator)
    {
        _mediator = mediator;
    }

    public sealed record ForecastRequestBody(
        int HorizonDays = 30,
        Guid? AssetTemplateId = null,
        Guid? WarehouseId = null,
        decimal? MeterIntervalOverride = null,
        string? MeterKeyOverride = null);

    /// <summary>
    /// Computes a deterministic forecast (services, stockouts, workshop load, budget) and
    /// optionally enriches it with a grounded Gemini advisory. Human-in-the-Loop only:
    /// nothing is persisted and no stock is modified.
    /// </summary>
    [HttpPost("forecast")]
    [Authorize(Policy = "permission:maintenance:read")]
    public async Task<IActionResult> Forecast(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ForecastRequestBody? body,
        CancellationToken cancellationToken)
    {
        var query = new GeneratePredictiveForecastQuery
        {
            HorizonDays = body?.HorizonDays ?? 30,
            AssetTemplateId = body?.AssetTemplateId,
            WarehouseId = body?.WarehouseId,
            MeterIntervalOverride = body?.MeterIntervalOverride,
            MeterKeyOverride = body?.MeterKeyOverride
        };

        var result = await _mediator.Send(query, cancellationToken);
        return Ok(result);
    }
}
