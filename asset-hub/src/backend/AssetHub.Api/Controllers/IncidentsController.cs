using System;
using System.Threading.Tasks;
using AssetHub.Api.Filters;
using AssetHub.Api.Http;
using AssetHub.Application.Incidents.Commands;
using AssetHub.Application.Incidents.Queries;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Application.Sync.Queries;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class IncidentsController : ControllerBase
{
    private readonly IMediator _mediator;

    public IncidentsController(IMediator mediator, AssetHub.Application.Interfaces.ITenantDbContext db)
    {
        _mediator = mediator;
        _db = db;
    }

    private readonly AssetHub.Application.Interfaces.ITenantDbContext _db;

    /// <summary>Delta sync de incidencias (022 §8).</summary>
    [HttpGet("changes")]
    public async Task<ActionResult<ChangePageDto>> GetChanges(
        [FromQuery] string? since,
        [FromQuery] int? limit,
        [FromQuery] bool includeDeleted = true,
        [FromQuery] bool assignedToMe = false)
    {
        var result = await _mediator.Send(new GetIncidentChangesQuery
        {
            Since = since,
            Limit = limit,
            IncludeDeleted = includeDeleted,
            AssignedToMe = assignedToMe,
        });

        return Ok(result);
    }

    [HttpGet("fix")]
    [AllowAnonymous]
    public async Task<IActionResult> Fix()
    {
        var incidents = _db.Incidents.Where(i => i.State == "Resuelta" || i.State == "Cancelada" || i.State == "Cancelado" || i.State == "Cerrada" || i.State == "Closed" || i.State == "Resolved").ToList();
        foreach (var i in incidents)
        {
            i.ClosedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(default);
        return Ok(new { fixedCount = incidents.Count });
    }

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] string? state, [FromQuery] Guid? assetId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] bool assignedToMe = false)
    {
        var result = await _mediator.Send(new SearchIncidentsQuery(q, state, null, assetId, page, pageSize, assignedToMe));
        return Ok(result);
    }

    [HttpPost("search")]
    public async Task<IActionResult> AdvancedSearch([FromBody] AssetHub.Api.Controllers.AdvancedSearchRequest request)
    {
        request ??= new AssetHub.Api.Controllers.AdvancedSearchRequest();
        try {
            var result = await _mediator.Send(new SearchIncidentsQuery(request.SearchTerm, request.State, request.CatalogFilters, request.AssetId, request.Page, request.PageSize, request.AssignedToMe));
            return Ok(result);
        } catch (Exception ex) {
            return StatusCode(500, new { error = ex.ToString() });
        }
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _mediator.Send(new GetIncidentByIdQuery(id));
        if (result == null) return NotFound();

        var etag = ETagHelper.ToHeader(result.ETag);
        if (!string.IsNullOrEmpty(etag))
        {
            Response.Headers.ETag = etag;
        }

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
    [RequireIfMatch]
    public async Task<IActionResult> ChangeState(Guid id, [FromBody] ChangeIncidentStateCommand command)
    {
        command.IncidentId = id;
        command.ExpectedRowVersion = RequireIfMatchAttribute.GetExpectedVersion(HttpContext);
        await _mediator.Send(command);

        // Se devuelve la nueva versión: el cliente que sigue editando no necesita releer.
        var updated = await _mediator.Send(new GetIncidentByIdQuery(id));
        var etag = ETagHelper.ToHeader(updated?.ETag);
        if (!string.IsNullOrEmpty(etag))
        {
            Response.Headers.ETag = etag;
        }

        return NoContent();
    }

    [HttpGet("{id}/timeline")]
    public async Task<IActionResult> GetTimeline(Guid id)
    {
        var result = await _mediator.Send(new GetIncidentTimelineQuery(id));
        return Ok(new { items = result });
    }
}
