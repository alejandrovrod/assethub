using System;
using System.Threading.Tasks;
using AssetHub.Application.Analytics.Commands;
using AssetHub.Application.Analytics.Queries;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/analytics")]
[Authorize]
public class AnalyticsController : ControllerBase
{
    private readonly IMediator _mediator;

    public AnalyticsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet("dashboards/stats")]
    [RequirePlanLimits("reports")]
    public async Task<IActionResult> GetDashboardStats()
    {
        var result = await _mediator.Send(new GetDashboardStatsQuery());
        return Ok(result);
    }

    [HttpPost("reports/export-costs")]
    [RequirePlanLimits("reports")]
    public async Task<IActionResult> ExportCostsReport([FromBody] GenerateCostsReportCommand command)
    {
        var jobId = await _mediator.Send(command);
        return Accepted(new { JobId = jobId, Message = "Report generation started. A link will be sent to the provided email." });
    }
}
