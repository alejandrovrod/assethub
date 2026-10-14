using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Import;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/assets/import")]
[Authorize]
public class AssetImportController : ControllerBase
{
    private readonly IMediator _mediator;

    public AssetImportController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet("template/{assetTemplateId}")]
    public async Task<IActionResult> DownloadTemplate(Guid assetTemplateId, [FromQuery] string format = "xlsx")
    {
        if (!string.Equals(format, "xlsx", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Formato no soportado. Use xlsx o csv.");

        try
        {
            var (content, contentType, fileName) =
                await _mediator.Send(new DownloadImportTemplateQuery(assetTemplateId, format));
            return File(content, contentType, fileName);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost("validate")]
    public async Task<IActionResult> Validate(
        IFormFile file,
        [FromForm] Guid assetTemplateId,
        [FromForm] string? columnMappingsJson = null)
    {
        if (file == null || file.Length == 0) return BadRequest("File is empty.");

        try
        {
            using var stream = new MemoryStream();
            await file.CopyToAsync(stream);
            stream.Position = 0;
            var result = await _mediator.Send(new ValidateAssetImportCommand(
                stream, file.FileName, assetTemplateId, ParseMappings(columnMappingsJson)));
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("execute")]
    public async Task<IActionResult> Execute(
        IFormFile file,
        [FromForm] Guid assetTemplateId,
        [FromForm] string? columnMappingsJson = null,
        [FromForm] bool continueOnError = false)
    {
        if (file == null || file.Length == 0) return BadRequest("File is empty.");

        try
        {
            using var stream = new MemoryStream();
            await file.CopyToAsync(stream);
            stream.Position = 0;
            var result = await _mediator.Send(new ExecuteAssetImportCommand(
                stream, file.FileName, assetTemplateId, ParseMappings(columnMappingsJson), continueOnError));
            return Ok(result);
        }
        catch (ImportValidationException ex)
        {
            return UnprocessableEntity(ex.Result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    private static Dictionary<string, string>? ParseMappings(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException($"El parámetro columnMappingsJson no es un JSON válido: {ex.Message}", ex);
        }
    }
}
