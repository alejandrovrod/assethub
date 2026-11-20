using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.FieldCopilot;
using AssetHub.Application.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace AssetHub.Infrastructure.FieldCopilot;

/// <summary>
/// Safely discovers and streams technical manuals and schematics attached to an asset
/// from both <c>AssetAttachments</c> and dynamic <c>PropertiesJson</c> upload/data URLs.
/// Enforces strict path traversal protection, file type filtering, size limits, and SHA-256 deduplication.
/// </summary>
public sealed class LocalAssetManualLoader : IAssetManualLoader
{
    private static readonly Dictionary<string, string> DocumentExtensionMimeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".txt"] = "text/plain",
        [".md"] = "text/markdown",
        [".csv"] = "text/csv",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".html"] = "text/html",
        [".htm"] = "text/html",
        [".xml"] = "application/xml",
        [".json"] = "application/json"
    };

    private static readonly Dictionary<string, string> SchematicImageExtensionMimeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".webp"] = "image/webp"
    };

    private static readonly HashSet<string> AllowedDocumentMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/html",
        "application/xml",
        "text/xml",
        "application/json"
    };

    private readonly IWebHostEnvironment _env;
    private readonly ILogger<LocalAssetManualLoader> _logger;

    public LocalAssetManualLoader(
        IWebHostEnvironment env,
        ILogger<LocalAssetManualLoader> logger)
    {
        _env = env;
        _logger = logger;
    }

    public async Task<IReadOnlyList<DiscoveredAssetManual>> DiscoverManualsAsync(
        IEnumerable<(string BlobUri, string? ContentType, string FileName, string? Kind)> attachments,
        string? propertiesJson,
        int maxManuals = 20,
        long maxBytesPerManual = 50L * 1024 * 1024,
        CancellationToken cancellationToken = default)
    {
        if (maxManuals <= 0 || maxBytesPerManual <= 0)
            return Array.Empty<DiscoveredAssetManual>();

        var results = new List<DiscoveredAssetManual>();
        var seenSources = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenHashes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
        var uploadsRoot = Path.GetFullPath(Path.Combine(webRoot, "uploads"));
        var uploadsRootWithSep = uploadsRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                                 + Path.DirectorySeparatorChar;

        if (attachments is not null)
        {
            foreach (var (blobUri, contentType, fileName, kind) in attachments)
            {
                if (results.Count >= maxManuals)
                    break;

                if (string.IsNullOrWhiteSpace(blobUri))
                    continue;

                var allowSchematicImages = string.Equals(kind, "plan", StringComparison.OrdinalIgnoreCase) ||
                                           string.Equals(kind, "doc", StringComparison.OrdinalIgnoreCase);

                var loaded = await TryLoadLocalUploadAsync(
                    blobUri.Trim(),
                    contentType,
                    explicitFileName: string.IsNullOrWhiteSpace(fileName) ? null : fileName.Trim(),
                    source: "attachment",
                    allowSchematicImages,
                    uploadsRootWithSep,
                    uploadsRoot,
                    maxBytesPerManual,
                    seenSources,
                    seenHashes,
                    cancellationToken);

                if (loaded is not null)
                    results.Add(loaded);
            }
        }

        if (results.Count < maxManuals && !string.IsNullOrWhiteSpace(propertiesJson))
        {
            var propertySources = ExtractPropertyMediaStrings(propertiesJson);
            var index = 0;
            foreach (var src in propertySources)
            {
                if (results.Count >= maxManuals)
                    break;

                index++;
                DiscoveredAssetManual? loaded = src.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
                    ? TryDecodeDataUrl(src, $"manual_inline_{index}.pdf", maxBytesPerManual, seenSources, seenHashes)
                    : await TryLoadLocalUploadAsync(
                        src,
                        contentType: null,
                        explicitFileName: null,
                        source: "property",
                        allowSchematicImages: false,
                        uploadsRootWithSep,
                        uploadsRoot,
                        maxBytesPerManual,
                        seenSources,
                        seenHashes,
                        cancellationToken);

                if (loaded is not null)
                    results.Add(loaded);
            }
        }

        return results;
    }

    private async Task<DiscoveredAssetManual?> TryLoadLocalUploadAsync(
        string fileUrl,
        string? contentType,
        string? explicitFileName,
        string source,
        bool allowSchematicImages,
        string uploadsRootWithSep,
        string uploadsRoot,
        long maxBytesPerManual,
        HashSet<string> seenSources,
        HashSet<string> seenHashes,
        CancellationToken cancellationToken)
    {
        var pathPart = fileUrl.Split('?', '#')[0].Replace('\\', '/').Trim();
        if (pathPart.StartsWith('/'))
            pathPart = pathPart.TrimStart('/');

        if (!pathPart.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase))
            return null;

        var relativeWithinUploads = pathPart.Substring("uploads/".Length)
            .Replace('/', Path.DirectorySeparatorChar);

        if (string.IsNullOrWhiteSpace(relativeWithinUploads))
            return null;

        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(Path.Combine(uploadsRoot, relativeWithinUploads));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Invalid upload path '{FileUrl}' while scanning asset manuals.", fileUrl);
            return null;
        }

        if (!fullPath.StartsWith(uploadsRootWithSep, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Blocked path traversal attempt while scanning asset manual: '{FileUrl}'.", fileUrl);
            return null;
        }

        var ext = Path.GetExtension(fullPath);
        var resolvedMime = ResolveMimeType(ext, contentType, allowSchematicImages);
        if (resolvedMime is null)
            return null;

        if (!seenSources.Add(fullPath))
            return null;

        if (!File.Exists(fullPath))
            return null;

        try
        {
            var info = new FileInfo(fullPath);
            if (info.Length == 0 || info.Length > maxBytesPerManual)
            {
                _logger.LogWarning("Asset manual '{Path}' skipped due to file size ({Size} bytes).", fullPath, info.Length);
                return null;
            }

            string fileHash;
            await using (var fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true))
            {
                var hashBytes = await SHA256.HashDataAsync(fs, cancellationToken);
                fileHash = Convert.ToHexString(hashBytes).ToLowerInvariant();
            }

            if (!seenHashes.Add(fileHash))
                return null;

            var resolvedName = !string.IsNullOrWhiteSpace(explicitFileName)
                ? explicitFileName
                : StripGuidPrefix(Path.GetFileName(fullPath));

            var normalizedDownloadUrl = "/" + pathPart.TrimStart('/');

            return new DiscoveredAssetManual(
                resolvedName,
                resolvedMime,
                source,
                normalizedDownloadUrl,
                fileHash,
                info.Length,
                _ => Task.FromResult<Stream>(new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read asset manual '{Path}'.", fullPath);
            return null;
        }
    }

    private DiscoveredAssetManual? TryDecodeDataUrl(
        string dataUrl,
        string fallbackFileName,
        long maxBytesPerManual,
        HashSet<string> seenSources,
        HashSet<string> seenHashes)
    {
        var commaIndex = dataUrl.IndexOf(',');
        if (commaIndex <= 5)
            return null;

        var header = dataUrl.Substring(5, commaIndex - 5);
        var semicolonIndex = header.IndexOf(';');
        if (semicolonIndex <= 0)
            return null;

        var mimeType = header.Substring(0, semicolonIndex).Trim().ToLowerInvariant();
        if (!AllowedDocumentMimeTypes.Contains(mimeType))
            return null;

        if (!header.Contains("base64", StringComparison.OrdinalIgnoreCase))
            return null;

        var dedupeKey = dataUrl.Length > 128 ? $"data:{dataUrl.Length}:{dataUrl.Substring(0, 128)}" : dataUrl;
        if (!seenSources.Add(dedupeKey))
            return null;

        var base64Payload = dataUrl.Substring(commaIndex + 1).Trim();
        if ((base64Payload.Length * 3L) / 4L > maxBytesPerManual + 3)
        {
            _logger.LogWarning("Skipping oversized inline manual '{FileName}' in asset properties.", fallbackFileName);
            return null;
        }

        try
        {
            var bytes = Convert.FromBase64String(base64Payload);
            if (bytes.Length == 0 || bytes.Length > maxBytesPerManual)
                return null;

            var fileHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            if (!seenHashes.Add(fileHash))
                return null;

            return new DiscoveredAssetManual(
                fallbackFileName,
                mimeType,
                "property",
                DownloadUrl: null,
                fileHash,
                bytes.Length,
                _ => Task.FromResult<Stream>(new MemoryStream(bytes, writable: false)));
        }
        catch (FormatException ex)
        {
            _logger.LogWarning(ex, "Skipping malformed base64 inline manual '{FileName}'.", fallbackFileName);
            return null;
        }
    }

    private static string? ResolveMimeType(string ext, string? contentType, bool allowSchematicImages)
    {
        if (DocumentExtensionMimeMap.TryGetValue(ext, out var docMime))
            return docMime;

        if (allowSchematicImages && SchematicImageExtensionMimeMap.TryGetValue(ext, out var imgMime))
            return imgMime;

        if (!string.IsNullOrWhiteSpace(contentType))
        {
            var normalized = contentType.Split(';')[0].Trim().ToLowerInvariant();
            if (AllowedDocumentMimeTypes.Contains(normalized))
                return normalized;

            if (allowSchematicImages && SchematicImageExtensionMimeMap.ContainsValue(normalized))
                return normalized;
        }

        return null;
    }

    private static string StripGuidPrefix(string fileName)
    {
        var underscoreIdx = fileName.IndexOf('_');
        if (underscoreIdx > 0 && underscoreIdx < fileName.Length - 1)
        {
            var prefix = fileName.Substring(0, underscoreIdx);
            if (Guid.TryParse(prefix, out _))
                return fileName.Substring(underscoreIdx + 1);
        }

        return fileName;
    }

    private static List<string> ExtractPropertyMediaStrings(string propertiesJson)
    {
        var results = new List<string>();
        try
        {
            using var doc = JsonDocument.Parse(propertiesJson);
            CollectStrings(doc.RootElement, results);
        }
        catch (JsonException)
        {
            // Ignore unparseable legacy JSON payloads
        }

        return results;
    }

    private static void CollectStrings(JsonElement element, List<string> results)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var prop in element.EnumerateObject())
                    CollectStrings(prop.Value, results);
                break;

            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                    CollectStrings(item, results);
                break;

            case JsonValueKind.String:
                var val = element.GetString();
                if (!string.IsNullOrWhiteSpace(val))
                {
                    var trimmed = val.Trim();
                    if (trimmed.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
                        trimmed.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase) ||
                        trimmed.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase))
                    {
                        results.Add(trimmed);
                    }
                }
                break;
        }
    }
}
