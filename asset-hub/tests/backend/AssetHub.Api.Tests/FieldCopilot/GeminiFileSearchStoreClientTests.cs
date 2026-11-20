using System;
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
using AssetHub.Infrastructure.AssetArchitect;
using AssetHub.Infrastructure.FieldCopilot;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace AssetHub.Api.Tests.FieldCopilot;

public class GeminiFileSearchStoreClientTests
{
    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, string?, HttpResponseMessage> _responder;

        public StubHttpMessageHandler(Func<HttpRequestMessage, string?, HttpResponseMessage> responder)
        {
            _responder = responder;
        }

        public List<(HttpMethod Method, Uri Uri, string? ApiKeyHeader, string? Body)> Requests { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is not null
                ? await request.Content.ReadAsStringAsync(cancellationToken)
                : null;

            string? headerKey = request.Headers.TryGetValues("x-goog-api-key", out var vals)
                ? vals.FirstOrDefault()
                : null;

            Requests.Add((request.Method, request.RequestUri!, headerKey, body));
            return _responder(request, body);
        }
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode status, object payload)
        => new(status)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };

    private static DiscoveredAssetManual CreateManual(string name, string hash, string content = "manual text")
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        return new DiscoveredAssetManual(
            name,
            "application/pdf",
            "attachment",
            $"/uploads/{name}",
            hash,
            bytes.Length,
            _ => Task.FromResult<Stream>(new MemoryStream(bytes, writable: false)));
    }

    [Fact]
    public async Task FindTenantStoreAsync_SendsHeaderKeyAndMatchesDeterministicDisplayName()
    {
        var tenantId = Guid.NewGuid();
        var expectedDisplayName = $"assethub-tenant-{tenantId:N}";
        var handler = new StubHttpMessageHandler((req, _) =>
        {
            if (req.Method == HttpMethod.Get && req.RequestUri!.AbsolutePath.EndsWith("/fileSearchStores"))
            {
                return JsonResponse(HttpStatusCode.OK, new
                {
                    fileSearchStores = new[]
                    {
                        new { name = "fileSearchStores/other-store", displayName = "assethub-tenant-other" },
                        new { name = "fileSearchStores/tenant-match", displayName = expectedDisplayName }
                    }
                });
            }

            return JsonResponse(HttpStatusCode.NotFound, new { });
        });

        using var http = new HttpClient(handler);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        using var client = new GeminiFileSearchStoreClient(
            Options.Create(new GeminiOptions { ApiKey = "test-api-key" }),
            cache,
            NullLogger<GeminiFileSearchStoreClient>.Instance,
            http,
            initialPollDelay: TimeSpan.FromMilliseconds(1));

        var storeName = await client.FindTenantStoreAsync(tenantId);

        Assert.Equal("fileSearchStores/tenant-match", storeName);
        Assert.Single(handler.Requests);
        Assert.Equal("test-api-key", handler.Requests[0].ApiKeyHeader);
        Assert.DoesNotContain("key=", handler.Requests[0].Uri.Query);
    }

    [Fact]
    public async Task SyncAssetManualsAsync_CreatesStoreWithFallbackImportsMissingSkipsCachedAndPrunesOrphans()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        var storeName = "fileSearchStores/store-123";
        var existingOrphanDoc = $"{storeName}/documents/orphan-doc";
        var existingLegacyDoc = $"{storeName}/documents/legacy-camel-doc";

        var createAttempts = 0;
        var pollCount = 0;
        var uploadedTempFiles = new List<string>();
        var deletedPaths = new List<string>();
        var importedMetadata = new List<JsonElement>();
        var currentDocs = new List<object>
        {
            new
            {
                name = existingOrphanDoc,
                displayName = "Old_Orphan.pdf",
                state = "STATE_ACTIVE",
                customMetadata = new[]
                {
                    new { key = "assetId", stringValue = assetId.ToString("D") },
                    new { key = "fileHash", stringValue = "old-orphan-hash" },
                    new { key = "fileName", stringValue = "Old_Orphan.pdf" }
                }
            },
            // Legacy camelCase doc with matching hash must still be replaced so lowercase assetid filtering works
            new
            {
                name = existingLegacyDoc,
                displayName = "Legacy_Torque_Guide.pdf",
                state = "STATE_ACTIVE",
                customMetadata = new[]
                {
                    new { key = "assetId", stringValue = assetId.ToString("D") },
                    new { key = "fileHash", stringValue = "hash-manual-a1234567890" },
                    new { key = "fileName", stringValue = "Cylinder_Torque_Guide.pdf" }
                }
            }
        };

        var handler = new StubHttpMessageHandler((req, body) =>
        {
            var path = req.RequestUri!.AbsolutePath;

            if (req.Method == HttpMethod.Get && path.EndsWith("/fileSearchStores"))
            {
                return JsonResponse(HttpStatusCode.OK, new { fileSearchStores = Array.Empty<object>() });
            }

            if (req.Method == HttpMethod.Post && path.EndsWith("/fileSearchStores"))
            {
                createAttempts++;
                if (createAttempts == 1 && body!.Contains("gemini-embedding-2", StringComparison.Ordinal))
                {
                    return JsonResponse(HttpStatusCode.BadRequest, new { error = new { message = "embeddingModel unsupported" } });
                }

                return JsonResponse(HttpStatusCode.OK, new
                {
                    name = storeName,
                    displayName = $"assethub-tenant-{tenantId:N}"
                });
            }

            if (req.Method == HttpMethod.Get && path.EndsWith($"/{storeName}/documents"))
            {
                return JsonResponse(HttpStatusCode.OK, new { documents = currentDocs });
            }

            if (req.Method == HttpMethod.Delete)
            {
                deletedPaths.Add(path + req.RequestUri.Query);
                var resourcePath = path.StartsWith("/v1beta/", StringComparison.Ordinal)
                    ? path.Substring("/v1beta/".Length)
                    : path.TrimStart('/');
                currentDocs.RemoveAll(d => JsonSerializer.Serialize(d).Contains(resourcePath));
                return JsonResponse(HttpStatusCode.OK, new { });
            }

            if (req.Method == HttpMethod.Post && path.EndsWith($"/{storeName}:importFile"))
            {
                var parsed = JsonDocument.Parse(body!).RootElement;
                importedMetadata.Add(parsed.GetProperty("customMetadata").Clone());
                return JsonResponse(HttpStatusCode.OK, new
                {
                    name = $"{storeName}/operations/op-1",
                    done = false
                });
            }

            if (req.Method == HttpMethod.Get && path.EndsWith($"/{storeName}/operations/op-1"))
            {
                pollCount++;
                var newDocName = $"{storeName}/documents/new-doc-1";
                if (pollCount >= 2)
                {
                    currentDocs.Add(new
                    {
                        name = newDocName,
                        displayName = "Cylinder_Torque_Guide.pdf",
                        state = "STATE_ACTIVE",
                        customMetadata = new[]
                        {
                            new { key = "assetid", stringValue = assetId.ToString("N") },
                            new { key = "filehash", stringValue = "hash-manual-a1234567890" },
                            new { key = "filename", stringValue = "Cylinder_Torque_Guide.pdf" },
                            new { key = "source", stringValue = "attachment" }
                        }
                    });
                    return JsonResponse(HttpStatusCode.OK, new
                    {
                        name = $"{storeName}/operations/op-1",
                        done = true,
                        response = new { documentName = newDocName }
                    });
                }

                return JsonResponse(HttpStatusCode.OK, new
                {
                    name = $"{storeName}/operations/op-1",
                    done = false
                });
            }

            return JsonResponse(HttpStatusCode.NotFound, new { });
        });

        using var http = new HttpClient(handler);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        using var client = new GeminiFileSearchStoreClient(
            Options.Create(new GeminiOptions { ApiKey = "test-api-key" }),
            cache,
            NullLogger<GeminiFileSearchStoreClient>.Instance,
            http,
            fileUploaderOverride: (_, _, safeName, _, _) =>
            {
                var f = $"files/{safeName}";
                uploadedTempFiles.Add(f);
                return Task.FromResult(f);
            },
            initialPollDelay: TimeSpan.FromMilliseconds(1));

        var manuals = new[]
        {
            CreateManual("Cylinder_Torque_Guide.pdf", "hash-manual-a1234567890")
        };

        var firstSync = await client.SyncAssetManualsAsync(tenantId, assetId, manuals);

        Assert.Equal(storeName, firstSync.StoreName);
        Assert.Equal(2, createAttempts);
        Assert.Equal(1, firstSync.NewlyIndexedCount);
        Assert.Equal(0, firstSync.SkippedCount);
        Assert.Equal(2, firstSync.RemovedOrphanedCount);
        Assert.Equal(2, pollCount);
        Assert.Single(uploadedTempFiles);
        Assert.Contains(deletedPaths, p => p.Contains("orphan-doc") && p.Contains("force=true"));
        Assert.Contains(deletedPaths, p => p.Contains("legacy-camel-doc") && p.Contains("force=true"));
        Assert.Contains(deletedPaths, p => p.Contains("/v1beta/files/manual_hash-manual-"));
        Assert.Single(importedMetadata);
        Assert.Contains("\"assetid\"", importedMetadata[0].GetRawText());
        Assert.Contains("\"filehash\"", importedMetadata[0].GetRawText());
        Assert.Contains(assetId.ToString("N"), importedMetadata[0].GetRawText());

        // Second sync with the same hash must skip re-upload and reuse cached docs
        var secondSync = await client.SyncAssetManualsAsync(tenantId, assetId, manuals);
        Assert.Equal(0, secondSync.NewlyIndexedCount);
        Assert.Equal(1, secondSync.SkippedCount);
        Assert.Equal(0, secondSync.RemovedOrphanedCount);
        Assert.Single(uploadedTempFiles);
    }
}
