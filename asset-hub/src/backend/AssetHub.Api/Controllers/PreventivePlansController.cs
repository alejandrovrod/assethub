using System;
using System.Threading.Tasks;
using AssetHub.Application.Incidents.Commands;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/preventive-plans")]
public class PreventivePlansController : ControllerBase
{
    private readonly IMediator _mediator;

    public PreventivePlansController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    [Authorize]
    [RequirePlanLimits("preventive-plans")]
    public async Task<IActionResult> CreatePreventivePlan([FromBody] CreatePreventivePlanCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(CreatePreventivePlan), new { id }, new { id });
    }

    /// <summary>
    /// Evaluates overdue preventive plans. 
    /// En la arquitectura final este endpoint sería invocado por un Cloud Scheduler / Cron Job externo.
    /// Por seguridad en prod, debería estar protegido por un token de servicio o API Key.
    /// </summary>
    [HttpPost("evaluate")]
    public async Task<IActionResult> EvaluatePlans()
    {
        var processed = await _mediator.Send(new EvaluatePreventivePlansCommand());
        return Ok(new { ProcessedCount = processed });
    }
}
