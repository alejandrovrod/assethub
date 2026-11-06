using System;
using System.Threading.Tasks;
using AssetHub.Api.Filters;
using AssetHub.Api.Http;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Application.Tasks.Dtos;
using AssetHub.Application.Tasks.Queries;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Application.Sync.Queries;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/work-tasks")]
[Authorize]
public class WorkTasksController : ControllerBase
{
    private readonly IMediator _mediator;

    public WorkTasksController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>
    /// Delta sync de tareas (022 §8). Devuelve sólo lo que cambió desde <paramref name="since"/>.
    ///
    /// <paramref name="assignedToMe"/> es lo que usa el PWA de campo: la tablet no tiene por
    /// qué llevar el trabajo de todo el tenant.
    /// </summary>
    [HttpGet("changes")]
    public async Task<ActionResult<ChangePageDto>> GetChanges(
        [FromQuery] string? since,
        [FromQuery] int? limit,
        [FromQuery] bool includeDeleted = true,
        [FromQuery] bool assignedToMe = false)
    {
        var result = await _mediator.Send(new GetWorkTaskChangesQuery
        {
            Since = since,
            Limit = limit,
            IncludeDeleted = includeDeleted,
            AssignedToMe = assignedToMe,
        });

        return Ok(result);
    }

    [HttpGet]
    public async Task<ActionResult<GetWorkTasksResult>> GetTasks(
        [FromQuery] string? state,
        [FromQuery] bool? assignedToMe,
        [FromQuery] Guid? assetId,
        [FromQuery] Guid? incidentId,
        [FromQuery] Guid? maintenanceOrderId,
        [FromQuery] Guid? preventivePlanId,
        [FromQuery] Guid? taskRecurrenceId,
        [FromQuery] string? search,
        [FromQuery] DateTime? dueBefore,
        [FromQuery] DateTime? dueAfter,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var result = await _mediator.Send(new GetWorkTasksQuery
        {
            State = state,
            AssignedToMe = assignedToMe,
            AssetId = assetId,
            IncidentId = incidentId,
            MaintenanceOrderId = maintenanceOrderId,
            PreventivePlanId = preventivePlanId,
            TaskRecurrenceId = taskRecurrenceId,
            Search = search,
            DueBefore = dueBefore,
            DueAfter = dueAfter,
            Page = page,
            PageSize = pageSize
        });

        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<WorkTaskDetailDto>> GetTaskById(Guid id)
    {
        var result = await _mediator.Send(new GetWorkTaskByIdQuery(id));
        if (result == null)
            return NotFound();

        return WithETag(result);
    }

    [HttpPost]
    public async Task<IActionResult> CreateTask([FromBody] CreateWorkTaskCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(GetTaskById), new { id }, new { id });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<WorkTaskDetailDto>> UpdateTask(Guid id, [FromBody] UpdateWorkTaskCommand command)
    {
        command.WorkTaskId = id;
        await _mediator.Send(command);
        var result = await _mediator.Send(new GetWorkTaskByIdQuery(id));
        return Ok(result);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTask(Guid id)
    {
        await _mediator.Send(new DeleteWorkTaskCommand(id));
        return NoContent();
    }

    [HttpPut("{id}/assign")]
    public async Task<IActionResult> AssignTask(Guid id, [FromBody] AssignWorkTaskCommand command)
    {
        command.WorkTaskId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPut("{id}/state")]
    [HttpPost("{id}/state")]
    [RequireIfMatch]
    public async Task<ActionResult<WorkTaskDetailDto>> ChangeState(Guid id, [FromBody] ChangeWorkTaskStateCommand command)
    {
        command.WorkTaskId = id;
        command.ExpectedRowVersion = RequireIfMatchAttribute.GetExpectedVersion(HttpContext);

        await _mediator.Send(command);
        var result = await _mediator.Send(new GetWorkTaskByIdQuery(id));
        return WithETag(result);
    }

    [HttpGet("{id}/history")]
    public async Task<ActionResult> GetTaskHistory(Guid id)
    {
        var result = await _mediator.Send(new GetWorkTaskHistoryQuery(id));
        return Ok(new { items = result });
    }

    /// <summary>
    /// Devuelve el checklist con su snapshot de esquema y su ETag propio.
    /// 404 si la tarea no existe, 204 si existe pero no tiene formulario: para el
    /// cliente offline son dos cosas distintas y las cachea distinto.
    /// </summary>
    [HttpGet("{id}/checklist")]
    public async Task<IActionResult> GetChecklist(Guid id)
    {
        var result = await _mediator.Send(new GetTaskChecklistQuery(id));

        if (!result.TaskExists)
        {
            return NotFound();
        }

        if (result.Checklist is null)
        {
            return NoContent();
        }

        var etag = ETagHelper.ToHeader(result.Checklist.ETag);
        if (!string.IsNullOrEmpty(etag))
        {
            Response.Headers.ETag = etag;
        }

        return Ok(result.Checklist);
    }

    [HttpPut("{id}/checklist")]
    [RequireIfMatch]
    public async Task<ActionResult<TaskChecklistDto>> SubmitChecklist(Guid id, [FromBody] SubmitTaskChecklistCommand command)
    {
        command.TaskId = id;
        command.ExpectedRowVersion = RequireIfMatchAttribute.GetExpectedVersion(HttpContext);

        var result = await _mediator.Send(command);

        var etag = ETagHelper.ToHeader(result.ETag);
        if (!string.IsNullOrEmpty(etag))
        {
            Response.Headers.ETag = etag;
        }

        return Ok(result);
    }

    public record UpdateWorkTaskPropertiesRequest(string PropertiesJson);

    [HttpPut("{id}/properties")]
    [RequireIfMatch]
    public async Task<IActionResult> UpdateProperties(Guid id, [FromBody] UpdateWorkTaskPropertiesRequest request)
    {
        var command = new UpdateWorkTaskPropertiesCommand
        {
            WorkTaskId = id,
            PropertiesJson = request.PropertiesJson,
            ExpectedRowVersion = RequireIfMatchAttribute.GetExpectedVersion(HttpContext)
        };

        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPost("evaluate-due")]
    [Authorize(Roles = "Admin,System")]
    public async Task<ActionResult<EvaluateDueWorkTasksResult>> EvaluateDueTasks()
    {
        var result = await _mediator.Send(new EvaluateDueWorkTasksCommand());
        return Ok(result);
    }

    /// <summary>
    /// El ETag viaja en el header (estándar HTTP) y además en el body, porque el cliente
    /// offline persiste el body en IndexedDB: si sólo estuviera en el header, al
    /// reconectar no tendría la versión que leyó y no podría mandar <c>If-Match</c>.
    /// </summary>
    private ActionResult<WorkTaskDetailDto> WithETag(WorkTaskDetailDto? result)
    {
        if (result is null)
        {
            return NotFound();
        }

        var header = ETagHelper.ToHeader(result.ETag);
        if (!string.IsNullOrEmpty(header))
        {
            Response.Headers.ETag = header;
        }

        return Ok(result);
    }
}
