using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using AssetHub.Infrastructure.IncidentTriage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.IncidentTriage;

public class LocalIncidentMediaLoaderTests
{
    private static readonly byte[] SamplePngBytes = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 };

    private static (LocalIncidentMediaLoader Loader, string TempRoot) CreateLoader()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"AssetHub_MediaTest_{Guid.NewGuid():N}");
        var webRoot = Path.Combine(tempRoot, "wwwroot");
        Directory.CreateDirectory(Path.Combine(webRoot, "uploads"));

        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(e => e.ContentRootPath).Returns(tempRoot);
        env.SetupGet(e => e.WebRootPath).Returns(webRoot);

        var loader = new LocalIncidentMediaLoader(env.Object, NullLogger<LocalIncidentMediaLoader>.Instance);
        return (loader, tempRoot);
    }

    [Fact]
    public async Task LoadImagesAsync_DecodesInlineDataUrlFromPropertiesJson()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var base64 = Convert.ToBase64String(SamplePngBytes);
            var propsJson = JsonSerializer.Serialize(new
            {
                evidence_photo = $"data:image/png;base64,{base64}"
            });

            var images = await loader.LoadImagesAsync(Array.Empty<(string, string?, string)>(), propsJson);

            Assert.Single(images);
            Assert.Equal("image/png", images[0].MimeType);
            Assert.Equal(SamplePngBytes, images[0].Bytes);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public async Task LoadImagesAsync_LoadsLocalUploadAndBlocksPathTraversal()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var secretFile = Path.Combine(tempRoot, "secret.png");
            await File.WriteAllBytesAsync(secretFile, SamplePngBytes);

            var validFile = Path.Combine(tempRoot, "wwwroot", "uploads", "valid-photo.jpg");
            await File.WriteAllBytesAsync(validFile, SamplePngBytes);

            var attachments = new (string FileUrl, string? ContentType, string FileName)[]
            {
                ("/uploads/../secret.png", "image/png", "traversal.png"),
                ("/uploads/../../secret.png", "image/png", "traversal2.png"),
                ("/uploads/valid-photo.jpg", "image/jpeg", "leak.jpg")
            };

            var images = await loader.LoadImagesAsync(attachments, propertiesJson: null);

            Assert.Single(images);
            Assert.Equal("leak.jpg", images[0].FileName);
            Assert.Equal("image/jpeg", images[0].MimeType);
            Assert.Equal(SamplePngBytes, images[0].Bytes);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public async Task LoadImagesAsync_RespectsMaxImagesAndMaxBytesPerImageLimits()
    {
        var (loader, tempRoot) = CreateLoader();
        try
        {
            var small = Convert.ToBase64String(new byte[] { 1, 2, 3, 4 });
            var tooLarge = Convert.ToBase64String(new byte[256]);
            var propsJson = JsonSerializer.Serialize(new
            {
                photos = new[]
                {
                    $"data:image/png;base64,{tooLarge}",
                    $"data:image/png;base64,{small}",
                    $"data:image/jpeg;base64,{small}",
                    $"data:image/webp;base64,{small}"
                }
            });

            var images = await loader.LoadImagesAsync(
                Array.Empty<(string, string?, string)>(),
                propsJson,
                maxImages: 2,
                maxBytesPerImage: 64);

            Assert.Equal(2, images.Count);
            Assert.All(images, img => Assert.Equal(4, img.Bytes.Length));
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }
}
