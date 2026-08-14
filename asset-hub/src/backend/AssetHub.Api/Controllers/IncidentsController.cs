using System;
using System.Threading.Tasks;
using AssetHub.Application.Incidents.Commands;
using AssetHub.Application.Incidents.Queries;
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

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] string? state)
    {
        var result = await _mediator.Send(new SearchIncidentsQuery(q, state));
        return Ok(new { items = result });
    }

    [HttpPost("search")]
    public async Task<IActionResult> AdvancedSearch([FromBody] AssetHub.Api.Controllers.AdvancedSearchRequest request)
    {
        var result = await _mediator.Send(new SearchIncidentsQuery(request.SearchTerm, request.State, request.CatalogFilters));
        return Ok(new { items = result });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _mediator.Send(new GetIncidentByIdQuery(id));
        if (result == null) return NotFound();
        return Ok(result);
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
