using System;
using System.Threading.Tasks;
using AssetHub.Application.Incidents.Commands;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
[RequirePlanLimits("incidents")] // Módulo incidents
public class IncidentsController : ControllerBase
{
    private readonly IMediator _mediator;

    public IncidentsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> ReportIncident([FromBody] ReportIncidentCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(ReportIncident), new { id }, new { id });
    }

    [HttpPatch("{id}/triage")]
    public async Task<IActionResult> TriageIncident(Guid id, [FromBody] TriageIncidentCommand command)
    {
        command.IncidentId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPatch("{id}/state")]
    public async Task<IActionResult> ChangeState(Guid id, [FromBody] ChangeIncidentStateCommand command)
    {
        command.IncidentId = id;
        await _mediator.Send(command);
        return NoContent();
    }
}
