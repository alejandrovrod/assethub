using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Commands;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.FieldCopilot;

public class UploadAssetAttachmentCommandHandlerTests
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
    public async Task Handle_SetsTenantIdDelegatesToFileStorageAndPassesTenantQueryFilter()
    {
        var tenantId = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);

        db.Assets.Add(new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "PUMP-01",
            Name = "Atlas X500",
            Path = "/",
            State = "OPERATIONAL"
        });
        await db.SaveChangesAsync();

        var pdfBytes = Encoding.UTF8.GetBytes("%PDF-1.4 sample manual");
        var storage = new Mock<IFileStorageService>();
        storage.Setup(s => s.UploadFileAsync(It.IsAny<Stream>(), "Manual_AtlasX500.pdf", "application/pdf"))
            .ReturnsAsync("/uploads/1234_Manual_AtlasX500.pdf");

        var handler = new UploadAssetAttachmentCommandHandler(db, storage.Object);
        using var stream = new MemoryStream(pdfBytes);

        var attachmentId = await handler.Handle(
            new UploadAssetAttachmentCommand(
                assetId,
                @"C:\fakepath\Manual_AtlasX500.pdf",
                "application/pdf",
                pdfBytes.Length,
                stream),
            CancellationToken.None);

        // Query using a fresh context instance sharing the same filter semantics would also see TenantId == tenantId;
        // verify both the stored TenantId and that DbSet query (with global TenantId filter) finds it.
        var saved = await db.AssetAttachments.FirstOrDefaultAsync(a => a.Id == attachmentId);
        Assert.NotNull(saved);
        Assert.Equal(tenantId, saved!.TenantId);
        Assert.Equal(assetId, saved.AssetId);
        Assert.Equal("Manual_AtlasX500.pdf", saved.FileName);
        Assert.Equal("/uploads/1234_Manual_AtlasX500.pdf", saved.BlobUri);
        Assert.Equal("doc", saved.Kind);

        storage.Verify(
            s => s.UploadFileAsync(It.IsAny<Stream>(), "Manual_AtlasX500.pdf", "application/pdf"),
            Times.Once);
    }
}
