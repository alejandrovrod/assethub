using System;
using System.Threading.Tasks;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/work-tasks/{taskId}/comments")]
[Authorize]
[RequirePlanLimits("tasks")]
public class TaskCommentsController : ControllerBase
{
    private readonly IMediator _mediator;

    public TaskCommentsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> AddComment(Guid taskId, [FromBody] AddTaskCommentCommand command)
    {
        command.WorkTaskId = taskId;
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(AddComment), new { taskId, id }, new { id });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateComment(Guid taskId, Guid id, [FromBody] UpdateTaskCommentCommand command)
    {
        command.CommentId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteComment(Guid taskId, Guid id)
    {
        var command = new DeleteTaskCommentCommand { CommentId = id };
        await _mediator.Send(command);
        return NoContent();
    }
}
