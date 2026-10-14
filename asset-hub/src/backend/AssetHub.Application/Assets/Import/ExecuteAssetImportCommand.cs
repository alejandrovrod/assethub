using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace AssetHub.Application.Assets.Import;

public record ExecuteAssetImportCommand(
    Stream FileContent,
    string FileName,
    Guid AssetTemplateId,
    Dictionary<string, string>? ColumnMappings,
    bool ContinueOnError) : IRequest<ImportExecutionResult>;

public class ExecuteAssetImportCommandHandler : IRequestHandler<ExecuteAssetImportCommand, ImportExecutionResult>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;
    private readonly ICurrentUser _currentUser;
    private readonly IAssetHierarchyService _hierarchyService;

    public ExecuteAssetImportCommandHandler(
        ITenantDbContext db,
        ITenantResolver tenantResolver,
        ICurrentUser currentUser,
        IAssetHierarchyService hierarchyService)
    {
        _db = db;
        _tenantResolver = tenantResolver;
        _currentUser = currentUser;
        _hierarchyService = hierarchyService;
    }

    public async Task<ImportExecutionResult> Handle(ExecuteAssetImportCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("Tenant no resuelto.");
        var userId = _currentUser.Id ?? _tenantResolver.GetCurrentUserId() ?? Guid.Empty;

        var template = await _db.AssetTemplates
            .FirstOrDefaultAsync(t => t.Id == request.AssetTemplateId
                && (t.TenantId == tenantId || t.TenantId == null)
                && t.IsActive, cancellationToken);
        if (template == null)
            throw new KeyNotFoundException("Plantilla no encontrada o inactiva.");

        var (headers, rows) = await AssetImportFileParser.ParseAsync(request.FileContent, request.FileName, cancellationToken);
        var (validRows, errors) = await AssetImportValidator.ValidateRowsAsync(
            _db, template, tenantId, headers, rows, request.ColumnMappings, cancellationToken);

        if (errors.Count > 0 && !request.ContinueOnError)
        {
            var preview = validRows.Take(10).Select(r => new ImportRowPreview(
                r.RowNumber, r.Code, r.Name, r.State, r.ParentCode,
                ValidateAssetImportCommandHandler.DeserializeProperties(r.PropertiesJson))).ToList();
            throw new ImportValidationException(new ImportValidationResult(
                rows.Count, validRows.Count, rows.Count - validRows.Count, true, errors, preview));
        }

        // Mapa de padres existentes en DB (código normalizado -> Id).
        var parentCodes = validRows
            .Where(r => !string.IsNullOrWhiteSpace(r.ParentCode))
            .Select(r => r.ParentCode!.ToUpperInvariant())
            .Distinct()
            .ToList();
        var dbParentIds = parentCodes.Count == 0
            ? new Dictionary<string, Guid>()
            : (await _db.Assets
                    .Where(a => a.TenantId == tenantId && !a.IsDeleted && parentCodes.Contains(a.Code.ToUpper()))
                    .Select(a => new { a.Code, a.Id })
                    .ToListAsync(cancellationToken))
                .GroupBy(a => a.Code.Trim().ToUpperInvariant())
                .ToDictionary(g => g.Key, g => g.First().Id);

        var importedIds = new List<Guid>();
        var failedCount = 0;
        var now = DateTime.UtcNow;

        if (!request.ContinueOnError)
        {
            // Modo atómico: transacción explícita, rollback ante cualquier error de persistencia.
            if (_db is not DbContext efCtx)
                throw new InvalidOperationException("El contexto de tenant no soporta transacciones.");
            await using var tx = await efCtx.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var codeToId = new Dictionary<string, Guid>(dbParentIds, StringComparer.OrdinalIgnoreCase);
                var remaining = validRows.OrderBy(r => r.RowNumber).ToList();
                var passesWithoutProgress = 0;
                while (remaining.Count > 0)
                {
                    var progress = false;
                    var next = new List<ParsedRow>();
                    foreach (var row in remaining)
                    {
                        if (!TryResolveParentId(row, codeToId, out var parentId))
                        {
                            next.Add(row);
                            continue;
                        }
                        var id = await PersistRowAsync(row, template.Id, tenantId, userId, parentId, now, cancellationToken);
                        codeToId[row.Code] = id;
                        progress = true;
                    }
                    remaining = next;
                    if (remaining.Count == 0) break;
                    if (!progress && ++passesWithoutProgress >= 2)
                        throw new InvalidOperationException("No se pudieron resolver los padres intra-archivo de todas las filas.");
                    if (progress) passesWithoutProgress = 0;
                }

                await tx.CommitAsync(cancellationToken);
            }
            catch
            {
                await tx.RollbackAsync(cancellationToken);
                throw;
            }
        }
        else
        {
            // Modo tolerante: importar solo filas válidas, sin transacción global.
            var codeToId = new Dictionary<string, Guid>(dbParentIds, StringComparer.OrdinalIgnoreCase);
            var remaining = validRows.OrderBy(r => r.RowNumber).ToList();
            var passesWithoutProgress = 0;
            while (remaining.Count > 0)
            {
                var progress = false;
                var next = new List<ParsedRow>();
                foreach (var row in remaining)
                {
                    if (!TryResolveParentId(row, codeToId, out var parentId))
                    {
                        next.Add(row);
                        continue;
                    }
                    try
                    {
                        var id = await PersistRowAsync(row, template.Id, tenantId, userId, parentId, now, cancellationToken);
                        codeToId[row.Code] = id;
                        importedIds.Add(id);
                        progress = true;
                    }
                    catch
                    {
                        failedCount++;
                        progress = true; // La fila se consumió como fallida.
                    }
                }
                remaining = next;
                if (remaining.Count == 0) break;
                if (!progress && ++passesWithoutProgress >= 2)
                {
                    failedCount += remaining.Count;
                    remaining.Clear();
                }
                if (progress) passesWithoutProgress = 0;
            }

            return new ImportExecutionResult(
                failedCount == 0,
                rows.Count,
                importedIds.Count,
                failedCount + (rows.Count - validRows.Count),
                importedIds);
        }

        // Modo atómico: recargar ids importados (el commit fue exitoso).
        var importedCodes = validRows.Select(r => r.Code.Trim().ToUpperInvariant()).ToList();
        importedIds = await _db.Assets
            .Where(a => a.TenantId == tenantId && importedCodes.Contains(a.Code.ToUpper()))
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

        return new ImportExecutionResult(true, rows.Count, validRows.Count, 0, importedIds);
    }

    private static bool TryResolveParentId(
        ParsedRow row,
        Dictionary<string, Guid> codeToId,
        out Guid? parentId)
    {
        parentId = null;
        if (string.IsNullOrWhiteSpace(row.ParentCode)) return true;
        if (codeToId.TryGetValue(row.ParentCode.Trim(), out var id) && id != Guid.Empty)
        {
            parentId = id;
            return true;
        }
        return false;
    }

    private async Task<Guid> PersistRowAsync(
        ParsedRow row,
        Guid templateId,
        Guid tenantId,
        Guid userId,
        Guid? parentId,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = templateId,
            ParentId = parentId,
            Code = row.Code,
            Name = row.Name,
            State = row.State,
            InstalledAt = row.InstalledAt,
            CommissionedAt = row.CommissionedAt,
            ConditionIndex = row.ConditionIndex,
            PropertiesJson = string.IsNullOrWhiteSpace(row.PropertiesJson) ? "{}" : row.PropertiesJson,
            CreatedAt = now,
            UpdatedAt = now
        };

        if (row.Lat.HasValue && row.Lon.HasValue)
        {
            asset.Geo = new Point(row.Lon.Value, row.Lat.Value) { SRID = 4326 };
            asset.GeoType = "Point";
        }

        _db.Assets.Add(asset);
        await _db.SaveChangesAsync(cancellationToken);

        await _hierarchyService.InsertAssetHierarchyAsync(asset.Id, asset.ParentId, cancellationToken);

        _db.AssetLifecycleEvents.Add(new AssetLifecycleEvent
        {
            AssetId = asset.Id,
            EventType = "migracion_historica",
            FromState = string.Empty,
            ToState = asset.State,
            Notes = "Importación masiva histórica",
            At = row.CommissionedAt ?? row.InstalledAt ?? DateTime.UtcNow,
            UserId = userId
        });
        await _db.SaveChangesAsync(cancellationToken);

        return asset.Id;
    }
}
