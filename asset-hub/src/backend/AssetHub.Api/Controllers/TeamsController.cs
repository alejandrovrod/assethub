using System;
using System.Threading.Tasks;
using AssetHub.Application.Staff.Commands;
using AssetHub.Infrastructure.Billing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/teams")]
[Authorize]
[RequirePlanLimits("employees")]
public class TeamsController : ControllerBase
{
    private readonly IMediator _mediator;

    public TeamsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> CreateTeam([FromBody] CreateTeamCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(CreateTeam), new { id }, new { id });
    }
}
