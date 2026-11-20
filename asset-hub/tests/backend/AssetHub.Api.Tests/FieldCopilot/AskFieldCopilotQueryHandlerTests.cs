using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.FieldCopilot;
using AssetHub.Application.FieldCopilot.Queries;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.EntityTypes;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.FieldCopilot;

public class AskFieldCopilotQueryHandlerTests
{
    private sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
        public Guid? GetCurrentUserId() => null;
    }

    private static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, new FakeTenantResolver(tenantId));
    }

    [Fact]
    public async Task Handle_WhenQuestionAndAudioAreBothMissing_ThrowsArgumentException()
    {
        using var db = CreateDbContext(Guid.NewGuid());
        var loader = new Mock<IAssetManualLoader>();
        var store = new Mock<IFileSearchStoreClient>();
        var agent = new Mock<IFieldCopilotAgent>();

        var handler = new AskFieldCopilotQueryHandler(db, loader.Object, store.Object, agent.Object);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(new AskFieldCopilotQuery(Guid.NewGuid(), "   ", AudioBase64: null), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_WhenAudioMimeTypeIsUnsupported_ThrowsArgumentException()
    {
        using var db = CreateDbContext(Guid.NewGuid());
        var loader = new Mock<IAssetManualLoader>();
        var store = new Mock<IFileSearchStoreClient>();
        var agent = new Mock<IFieldCopilotAgent>();

        var handler = new AskFieldCopilotQueryHandler(db, loader.Object, store.Object, agent.Object);
        var fakePayload = Convert.ToBase64String(new byte[] { 1, 2, 3 });

        await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(
                new AskFieldCopilotQuery(Guid.NewGuid(), Question: null, AudioBase64: fakePayload, AudioMimeType: "audio/exe"),
                CancellationToken.None));
    }

    [Fact]
    public async Task Handle_WhenAssetNotFound_ThrowsKeyNotFoundException()
    {
        using var db = CreateDbContext(Guid.NewGuid());
        var loader = new Mock<IAssetManualLoader>();
        var store = new Mock<IFileSearchStoreClient>();
        var agent = new Mock<IFieldCopilotAgent>();

        var handler = new AskFieldCopilotQueryHandler(db, loader.Object, store.Object, agent.Object);

        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            handler.Handle(new AskFieldCopilotQuery(Guid.NewGuid(), "Torque spec?"), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_WhenAssetHasNoManuals_ReturnsSafeNotFoundWithoutCallingStoreOrAgent()
    {
        var tenantId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);

        var assetId = Guid.NewGuid();
        db.Assets.Add(new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "GEN-01",
            Name = "Backup Generator 01",
            Path = "/",
            State = "OPERATIONAL"
        });
        await db.SaveChangesAsync();

        var loader = new Mock<IAssetManualLoader>();
        loader.Setup(l => l.DiscoverManualsAsync(
                It.IsAny<IEnumerable<(string, string?, string, string?)>>(),
                It.IsAny<string?>(),
                It.IsAny<int>(),
                It.IsAny<long>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<DiscoveredAssetManual>());

        var store = new Mock<IFileSearchStoreClient>();
        var agent = new Mock<IFieldCopilotAgent>();
        var handler = new AskFieldCopilotQueryHandler(db, loader.Object, store.Object, agent.Object);

        var result = await handler.Handle(
            new AskFieldCopilotQuery(assetId, "Cylinder head torque?", PreferredLanguage: "en"),
            CancellationToken.None);

        Assert.False(result.FoundInManuals);
        Assert.Equal(0, result.IndexedManualsCount);
        Assert.Equal("none", result.ModelUsed);
        Assert.Contains("No technical manuals", result.Answer, StringComparison.OrdinalIgnoreCase);

        store.Verify(
            s => s.SyncAssetManualsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IReadOnlyList<DiscoveredAssetManual>>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()),
            Times.Never);
        agent.Verify(
            a => a.AskAsync(It.IsAny<AskFieldCopilotRequest>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ValidRequest_LazySyncsManualsSanitizesHistoryAndForwardsVoiceToAgent()
    {
        var tenantId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);

        var entityTypeId = Guid.NewGuid();
        db.BusinessEntityTypes.Add(new BusinessEntityType
        {
            Id = entityTypeId,
            TenantId = tenantId,
            Code = "COMP",
            Name = "Compressor",
            IsActive = true
        });

        var templateId = Guid.NewGuid();
        db.AssetTemplates.Add(new AssetTemplate
        {
            Id = templateId,
            TenantId = tenantId,
            BusinessEntityTypeId = entityTypeId,
            Code = "COMP-500",
            Name = "Atlas Compressor 500"
        });

        var assetId = Guid.NewGuid();
        db.Assets.Add(new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = templateId,
            Code = "CMP-09",
            Name = "Main Air Compressor",
            Path = "/",
            State = "OPERATIONAL"
        });
        await db.SaveChangesAsync();

        var discoveredManual = new DiscoveredAssetManual(
            "Atlas_500_Service.pdf",
            "application/pdf",
            "attachment",
            $"/uploads/{assetId}/atlas.pdf",
            "sha256-abc",
            2048,
            _ => Task.FromResult<Stream>(new MemoryStream(Encoding.UTF8.GetBytes("pdf"))));

        var loader = new Mock<IAssetManualLoader>();
        loader.Setup(l => l.DiscoverManualsAsync(
                It.IsAny<IEnumerable<(string, string?, string, string?)>>(),
                It.IsAny<string?>(),
                It.IsAny<int>(),
                It.IsAny<long>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { discoveredManual });

        var store = new Mock<IFileSearchStoreClient>();
        store.Setup(s => s.SyncAssetManualsAsync(
                tenantId,
                assetId,
                It.IsAny<IReadOnlyList<DiscoveredAssetManual>>(),
                false,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FileSearchSyncResult(
                "fileSearchStores/t1",
                IndexedCount: 1,
                NewlyIndexedCount: 1,
                SkippedCount: 0,
                RemovedOrphanedCount: 0,
                Warnings: Array.Empty<string>(),
                HashToDocumentName: new Dictionary<string, string>
                {
                    ["sha256-abc"] = "fileSearchStores/t1/documents/doc-1"
                }));

        AskFieldCopilotRequest? capturedRequest = null;
        var agent = new Mock<IFieldCopilotAgent>();
        agent.Setup(a => a.AskAsync(It.IsAny<AskFieldCopilotRequest>(), It.IsAny<CancellationToken>()))
            .Callback<AskFieldCopilotRequest, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new FieldCopilotResponse(
                "Tighten M12 bolts to 85 Nm in cross pattern.",
                FoundInManuals: true,
                Citations: new[]
                {
                    new FieldCopilotCitation("Atlas_500_Service.pdf", 42, "Step 3: 85 Nm...", $"/uploads/{assetId}/atlas.pdf", "fileSearchStores/t1/documents/doc-1", null)
                },
                SafetyWarnings: new[] { "Depressurize air receiver tank before loosening bolts." },
                IndexedManualsCount: 1,
                ModelUsed: "gemini-3.1-flash-lite",
                UsedVoiceInput: true));

        var audioBytes = Encoding.UTF8.GetBytes("fake-webm-opus-audio");
        var history = Enumerable.Range(1, 8)
            .Select(i => new CopilotConversationTurn(i % 2 == 0 ? "assistant" : "user", $"Turn {i}"))
            .Append(new CopilotConversationTurn("user", "   "))
            .ToList();

        var handler = new AskFieldCopilotQueryHandler(db, loader.Object, store.Object, agent.Object);
        var response = await handler.Handle(
            new AskFieldCopilotQuery(
                assetId,
                Question: null,
                AudioBase64: $"data:audio/webm;codecs=opus;base64,{Convert.ToBase64String(audioBytes)}",
                AudioMimeType: "audio/webm;codecs=opus",
                History: history,
                PreferredLanguage: "es-MX"),
            CancellationToken.None);

        Assert.True(response.FoundInManuals);
        Assert.True(response.UsedVoiceInput);
        Assert.Single(response.Citations);
        Assert.Equal(42, response.Citations[0].PageNumber);

        Assert.NotNull(capturedRequest);
        Assert.Equal("fileSearchStores/t1", capturedRequest!.FileSearchStoreName);
        Assert.Equal("Atlas Compressor 500", capturedRequest.TemplateName);
        Assert.Equal("es", capturedRequest.PreferredLanguage);
        Assert.Equal("audio/webm", capturedRequest.AudioMimeType);
        Assert.Equal(audioBytes, capturedRequest.AudioBytes);
        Assert.Equal(6, capturedRequest.History.Count);
        Assert.Equal("Turn 3", capturedRequest.History[0].Text);
        Assert.Equal("model", capturedRequest.History[1].Role);
    }
}
