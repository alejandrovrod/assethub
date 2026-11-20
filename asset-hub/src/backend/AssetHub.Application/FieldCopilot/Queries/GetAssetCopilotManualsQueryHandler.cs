using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace AssetHub.Application.FieldCopilot.Queries;

public sealed class GetAssetCopilotManualsQueryHandler
    : IRequestHandler<GetAssetCopilotManualsQuery, AssetCopilotManualsResponse>
{
    private readonly ITenantDbContext _db;
    private readonly IAssetManualLoader _manualLoader;
    private readonly IFileSearchStoreClient _storeClient;
    private readonly ILogger<GetAssetCopilotManualsQueryHandler> _logger;

    public GetAssetCopilotManualsQueryHandler(
        ITenantDbContext db,
        IAssetManualLoader manualLoader,
        IFileSearchStoreClient storeClient,
        ILogger<GetAssetCopilotManualsQueryHandler> logger)
    {
        _db = db;
        _manualLoader = manualLoader;
        _storeClient = storeClient;
        _logger = logger;
    }

    public async Task<AssetCopilotManualsResponse> Handle(
        GetAssetCopilotManualsQuery request,
        CancellationToken cancellationToken)
    {
        var (asset, manuals) = await FieldCopilotHelper.LoadAssetAndManualsAsync(
            _db,
            _manualLoader,
            request.AssetId,
            cancellationToken);

        string? storeName = null;
        var hashToDocName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (manuals.Count > 0)
        {
            try
            {
                storeName = await _storeClient.FindTenantStoreAsync(asset.TenantId, cancellationToken);
                if (!string.IsNullOrWhiteSpace(storeName))
                {
                    var remoteDocs = await _storeClient.ListAssetDocumentsAsync(storeName, asset.Id, cancellationToken);
                    var expectedAssetId = asset.Id.ToString("N");
                    foreach (var doc in remoteDocs)
                    {
                        if (string.Equals(doc.State, "STATE_FAILED", StringComparison.OrdinalIgnoreCase))
                            continue;

                        if (!doc.CustomMetadata.TryGetValue("assetid", out var aidVal) ||
                            !string.Equals(aidVal, expectedAssetId, StringComparison.Ordinal))
                        {
                            continue;
                        }

                        if (doc.CustomMetadata.TryGetValue("filehash", out var hash) && !string.IsNullOrWhiteSpace(hash))
                        {
                            hashToDocName[hash] = doc.Name;
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Keep manual discovery working even if Gemini API key is unconfigured or temporarily unreachable.
                _logger.LogWarning(ex, "Could not fetch File Search index status for asset {AssetId}. Returning local manuals only.", asset.Id);
            }
        }

        var statuses = FieldCopilotHelper.MapManualStatuses(manuals, hashToDocName);
        var indexedCount = statuses.Count(s => s.IsIndexed);

        return new AssetCopilotManualsResponse(
            asset.Id,
            asset.Code,
            asset.Name,
            storeName,
            statuses.Count,
            indexedCount,
            statuses);
    }
}
