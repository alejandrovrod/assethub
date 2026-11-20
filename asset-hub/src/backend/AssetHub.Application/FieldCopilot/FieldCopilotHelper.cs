using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.FieldCopilot;

internal static class FieldCopilotHelper
{
    internal static async Task<(Asset Asset, IReadOnlyList<DiscoveredAssetManual> Manuals)> LoadAssetAndManualsAsync(
        ITenantDbContext db,
        IAssetManualLoader manualLoader,
        Guid assetId,
        CancellationToken cancellationToken)
    {
        var asset = await db.Assets
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assetId, cancellationToken);

        if (asset is null)
            throw new KeyNotFoundException($"Asset {assetId} not found.");

        var attachments = await db.AssetAttachments
            .AsNoTracking()
            .Where(a => a.AssetId == asset.Id)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new { a.BlobUri, a.ContentType, a.FileName, a.Kind })
            .ToListAsync(cancellationToken);

        var manuals = await manualLoader.DiscoverManualsAsync(
            attachments.Select(a => (a.BlobUri, (string?)a.ContentType, a.FileName, (string?)a.Kind)),
            asset.PropertiesJson,
            cancellationToken: cancellationToken);

        return (asset, manuals);
    }

    internal static IReadOnlyList<AssetManualStatusDto> MapManualStatuses(
        IReadOnlyList<DiscoveredAssetManual> manuals,
        IReadOnlyDictionary<string, string> hashToDocumentName)
    {
        return manuals
            .Select(m =>
            {
                var isIndexed = hashToDocumentName.TryGetValue(m.FileHash, out var remoteDocName);
                return new AssetManualStatusDto(
                    m.FileName,
                    m.MimeType,
                    m.Source,
                    m.DownloadUrl,
                    m.SizeBytes,
                    m.FileHash,
                    isIndexed,
                    remoteDocName);
            })
            .ToList();
    }

    internal static string ResolvePreferredLanguage(string? explicitLanguage)
    {
        if (!string.IsNullOrWhiteSpace(explicitLanguage))
        {
            var twoLetter = explicitLanguage.Trim().Split('-', '_')[0].ToLowerInvariant();
            if (twoLetter is "en" or "es")
                return twoLetter;
        }

        var cultureLang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.ToLowerInvariant();
        return cultureLang == "en" ? "en" : "es";
    }
}
