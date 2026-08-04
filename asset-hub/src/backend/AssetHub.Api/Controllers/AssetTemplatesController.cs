using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using AssetHub.Application.AssetTemplates.Commands;
using AssetHub.Application.AssetTemplates.Queries;
using AssetHub.Domain.AssetTemplates;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/asset-templates")]
[Authorize]
public class AssetTemplatesController : ControllerBase
{
    private readonly IMediator _mediator;

    public AssetTemplatesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var result = await _mediator.Send(new GetAssetTemplatesQuery());
        return Ok(new { items = result });
    }

    [HttpPost]
    [Authorize(Roles = "admin,Tenant Admin")]
    public async Task<IActionResult> Create([FromBody] CreateAssetTemplateRequest request)
    {
        var id = await _mediator.Send(new CreateAssetTemplateCommand(
            request.BusinessEntityTypeId,
            request.Code,
            request.Name,
            request.Description,
            request.SchemaJson,
            request.AllowedChildTemplateIds,
            request.LifecycleStates,
            request.MaintenanceChecklist
        ));
        return Created($"/api/v1/asset-templates/{id}", new { id });
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin,Tenant Admin")]
    public async Task<IActionResult> Update([FromRoute] Guid id, [FromBody] UpdateAssetTemplateRequest request)
    {
        var newId = await _mediator.Send(new UpdateAssetTemplateCommand(
            id,
            request.Name,
            request.Description,
            request.SchemaJson,
            request.AllowedChildTemplateIds,
            request.LifecycleStates,
            request.MaintenanceChecklist
        ));

        return Ok(new { id = newId });
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin,Tenant Admin")]
    public async Task<IActionResult> Delete([FromRoute] Guid id)
    {
        var success = await _mediator.Send(new DeleteAssetTemplateCommand(id));
        if (!success) return NotFound();
        return NoContent();
    }
}

public class CreateAssetTemplateRequest
{
    public Guid BusinessEntityTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string SchemaJson { get; set; } = string.Empty;
    public List<Guid> AllowedChildTemplateIds { get; set; } = new();
    public LifecycleConfig LifecycleStates { get; set; } = new();
    public string MaintenanceChecklist { get; set; } = string.Empty;
}

public class UpdateAssetTemplateRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string SchemaJson { get; set; } = string.Empty;
    public List<Guid> AllowedChildTemplateIds { get; set; } = new();
    public LifecycleConfig LifecycleStates { get; set; } = new();
    public string MaintenanceChecklist { get; set; } = string.Empty;
}
