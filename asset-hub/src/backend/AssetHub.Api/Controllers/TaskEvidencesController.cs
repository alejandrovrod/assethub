using System;
using System.Threading.Tasks;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Application.Tasks.Queries;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/work-tasks/{taskId}/evidences")]
[Authorize]
[RequirePlanLimits("tasks")]
public class TaskEvidencesController : ControllerBase
{
    private readonly IMediator _mediator;

    public TaskEvidencesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>
    /// Evidencias de la tarea (022 T072). La policy sólo garantiza "puede leer tareas";
    /// que la tarea sea visible para este usuario lo decide el handler, porque depende de
    /// la fila (rol de campo ⇒ sólo tareas propias).
    /// </summary>
    [HttpGet]
    [Authorize(Policy = "permission:tasks:read")]
    public async Task<IActionResult> GetEvidences(Guid taskId)
    {
        var result = await _mediator.Send(new GetTaskEvidencesQuery(taskId));
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> AddEvidence(Guid taskId, [FromBody] AddTaskEvidenceCommand command)
    {
        command.WorkTaskId = taskId;
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(AddEvidence), new { taskId, id }, new { id });
    }

    /// <summary>
    /// Elimina una evidencia de la tarea. Es idempotente a propósito: el outbox del PWA de
    /// campo reintenta el DELETE y, si la evidencia ya no está, el objetivo se cumplió.
    /// </summary>
    [HttpDelete("{evidenceId:guid}")]
    public async Task<IActionResult> DeleteEvidence(Guid taskId, Guid evidenceId)
    {
        await _mediator.Send(new DeleteTaskEvidenceCommand(taskId, evidenceId));
        return NoContent();
    }
}
