using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.FieldCopilot;
using AssetHub.Application.Interfaces;
using AssetHub.Infrastructure.AssetArchitect;
using Google.GenAI;
using Google.GenAI.Types;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AssetHub.Infrastructure.FieldCopilot;

/// <summary>
/// Persistent Gemini File Search Store client built against the <c>v1beta</c> REST API
/// (store &amp; document lifecycle) paired with <c>Google.GenAI</c> <c>Files.UploadAsync</c>
/// for resumable large PDF uploads. Zero SQL migrations are needed because store &amp;
/// document metadata live natively in Google File Search Stores and are cached in-memory.
/// </summary>
public sealed class GeminiFileSearchStoreClient : IFileSearchStoreClient, IDisposable
{
    private const string BaseUrl = "https://generativelanguage.googleapis.com/v1beta";
    private const int MaxStorePages = 10;
    private const int MaxDocumentPages = 25;
    private static readonly TimeSpan StoreCacheTtl = TimeSpan.FromMinutes(60);
    private static readonly TimeSpan DocsCacheTtl = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan MaxImportWait = TimeSpan.FromSeconds(90);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly GeminiOptions _options;
    private readonly IMemoryCache _cache;
    private readonly ILogger<GeminiFileSearchStoreClient> _logger;
    private readonly HttpClient _httpClient;
    private readonly bool _ownsHttpClient;
    private readonly Func<Stream, long, string, string, CancellationToken, Task<string>>? _fileUploaderOverride;
    private readonly TimeSpan _initialPollDelay;
    private readonly Lazy<Client?> _genAiClient;

    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _storeCreationLocks = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _assetSyncLocks = new(StringComparer.Ordinal);

    public GeminiFileSearchStoreClient(
        IOptions<GeminiOptions> options,
        IMemoryCache cache,
        ILogger<GeminiFileSearchStoreClient> logger)
        : this(options, cache, logger, httpClient: null, fileUploaderOverride: null, initialPollDelay: null)
    {
    }

    internal GeminiFileSearchStoreClient(
        IOptions<GeminiOptions> options,
        IMemoryCache cache,
        ILogger<GeminiFileSearchStoreClient> logger,
        HttpClient? httpClient,
        Func<Stream, long, string, string, CancellationToken, Task<string>>? fileUploaderOverride = null,
        TimeSpan? initialPollDelay = null)
    {
        _options = options.Value;
        _cache = cache;
        _logger = logger;

        if (httpClient is null)
        {
            _httpClient = new HttpClient(new SocketsHttpHandler
            {
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            })
            {
                Timeout = TimeSpan.FromSeconds(120)
            };
            _ownsHttpClient = true;
        }
        else
        {
            _httpClient = httpClient;
            _ownsHttpClient = false;
        }

        _fileUploaderOverride = fileUploaderOverride;
        _initialPollDelay = initialPollDelay ?? TimeSpan.FromMilliseconds(500);

        _genAiClient = new Lazy<Client?>(() =>
        {
            var apiKey = ResolveApiKey();
            if (string.IsNullOrWhiteSpace(apiKey))
                return null;

            return new Client(
                apiKey: apiKey,
                httpOptions: new HttpOptions { ApiVersion = "v1beta" });
        });
    }

    public async Task<string?> FindTenantStoreAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var cacheKey = GetStoreCacheKey(tenantId);
        if (_cache.TryGetValue(cacheKey, out string? cachedStore) && !string.IsNullOrWhiteSpace(cachedStore))
            return cachedStore;

        var apiKey = RequireApiKey();
        var targetDisplayName = GetTenantStoreDisplayName(tenantId);

        string? pageToken = null;
        for (var page = 0; page < MaxStorePages; page++)
        {
            var url = $"{BaseUrl}/fileSearchStores?pageSize=20";
            if (!string.IsNullOrWhiteSpace(pageToken))
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";

            using var req = CreateRequest(HttpMethod.Get, url, apiKey);
            using var resp = await _httpClient.SendAsync(req, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);

            if (!resp.IsSuccessStatusCode)
                throw new InvalidOperationException($"Failed to list Gemini File Search stores ({(int)resp.StatusCode}): {body}");

            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("fileSearchStores", out var storesEl) && storesEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var store in storesEl.EnumerateArray())
                {
                    var displayName = store.TryGetProperty("displayName", out var dn) ? dn.GetString() : null;
                    var name = store.TryGetProperty("name", out var n) ? n.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(name) && string.Equals(displayName, targetDisplayName, StringComparison.Ordinal))
                    {
                        _cache.Set(cacheKey, name, StoreCacheTtl);
                        return name;
                    }
                }
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out var nextEl) ? nextEl.GetString() : null;
            if (string.IsNullOrWhiteSpace(pageToken))
                break;
        }

        return null;
    }

    public async Task<IReadOnlyList<FileSearchDocumentInfo>> ListAssetDocumentsAsync(
        string storeName,
        Guid assetId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(storeName))
            return Array.Empty<FileSearchDocumentInfo>();

        var allDocs = await ListStoreDocumentsAsync(storeName, bypassCache: false, cancellationToken);

        return allDocs
            .Where(d => BelongsToAsset(d, assetId))
            .ToList();
    }

    public async Task<FileSearchSyncResult> SyncAssetManualsAsync(
        Guid tenantId,
        Guid assetId,
        IReadOnlyList<DiscoveredAssetManual> manuals,
        bool forceReindex = false,
        CancellationToken cancellationToken = default)
    {
        var lockKey = $"{tenantId:N}:{assetId:N}";
        var syncLock = _assetSyncLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));
        await syncLock.WaitAsync(cancellationToken);

        try
        {
            var apiKey = RequireApiKey();
            var storeName = await GetOrCreateTenantStoreAsync(tenantId, apiKey, cancellationToken);
            var assetIdNormalized = assetId.ToString("N");

            var allStoreDocs = await ListStoreDocumentsAsync(storeName, bypassCache: forceReindex, cancellationToken);
            var assetDocs = allStoreDocs
                .Where(d => BelongsToAsset(d, assetId))
                .ToList();

            var desiredHashes = manuals.Select(m => m.FileHash).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var activeByHash = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var docsToDelete = new List<string>();

            if (forceReindex)
            {
                docsToDelete.AddRange(assetDocs.Select(d => d.Name));
            }
            else
            {
                foreach (var doc in assetDocs)
                {
                    if (!TryGetActiveCurrentHash(doc, assetId, out var docHash) ||
                        !desiredHashes.Contains(docHash) ||
                        activeByHash.ContainsKey(docHash))
                    {
                        docsToDelete.Add(doc.Name);
                    }
                    else
                    {
                        activeByHash[docHash] = doc.Name;
                    }
                }
            }

            var removedCount = 0;
            var warnings = new List<string>();
            var anyMutation = false;

            foreach (var docName in docsToDelete)
            {
                try
                {
                    await DeleteDocumentAsync(docName, apiKey, cancellationToken);
                    removedCount++;
                    anyMutation = true;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning(ex, "Failed to prune outdated File Search document '{DocumentName}'.", docName);
                    warnings.Add($"Failed to remove outdated document {docName}: {ex.Message}");
                }
            }

            var skippedCount = 0;
            var newlyIndexedCount = 0;
            var failedManualsCount = 0;

            foreach (var manual in manuals)
            {
                if (!forceReindex && activeByHash.ContainsKey(manual.FileHash))
                {
                    skippedCount++;
                    continue;
                }

                try
                {
                    var docName = await UploadAndImportManualAsync(storeName, assetIdNormalized, manual, apiKey, cancellationToken);
                    activeByHash[manual.FileHash] = docName ?? string.Empty;
                    newlyIndexedCount++;
                    anyMutation = true;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    failedManualsCount++;
                    _logger.LogWarning(ex, "Failed to index manual '{FileName}' for asset {AssetId}.", manual.FileName, assetId);
                    warnings.Add($"{manual.FileName}: {ex.Message}");
                }
            }

            if (anyMutation)
            {
                InvalidateDocsCache(storeName);
                var refreshedDocs = await ListStoreDocumentsAsync(storeName, bypassCache: true, cancellationToken);

                foreach (var doc in refreshedDocs)
                {
                    if (TryGetActiveCurrentHash(doc, assetId, out var h))
                    {
                        activeByHash[h] = doc.Name;
                    }
                }
            }

            if (manuals.Count > 0 && activeByHash.Count == 0 && failedManualsCount == manuals.Count)
            {
                throw new InvalidOperationException(
                    $"Failed to index any manuals for asset {assetId}: {string.Join("; ", warnings)}");
            }

            return new FileSearchSyncResult(
                storeName,
                activeByHash.Count,
                newlyIndexedCount,
                skippedCount,
                removedCount,
                warnings,
                activeByHash);
        }
        finally
        {
            syncLock.Release();
        }
    }

    private async Task<string> GetOrCreateTenantStoreAsync(Guid tenantId, string apiKey, CancellationToken cancellationToken)
    {
        var existing = await FindTenantStoreAsync(tenantId, cancellationToken);
        if (!string.IsNullOrWhiteSpace(existing))
            return existing;

        var tenantLock = _storeCreationLocks.GetOrAdd(tenantId, _ => new SemaphoreSlim(1, 1));
        await tenantLock.WaitAsync(cancellationToken);

        try
        {
            existing = await FindTenantStoreAsync(tenantId, cancellationToken);
            if (!string.IsNullOrWhiteSpace(existing))
                return existing;

            var displayName = GetTenantStoreDisplayName(tenantId);

            // Try multimodal embedding model first; fall back to default embedding model if unsupported.
            var (created, body, status) = await TryCreateStoreAsync(displayName, "models/gemini-embedding-2", apiKey, cancellationToken);
            if (created is null && status == HttpStatusCode.BadRequest)
            {
                _logger.LogInformation("Retrying File Search store creation without explicit embeddingModel for tenant {TenantId}.", tenantId);
                (created, body, status) = await TryCreateStoreAsync(displayName, embeddingModel: null, apiKey, cancellationToken);
            }

            if (string.IsNullOrWhiteSpace(created))
                throw new InvalidOperationException($"Failed to create Gemini File Search store ({(int)status}): {body}");

            _cache.Set(GetStoreCacheKey(tenantId), created, StoreCacheTtl);
            return created;
        }
        finally
        {
            tenantLock.Release();
        }
    }

    private async Task<(string? StoreName, string Body, HttpStatusCode Status)> TryCreateStoreAsync(
        string displayName,
        string? embeddingModel,
        string apiKey,
        CancellationToken cancellationToken)
    {
        object payload = string.IsNullOrWhiteSpace(embeddingModel)
            ? new { displayName }
            : new { displayName, embeddingModel };

        using var req = CreateRequest(HttpMethod.Post, $"{BaseUrl}/fileSearchStores", apiKey);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var resp = await _httpClient.SendAsync(req, cancellationToken);
        var body = await resp.Content.ReadAsStringAsync(cancellationToken);

        if (!resp.IsSuccessStatusCode)
            return (null, body, resp.StatusCode);

        using var doc = JsonDocument.Parse(body);
        var name = doc.RootElement.TryGetProperty("name", out var n) ? n.GetString() : null;
        return (name, body, resp.StatusCode);
    }

    private async Task<IReadOnlyList<FileSearchDocumentInfo>> ListStoreDocumentsAsync(
        string storeName,
        bool bypassCache,
        CancellationToken cancellationToken)
    {
        var cacheKey = GetDocsCacheKey(storeName);
        if (!bypassCache && _cache.TryGetValue(cacheKey, out IReadOnlyList<FileSearchDocumentInfo>? cached) && cached is not null)
            return cached;

        var apiKey = RequireApiKey();
        var docs = new List<FileSearchDocumentInfo>();
        string? pageToken = null;

        for (var page = 0; page < MaxDocumentPages; page++)
        {
            var url = $"{BaseUrl}/{storeName}/documents?pageSize=20";
            if (!string.IsNullOrWhiteSpace(pageToken))
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";

            using var req = CreateRequest(HttpMethod.Get, url, apiKey);
            using var resp = await _httpClient.SendAsync(req, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);

            if (resp.StatusCode == HttpStatusCode.NotFound)
                break;

            if (!resp.IsSuccessStatusCode)
                throw new InvalidOperationException($"Failed to list documents in '{storeName}' ({(int)resp.StatusCode}): {body}");

            using var jsonDoc = JsonDocument.Parse(body);
            if (jsonDoc.RootElement.TryGetProperty("documents", out var docsEl) && docsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in docsEl.EnumerateArray())
                {
                    var name = el.TryGetProperty("name", out var nEl) ? nEl.GetString() : null;
                    if (string.IsNullOrWhiteSpace(name))
                        continue;

                    var displayName = el.TryGetProperty("displayName", out var dnEl) ? dnEl.GetString() : null;
                    var state = el.TryGetProperty("state", out var stEl) ? stEl.GetString() : null;
                    var metadata = ParseCustomMetadata(el);

                    docs.Add(new FileSearchDocumentInfo(name, displayName, state, metadata));
                }
            }

            pageToken = jsonDoc.RootElement.TryGetProperty("nextPageToken", out var nextEl) ? nextEl.GetString() : null;
            if (string.IsNullOrWhiteSpace(pageToken))
                break;
        }

        _cache.Set(cacheKey, docs, DocsCacheTtl);
        return docs;
    }

    private async Task<string?> UploadAndImportManualAsync(
        string storeName,
        string assetIdStr,
        DiscoveredAssetManual manual,
        string apiKey,
        CancellationToken cancellationToken)
    {
        string uploadedFileName;
        await using (var stream = await manual.OpenReadAsync(cancellationToken))
        {
            uploadedFileName = await UploadToFilesApiAsync(stream, manual, cancellationToken);
        }

        try
        {
            var importPayload = new
            {
                fileName = uploadedFileName,
                customMetadata = new[]
                {
                    new { key = "assetid", stringValue = assetIdStr },
                    new { key = "filehash", stringValue = manual.FileHash },
                    new { key = "filename", stringValue = TruncateMetadataValue(manual.FileName) },
                    new { key = "source", stringValue = manual.Source }
                }
            };

            using var req = CreateRequest(HttpMethod.Post, $"{BaseUrl}/{storeName}:importFile", apiKey);
            req.Content = new StringContent(JsonSerializer.Serialize(importPayload), Encoding.UTF8, "application/json");

            using var resp = await _httpClient.SendAsync(req, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);

            if (!resp.IsSuccessStatusCode)
                throw new InvalidOperationException($"importFile failed ({(int)resp.StatusCode}): {body}");

            var (done, opName, docName, errorMessage) = ParseOperationJson(body);
            if (!string.IsNullOrWhiteSpace(errorMessage))
                throw new InvalidOperationException($"importFile operation error: {errorMessage}");

            if (done)
                return docName;

            if (string.IsNullOrWhiteSpace(opName))
                throw new InvalidOperationException("importFile returned an incomplete operation without a name.");

            return await PollImportOperationAsync(opName, apiKey, cancellationToken);
        }
        finally
        {
            await TryDeleteTempFileAsync(uploadedFileName, apiKey, cancellationToken);
        }
    }

    private async Task<string> UploadToFilesApiAsync(
        Stream stream,
        DiscoveredAssetManual manual,
        CancellationToken cancellationToken)
    {
        var ext = Path.GetExtension(manual.FileName);
        var safeUploadName = $"manual_{manual.FileHash[..12]}{(string.IsNullOrWhiteSpace(ext) ? ".bin" : ext)}";

        if (_fileUploaderOverride is not null)
            return await _fileUploaderOverride(stream, manual.SizeBytes, safeUploadName, manual.MimeType, cancellationToken);

        var client = _genAiClient.Value
            ?? throw new InvalidOperationException("Gemini API key is not configured.");

        var uploaded = await client.Files.UploadAsync(
            stream,
            manual.SizeBytes,
            safeUploadName,
            manual.MimeType,
            new UploadFileConfig
            {
                DisplayName = manual.FileName,
                MimeType = manual.MimeType
            },
            cancellationToken);

        if (uploaded is null || string.IsNullOrWhiteSpace(uploaded.Name))
            throw new InvalidOperationException($"Gemini Files API did not return a file name for '{manual.FileName}'.");

        return uploaded.Name;
    }

    private async Task<string?> PollImportOperationAsync(
        string operationName,
        string apiKey,
        CancellationToken cancellationToken)
    {
        var startUtc = DateTime.UtcNow;
        var attempt = 0;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var multiplier = Math.Min(attempt + 1, 4);
            var delay = TimeSpan.FromMilliseconds(_initialPollDelay.TotalMilliseconds * multiplier);
            if (delay > TimeSpan.Zero)
                await Task.Delay(delay, cancellationToken);

            using var req = CreateRequest(HttpMethod.Get, $"{BaseUrl}/{operationName}", apiKey);
            using var resp = await _httpClient.SendAsync(req, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);

            if (!resp.IsSuccessStatusCode)
                throw new InvalidOperationException($"Polling import operation failed ({(int)resp.StatusCode}): {body}");

            var (done, _, docName, errorMessage) = ParseOperationJson(body);
            if (!string.IsNullOrWhiteSpace(errorMessage))
                throw new InvalidOperationException($"File Search import failed: {errorMessage}");

            if (done)
                return docName;

            if (DateTime.UtcNow - startUtc >= MaxImportWait)
                throw new TimeoutException($"Timed out waiting for Gemini File Search import operation '{operationName}'.");

            attempt++;
        }
    }

    private async Task DeleteDocumentAsync(string documentName, string apiKey, CancellationToken cancellationToken)
    {
        using var req = CreateRequest(HttpMethod.Delete, $"{BaseUrl}/{documentName}?force=true", apiKey);
        using var resp = await _httpClient.SendAsync(req, cancellationToken);

        if (resp.StatusCode == HttpStatusCode.NotFound)
            return;

        if (!resp.IsSuccessStatusCode)
        {
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException($"Delete document failed ({(int)resp.StatusCode}): {body}");
        }
    }

    private async Task TryDeleteTempFileAsync(string uploadedFileName, string apiKey, CancellationToken cancellationToken)
    {
        try
        {
            using var req = CreateRequest(HttpMethod.Delete, $"{BaseUrl}/{uploadedFileName}", apiKey);
            using var _ = await _httpClient.SendAsync(req, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "Best-effort cleanup of temporary Gemini File '{FileName}' skipped.", uploadedFileName);
        }
    }

    private static (bool Done, string? Name, string? DocumentName, string? ErrorMessage) ParseOperationJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var done = root.TryGetProperty("done", out var doneEl) && doneEl.ValueKind == JsonValueKind.True;
        var opName = root.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;

        string? errorMsg = null;
        if (root.TryGetProperty("error", out var errEl) && errEl.ValueKind == JsonValueKind.Object)
        {
            errorMsg = errEl.TryGetProperty("message", out var msgEl) ? msgEl.GetString() : errEl.GetRawText();
        }

        string? docName = null;
        if (root.TryGetProperty("response", out var respEl) && respEl.ValueKind == JsonValueKind.Object)
        {
            if (respEl.TryGetProperty("documentName", out var dnEl))
                docName = dnEl.GetString();
        }

        return (done, opName, docName, errorMsg);
    }

    private static bool BelongsToAsset(FileSearchDocumentInfo doc, Guid assetId)
    {
        if (doc.CustomMetadata.TryGetValue("assetid", out var normalizedVal) &&
            string.Equals(normalizedVal, assetId.ToString("N"), StringComparison.Ordinal))
        {
            return true;
        }

        return doc.CustomMetadata.TryGetValue("assetId", out var legacyVal) &&
               string.Equals(legacyVal, assetId.ToString("D"), StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryGetActiveCurrentHash(FileSearchDocumentInfo doc, Guid assetId, out string fileHash)
    {
        fileHash = string.Empty;
        if (string.Equals(doc.State, "STATE_FAILED", StringComparison.OrdinalIgnoreCase))
            return false;

        if (!doc.CustomMetadata.TryGetValue("assetid", out var normalizedVal) ||
            !string.Equals(normalizedVal, assetId.ToString("N"), StringComparison.Ordinal))
        {
            return false;
        }

        if (!doc.CustomMetadata.TryGetValue("filehash", out var h) || string.IsNullOrWhiteSpace(h))
            return false;

        fileHash = h;
        return true;
    }

    private static IReadOnlyDictionary<string, string> ParseCustomMetadata(JsonElement docElement)
    {
        var dict = new Dictionary<string, string>(StringComparer.Ordinal);
        if (!docElement.TryGetProperty("customMetadata", out var metaEl) || metaEl.ValueKind != JsonValueKind.Array)
            return dict;

        foreach (var entry in metaEl.EnumerateArray())
        {
            var key = entry.TryGetProperty("key", out var kEl) ? kEl.GetString() : null;
            if (string.IsNullOrWhiteSpace(key))
                continue;

            if (entry.TryGetProperty("stringValue", out var svEl) && svEl.ValueKind == JsonValueKind.String)
            {
                dict[key] = svEl.GetString() ?? string.Empty;
            }
            else if (entry.TryGetProperty("numericValue", out var nvEl) && nvEl.ValueKind == JsonValueKind.Number)
            {
                dict[key] = nvEl.GetRawText();
            }
        }

        return dict;
    }

    private static HttpRequestMessage CreateRequest(HttpMethod method, string url, string apiKey)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("x-goog-api-key", apiKey);
        return req;
    }

    private string? ResolveApiKey()
        => !string.IsNullOrWhiteSpace(_options.ApiKey)
            ? _options.ApiKey.Trim()
            : System.Environment.GetEnvironmentVariable("GEMINI_API_KEY")?.Trim();

    private string RequireApiKey()
        => ResolveApiKey()
           ?? throw new InvalidOperationException("Gemini API Key is not configured.");

    private void InvalidateDocsCache(string storeName)
        => _cache.Remove(GetDocsCacheKey(storeName));

    private static string GetTenantStoreDisplayName(Guid tenantId) => $"assethub-tenant-{tenantId:N}";
    private static string GetStoreCacheKey(Guid tenantId) => $"copilot:store:{tenantId:N}";
    private static string GetDocsCacheKey(string storeName) => $"copilot:docs:{storeName}";

    private static string TruncateMetadataValue(string value)
        => value.Length <= 250 ? value : value.Substring(0, 250);

    public void Dispose()
    {
        if (_ownsHttpClient)
            _httpClient.Dispose();

        foreach (var sem in _storeCreationLocks.Values)
            sem.Dispose();

        foreach (var sem in _assetSyncLocks.Values)
            sem.Dispose();
    }
}
