using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.FieldCopilot;

namespace AssetHub.Application.Interfaces;

/// <summary>
/// Manages persistent per-tenant Gemini File Search stores and incremental
/// document synchronization keyed by asset ID and SHA-256 file hash.
/// </summary>
public interface IFileSearchStoreClient
{
    Task<string?> FindTenantStoreAsync(Guid tenantId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FileSearchDocumentInfo>> ListAssetDocumentsAsync(
        string storeName,
        Guid assetId,
        CancellationToken cancellationToken = default);

    Task<FileSearchSyncResult> SyncAssetManualsAsync(
        Guid tenantId,
        Guid assetId,
        IReadOnlyList<DiscoveredAssetManual> manuals,
        bool forceReindex = false,
        CancellationToken cancellationToken = default);
}
