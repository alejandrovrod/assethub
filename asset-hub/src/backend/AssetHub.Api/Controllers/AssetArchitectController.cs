using AssetHub.Application.AssetArchitect.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/asset-architect")]
[Authorize]
public sealed class AssetArchitectController : ControllerBase
{
    private readonly IMediator _mediator;

    public AssetArchitectController(IMediator mediator)
    {
        _mediator = mediator;
    }

    public sealed record GenerateDraftRequestBody(string Description);

    /// <summary>
    /// Generates a proposed asset template architecture draft using Gemini AI.
    /// Pure draft proposal — does not persist to the database.
    /// </summary>
    [HttpPost("draft")]
    [Authorize(Policy = "permission:asset-templates:create")]
    public async Task<IActionResult> GenerateDraft([FromBody] GenerateDraftRequestBody body, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(body?.Description))
        {
            return BadRequest(new { message = "La descripción de los requerimientos es obligatoria." });
        }

        var result = await _mediator.Send(new GenerateAssetTemplateDraftQuery(body.Description), cancellationToken);
        return Ok(result);
    }
}
