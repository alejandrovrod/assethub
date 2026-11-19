using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace AssetHub.Infrastructure.IncidentTriage;

/// <summary>
/// Safely loads image attachments and inline <c>data:</c> / <c>/uploads/</c> URLs from incident records
/// while enforcing strict path traversal and file size limits.
/// </summary>
public sealed class LocalIncidentMediaLoader : IIncidentMediaLoader
{
    private static readonly Dictionary<string, string> ExtensionMimeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".webp"] = "image/webp",
        [".gif"] = "image/gif"
    };

    private static readonly HashSet<string> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif"
    };

    private readonly IWebHostEnvironment _env;
    private readonly ILogger<LocalIncidentMediaLoader> _logger;

    public LocalIncidentMediaLoader(
        IWebHostEnvironment env,
        ILogger<LocalIncidentMediaLoader> logger)
    {
        _env = env;
        _logger = logger;
    }

    public async Task<IReadOnlyList<LoadedIncidentImage>> LoadImagesAsync(
        IEnumerable<(string FileUrl, string? ContentType, string FileName)> attachments,
        string? propertiesJson,
        int maxImages = 4,
        int maxBytesPerImage = 4 * 1024 * 1024,
        CancellationToken cancellationToken = default)
    {
        if (maxImages <= 0 || maxBytesPerImage <= 0)
            return Array.Empty<LoadedIncidentImage>();

        var results = new List<LoadedIncidentImage>();
        var seenSources = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
        var uploadsRoot = Path.GetFullPath(Path.Combine(webRoot, "uploads"));
        var uploadsRootWithSep = uploadsRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                                 + Path.DirectorySeparatorChar;

        if (attachments is not null)
        {
            foreach (var (fileUrl, contentType, fileName) in attachments)
            {
                if (results.Count >= maxImages)
                    break;

                if (string.IsNullOrWhiteSpace(fileUrl))
                    continue;

                var loaded = await TryLoadFromSourceAsync(
                    fileUrl.Trim(),
                    contentType,
                    string.IsNullOrWhiteSpace(fileName) ? "attachment" : fileName.Trim(),
                    uploadsRootWithSep,
                    uploadsRoot,
                    maxBytesPerImage,
                    seenSources,
                    cancellationToken);

                if (loaded is not null)
                    results.Add(loaded);
            }
        }

        if (results.Count < maxImages && !string.IsNullOrWhiteSpace(propertiesJson))
        {
            var propertySources = ExtractPropertyMediaStrings(propertiesJson);
            var index = 0;
            foreach (var src in propertySources)
            {
                if (results.Count >= maxImages)
                    break;

                index++;
                var loaded = await TryLoadFromSourceAsync(
                    src,
                    contentType: null,
                    fallbackFileName: $"incident_photo_{index}",
                    uploadsRootWithSep,
                    uploadsRoot,
                    maxBytesPerImage,
                    seenSources,
                    cancellationToken);

                if (loaded is not null)
                    results.Add(loaded);
            }
        }

        return results;
    }

    private async Task<LoadedIncidentImage?> TryLoadFromSourceAsync(
        string source,
        string? contentType,
        string fallbackFileName,
        string uploadsRootWithSep,
        string uploadsRoot,
        int maxBytesPerImage,
        HashSet<string> seenSources,
        CancellationToken cancellationToken)
    {
        if (source.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return TryDecodeDataUrl(source, fallbackFileName, maxBytesPerImage, seenSources);
        }

        return await TryLoadLocalUploadAsync(
            source,
            contentType,
            fallbackFileName,
            uploadsRootWithSep,
            uploadsRoot,
            maxBytesPerImage,
            seenSources,
            cancellationToken);
    }

    private LoadedIncidentImage? TryDecodeDataUrl(
        string dataUrl,
        string fileName,
        int maxBytesPerImage,
        HashSet<string> seenSources)
    {
        var commaIndex = dataUrl.IndexOf(',');
        if (commaIndex <= 5)
            return null;

        var header = dataUrl.Substring(5, commaIndex - 5);
        var semicolonIndex = header.IndexOf(';');
        if (semicolonIndex <= 0)
            return null;

        var mimeType = NormalizeMimeType(header.Substring(0, semicolonIndex).Trim());
        if (!AllowedMimeTypes.Contains(mimeType))
            return null;

        if (!header.Contains("base64", StringComparison.OrdinalIgnoreCase))
            return null;

        var dedupeKey = dataUrl.Length > 128 ? $"data:{dataUrl.Length}:{dataUrl.Substring(0, 128)}" : dataUrl;
        if (!seenSources.Add(dedupeKey))
            return null;

        var base64Payload = dataUrl.Substring(commaIndex + 1).Trim();
        // Quick byte estimate before allocating large buffer
        if ((base64Payload.Length * 3L) / 4L > maxBytesPerImage + 3)
        {
            _logger.LogWarning("Skipping oversized inline image '{FileName}' in incident properties.", fileName);
            return null;
        }

        try
        {
            var bytes = Convert.FromBase64String(base64Payload);
            if (bytes.Length == 0 || bytes.Length > maxBytesPerImage)
            {
                _logger.LogWarning("Inline image '{FileName}' skipped due to size ({Size} bytes).", fileName, bytes.Length);
                return null;
            }

            return new LoadedIncidentImage(fileName, mimeType, bytes);
        }
        catch (FormatException ex)
        {
            _logger.LogWarning(ex, "Skipping malformed base64 image '{FileName}'.", fileName);
            return null;
        }
    }

    private async Task<LoadedIncidentImage?> TryLoadLocalUploadAsync(
        string fileUrl,
        string? contentType,
        string fileName,
        string uploadsRootWithSep,
        string uploadsRoot,
        int maxBytesPerImage,
        HashSet<string> seenSources,
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
            _logger.LogWarning(ex, "Invalid upload path '{FileUrl}'.", fileUrl);
            return null;
        }

        if (!fullPath.StartsWith(uploadsRootWithSep, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Blocked path traversal attempt while loading incident media: '{FileUrl}'.", fileUrl);
            return null;
        }

        if (!seenSources.Add(fullPath))
            return null;

        var ext = Path.GetExtension(fullPath);
        var resolvedMime = !string.IsNullOrWhiteSpace(contentType) && AllowedMimeTypes.Contains(contentType.Trim())
            ? NormalizeMimeType(contentType.Trim())
            : (ExtensionMimeMap.TryGetValue(ext, out var mapped) ? mapped : null);

        if (resolvedMime is null)
            return null;

        if (!File.Exists(fullPath))
            return null;

        try
        {
            var info = new FileInfo(fullPath);
            if (info.Length == 0 || info.Length > maxBytesPerImage)
            {
                _logger.LogWarning("Incident image '{Path}' skipped due to file size ({Size} bytes).", fullPath, info.Length);
                return null;
            }

            var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
            var resolvedName = string.IsNullOrWhiteSpace(fileName) ? Path.GetFileName(fullPath) : fileName;
            return new LoadedIncidentImage(resolvedName, resolvedMime, bytes);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read incident image '{Path}'.", fullPath);
            return null;
        }
    }

    private static string NormalizeMimeType(string mime)
        => string.Equals(mime, "image/jpg", StringComparison.OrdinalIgnoreCase) ? "image/jpeg" : mime.ToLowerInvariant();

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
                    if (trimmed.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) ||
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
