using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using AssetHub.Infrastructure.FieldCopilot;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.FieldCopilot;

public class LocalAssetManualLoaderTests
{
    private static readonly byte[] SamplePdfBytes = "%PDF-1.4 sample pump torque spec\n"u8.ToArray();
    private static readonly byte[] SecondPdfBytes = "%PDF-1.4 second hydraulic schematic\n"u8.ToArray();
    private static readonly byte[] SamplePngBytes = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 };

    private static (LocalAssetManualLoader Loader, string TempRoot) CreateLoader()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"AssetHub_ManualTest_{Guid.NewGuid():N}");
        var webRoot = Path.Combine(tempRoot, "wwwroot");
        Directory.CreateDirectory(Path.Combine(webRoot, "uploads"));

        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(e => e.ContentRootPath).Returns(tempRoot);
        env.SetupGet(e => e.WebRootPath).Returns(webRoot);

        var loader = new LocalAssetManualLoader(env.Object, NullLogger<LocalAssetManualLoader>.Instance);
        return (loader, tempRoot);
    }

    [Fact]
    public async Task DiscoverManualsAsync_LoadsAttachmentPdfComputesSha256AndStreamsContent()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var assetId = Guid.NewGuid();
            var assetDir = Path.Combine(tempRoot, "wwwroot", "uploads", assetId.ToString());
            Directory.CreateDirectory(assetDir);

            var pdfPath = Path.Combine(assetDir, "abc123.pdf");
            await File.WriteAllBytesAsync(pdfPath, SamplePdfBytes);

            var expectedHash = Convert.ToHexString(SHA256.HashData(SamplePdfBytes)).ToLowerInvariant();
            var attachments = new (string BlobUri, string? ContentType, string FileName, string? Kind)[]
            {
                ($"/uploads/{assetId}/abc123.pdf", "application/pdf", "Pump_Service_Manual.pdf", "doc")
            };

            var manuals = await loader.DiscoverManualsAsync(attachments, propertiesJson: null);

            var manual = Assert.Single(manuals);
            Assert.Equal("Pump_Service_Manual.pdf", manual.FileName);
            Assert.Equal("application/pdf", manual.MimeType);
            Assert.Equal("attachment", manual.Source);
            Assert.Equal($"/uploads/{assetId}/abc123.pdf", manual.DownloadUrl);
            Assert.Equal(expectedHash, manual.FileHash);
            Assert.Equal(SamplePdfBytes.Length, manual.SizeBytes);

            await using var stream = await manual.OpenReadAsync(default);
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms);
            Assert.Equal(SamplePdfBytes, ms.ToArray());
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DiscoverManualsAsync_DiscoversPropertiesJsonUploadsAndInlinePdfStrippingGuidPrefix()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var storedName = $"{Guid.NewGuid()}_Hydraulic_Manual.pdf";
            var uploadPath = Path.Combine(tempRoot, "wwwroot", "uploads", storedName);
            await File.WriteAllBytesAsync(uploadPath, SamplePdfBytes);

            var inlineBase64 = Convert.ToBase64String(SecondPdfBytes);
            var propsJson = JsonSerializer.Serialize(new
            {
                manufacturer_manual = $"/uploads/{storedName}",
                nested = new
                {
                    wiring_pdf = $"data:application/pdf;base64,{inlineBase64}",
                    external_link = "https://evil.example.com/manual.pdf"
                }
            });

            var manuals = await loader.DiscoverManualsAsync(
                Array.Empty<(string, string?, string, string?)>(),
                propsJson);

            Assert.Equal(2, manuals.Count);
            Assert.Contains(manuals, m => m.FileName == "Hydraulic_Manual.pdf" && m.Source == "property");
            Assert.Contains(manuals, m => m.MimeType == "application/pdf" && m.DownloadUrl == null && m.SizeBytes == SecondPdfBytes.Length);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DiscoverManualsAsync_BlocksPathTraversalAndExternalUrls()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var secretPath = Path.Combine(tempRoot, "secret.pdf");
            await File.WriteAllBytesAsync(secretPath, SamplePdfBytes);

            var validPath = Path.Combine(tempRoot, "wwwroot", "uploads", "valid.pdf");
            await File.WriteAllBytesAsync(validPath, SecondPdfBytes);

            var attachments = new (string BlobUri, string? ContentType, string FileName, string? Kind)[]
            {
                ("/uploads/../secret.pdf", "application/pdf", "secret1.pdf", "doc"),
                ("/uploads/../../secret.pdf", "application/pdf", "secret2.pdf", "doc"),
                (secretPath, "application/pdf", "secret3.pdf", "doc"),
                ("https://example.com/remote.pdf", "application/pdf", "remote.pdf", "doc"),
                ("/uploads/valid.pdf", "application/pdf", "Valid_Manual.pdf", "doc")
            };

            var manuals = await loader.DiscoverManualsAsync(attachments, propertiesJson: null);

            var manual = Assert.Single(manuals);
            Assert.Equal("Valid_Manual.pdf", manual.FileName);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DiscoverManualsAsync_SkipsPhotoAttachmentsWhileAllowingPlanImages()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var uploads = Path.Combine(tempRoot, "wwwroot", "uploads");
            await File.WriteAllBytesAsync(Path.Combine(uploads, "snapshot.png"), SamplePngBytes);
            await File.WriteAllBytesAsync(Path.Combine(uploads, "wiring_diagram.png"), new byte[] { 137, 80, 78, 71, 1, 2, 3, 4 });

            var attachments = new (string BlobUri, string? ContentType, string FileName, string? Kind)[]
            {
                ("/uploads/snapshot.png", "image/png", "field_snapshot.png", "photo"),
                ("/uploads/wiring_diagram.png", "image/png", "Wiring_Diagram.png", "plan")
            };

            var manuals = await loader.DiscoverManualsAsync(attachments, propertiesJson: null);

            var manual = Assert.Single(manuals);
            Assert.Equal("Wiring_Diagram.png", manual.FileName);
            Assert.Equal("image/png", manual.MimeType);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public async Task DiscoverManualsAsync_DeduplicatesIdenticalSha256AndEnforcesSizeLimit()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var uploads = Path.Combine(tempRoot, "wwwroot", "uploads");
            await File.WriteAllBytesAsync(Path.Combine(uploads, "copy1.pdf"), SamplePdfBytes);
            await File.WriteAllBytesAsync(Path.Combine(uploads, "copy2.pdf"), SamplePdfBytes);
            await File.WriteAllBytesAsync(Path.Combine(uploads, "huge.pdf"), Encoding.UTF8.GetBytes(new string('X', 512)));

            var attachments = new (string BlobUri, string? ContentType, string FileName, string? Kind)[]
            {
                ("/uploads/copy1.pdf", "application/pdf", "First.pdf", "doc"),
                ("/uploads/copy2.pdf", "application/pdf", "Duplicate_Content.pdf", "doc"),
                ("/uploads/huge.pdf", "application/pdf", "Huge.pdf", "doc")
            };

            var manuals = await loader.DiscoverManualsAsync(
                attachments,
                propertiesJson: null,
                maxManuals: 10,
                maxBytesPerManual: 128);

            var manual = Assert.Single(manuals);
            Assert.Equal("First.pdf", manual.FileName);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }
}
