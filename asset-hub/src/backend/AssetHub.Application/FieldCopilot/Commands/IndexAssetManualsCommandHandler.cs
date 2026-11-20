using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;

namespace AssetHub.Application.FieldCopilot.Commands;

public sealed class IndexAssetManualsCommandHandler
    : IRequestHandler<IndexAssetManualsCommand, IndexAssetManualsResponse>
{
    private readonly ITenantDbContext _db;
    private readonly IAssetManualLoader _manualLoader;
    private readonly IFileSearchStoreClient _storeClient;

    public IndexAssetManualsCommandHandler(
        ITenantDbContext db,
        IAssetManualLoader manualLoader,
        IFileSearchStoreClient storeClient)
    {
        _db = db;
        _manualLoader = manualLoader;
        _storeClient = storeClient;
    }

    public async Task<IndexAssetManualsResponse> Handle(
        IndexAssetManualsCommand request,
        CancellationToken cancellationToken)
    {
        var (asset, manuals) = await FieldCopilotHelper.LoadAssetAndManualsAsync(
            _db,
            _manualLoader,
            request.AssetId,
            cancellationToken);

        if (manuals.Count == 0)
        {
            return new IndexAssetManualsResponse(
                asset.Id,
                FileSearchStoreName: null,
                TotalManualsCount: 0,
                IndexedManualsCount: 0,
                NewlyIndexedCount: 0,
                SkippedAlreadyIndexedCount: 0,
                RemovedOrphanedCount: 0,
                Warnings: Array.Empty<string>(),
                Manuals: Array.Empty<AssetManualStatusDto>());
        }

        var syncResult = await _storeClient.SyncAssetManualsAsync(
            asset.TenantId,
            asset.Id,
            manuals,
            request.ForceReindex,
            cancellationToken);

        var statuses = FieldCopilotHelper.MapManualStatuses(manuals, syncResult.HashToDocumentName);

        return new IndexAssetManualsResponse(
            asset.Id,
            syncResult.StoreName,
            statuses.Count,
            statuses.Count(s => s.IsIndexed),
            syncResult.NewlyIndexedCount,
            syncResult.SkippedCount,
            syncResult.RemovedOrphanedCount,
            syncResult.Warnings,
            statuses);
    }
}
