using System;
using System.Threading.Tasks;
using AssetHub.Application.Maintenance.Commands;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/maintenance-orders")]
[Authorize]
[RequirePlanLimits("maintenance")]
public class MaintenanceOrdersController : ControllerBase
{
    private readonly IMediator _mediator;

    public MaintenanceOrdersController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> CreateOrder([FromBody] CreateMaintenanceOrderCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(CreateOrder), new { id }, new { id });
    }

    [HttpPatch("{id}/approve")]
    public async Task<IActionResult> ApproveOrder(Guid id)
    {
        var command = new ApproveMaintenanceOrderCommand { MaintenanceOrderId = id };
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPatch("{id}/schedule")]
    public async Task<IActionResult> ScheduleOrder(Guid id, [FromBody] ScheduleMaintenanceOrderCommand command)
    {
        command.MaintenanceOrderId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPut("{id}/costs")]
    public async Task<IActionResult> RecordCosts(Guid id, [FromBody] RecordMaintenanceCostsCommand command)
    {
        command.MaintenanceOrderId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPatch("{id}/verify")]
    public async Task<IActionResult> VerifyOrder(Guid id)
    {
        var command = new VerifyMaintenanceOrderCommand { MaintenanceOrderId = id };
        await _mediator.Send(command);
        return NoContent();
    }
}
