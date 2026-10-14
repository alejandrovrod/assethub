using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Import;

public record ValidateAssetImportCommand(
    Stream FileContent,
    string FileName,
    Guid AssetTemplateId,
    Dictionary<string, string>? ColumnMappings) : IRequest<ImportValidationResult>;

public class ValidateAssetImportCommandHandler : IRequestHandler<ValidateAssetImportCommand, ImportValidationResult>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public ValidateAssetImportCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<ImportValidationResult> Handle(ValidateAssetImportCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("Tenant no resuelto.");

        var template = await _db.AssetTemplates
            .FirstOrDefaultAsync(t => t.Id == request.AssetTemplateId
                && (t.TenantId == tenantId || t.TenantId == null)
                && t.IsActive, cancellationToken);
        if (template == null)
            throw new KeyNotFoundException("Plantilla no encontrada o inactiva.");

        var (headers, rows) = await AssetImportFileParser.ParseAsync(request.FileContent, request.FileName, cancellationToken);
        var (validRows, errors) = await AssetImportValidator.ValidateRowsAsync(
            _db, template, tenantId, headers, rows, request.ColumnMappings, cancellationToken);

        var preview = validRows.Take(10).Select(r => new ImportRowPreview(
            r.RowNumber,
            r.Code,
            r.Name,
            r.State,
            r.ParentCode,
            DeserializeProperties(r.PropertiesJson))).ToList();

        return new ImportValidationResult(
            rows.Count,
            validRows.Count,
            rows.Count - validRows.Count,
            errors.Count > 0,
            errors,
            preview);
    }

    internal static Dictionary<string, JsonElement> DeserializeProperties(string propertiesJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(propertiesJson) ? "{}" : propertiesJson);
            return doc.RootElement.EnumerateObject()
                .ToDictionary(p => p.Name, p => p.Value.Clone(), StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
