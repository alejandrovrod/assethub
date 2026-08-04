using System;
using System.Threading.Tasks;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/work-tasks")]
[Authorize]
[RequirePlanLimits("tasks")]
public class WorkTasksController : ControllerBase
{
    private readonly IMediator _mediator;

    public WorkTasksController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> CreateTask([FromBody] CreateWorkTaskCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(CreateTask), new { id }, new { id });
    }

    [HttpPut("{id}/assign")]
    public async Task<IActionResult> AssignTask(Guid id, [FromBody] AssignWorkTaskCommand command)
    {
        command.WorkTaskId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPut("{id}/state")]
    public async Task<IActionResult> ChangeState(Guid id, [FromBody] ChangeWorkTaskStateCommand command)
    {
        command.WorkTaskId = id;
        await _mediator.Send(command);
        return NoContent();
    }
}
