using System;
using System.Threading.Tasks;
using AssetHub.Application.Staff.Commands;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/employees")]
[Authorize]
[RequirePlanLimits("employees")]
public class EmployeesController : ControllerBase
{
    private readonly IMediator _mediator;

    public EmployeesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(CreateEmployee), new { id }, new { id });
    }

    [HttpPatch("{id}/link-user")]
    public async Task<IActionResult> LinkUser(Guid id, [FromBody] LinkUserToEmployeeCommand command)
    {
        command.EmployeeId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpPut("{id}/availability")]
    public async Task<IActionResult> SetAvailability(Guid id, [FromBody] SetEmployeeAvailabilityCommand command)
    {
        command.EmployeeId = id;
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeactivateEmployee(Guid id)
    {
        var command = new DeactivateEmployeeCommand { EmployeeId = id };
        await _mediator.Send(command);
        return NoContent();
    }
}
