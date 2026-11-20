using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.FieldCopilot;

namespace AssetHub.Application.Interfaces;

/// <summary>
/// Discovers and safely reads technical manuals, schematics, and specification documents
/// attached to an asset via <c>AssetAttachments</c> or dynamic <c>PropertiesJson</c> fields.
/// </summary>
public interface IAssetManualLoader
{
    Task<IReadOnlyList<DiscoveredAssetManual>> DiscoverManualsAsync(
        IEnumerable<(string BlobUri, string? ContentType, string FileName, string? Kind)> attachments,
        string? propertiesJson,
        int maxManuals = 20,
        long maxBytesPerManual = 50L * 1024 * 1024,
        CancellationToken cancellationToken = default);
}
