using System.Threading.Tasks;
using AssetHub.Application.Auth.Commands;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;

    public AuthController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var result = await _mediator.Send(new LoginCommand(request.Email, request.Password, request.MfaCode));
        return Ok(result);
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
    {
        var result = await _mediator.Send(new RefreshCommand(request.RefreshToken));
        return Ok(result);
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterViaInvitationCommand request)
    {
        var result = await _mediator.Send(request);
        return Ok(new { success = result });
    }
}

public class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? MfaCode { get; set; }
}

public class RefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}
