using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Tenants.Commands;
using AssetHub.Api.Tests.CommunicationTemplates;
using Xunit;

namespace AssetHub.Api.Tests.Media;

public class UploadTenantMediaCommandHandlerTests : IDisposable
{
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly string _baseDir;

    public UploadTenantMediaCommandHandlerTests()
    {
        _baseDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "tenants");
    }

    [Fact]
    public async Task Upload_SavesFileUnderTenantFolderAndReturnsPublicUrl()
    {
        var handler = CreateHandler();
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("fake-png-bytes"));

        var url = await handler.Handle(
            new UploadTenantMediaCommand("logo.png", "image/png", content.Length, content),
            CancellationToken.None);

        var expectedDir = Path.Combine(_baseDir, _tenantId.ToString());
        var savedFiles = Directory.Exists(expectedDir) ? Directory.GetFiles(expectedDir) : Array.Empty<string>();

        Assert.StartsWith("/uploads/tenants/", url);
        Assert.EndsWith(".png", url);
        Assert.Contains($"/{_tenantId}/", url);
        Assert.Single(savedFiles);
        Assert.Equal(
            Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)),
            savedFiles[0]);
        Assert.Equal("fake-png-bytes", await File.ReadAllTextAsync(savedFiles[0]));
    }

    [Fact]
    public async Task Upload_GeneratesUniqueFileNames()
    {
        var handler = CreateHandler();
        using var content1 = new MemoryStream(Encoding.UTF8.GetBytes("a"));
        using var content2 = new MemoryStream(Encoding.UTF8.GetBytes("b"));

        var url1 = await handler.Handle(
            new UploadTenantMediaCommand("foto.jpg", "image/jpeg", content1.Length, content1),
            CancellationToken.None);
        var url2 = await handler.Handle(
            new UploadTenantMediaCommand("foto.jpg", "image/jpeg", content2.Length, content2),
            CancellationToken.None);

        Assert.NotEqual(url1, url2);
        var tenantDir = Path.Combine(_baseDir, _tenantId.ToString());
        Assert.Equal(2, Directory.GetFiles(tenantDir).Length);
    }

    [Fact]
    public async Task Upload_PreservesOriginalExtension()
    {
        var handler = CreateHandler();
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("x"));

        var url = await handler.Handle(
            new UploadTenantMediaCommand("banner.webp", "image/webp", content.Length, content),
            CancellationToken.None);

        Assert.EndsWith(".webp", url);
    }

    [Fact]
    public async Task Upload_WithoutTenant_ThrowsUnauthorizedAccess()
    {
        var handler = new UploadTenantMediaCommandHandler(new NullTenantResolver());
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("x"));

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            handler.Handle(
                new UploadTenantMediaCommand("x.png", "image/png", content.Length, content),
                CancellationToken.None));
    }

    [Theory]
    [InlineData(".html")]
    [InlineData(".exe")]
    [InlineData(".js")]
    [InlineData(".bat")]
    [InlineData("")] // sin extensión
    public async Task Upload_DisallowedExtension_ThrowsArgumentException(string extension)
    {
        var handler = CreateHandler();
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("x"));

        await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(
                new UploadTenantMediaCommand($"evil{extension}", "application/octet-stream", content.Length, content),
                CancellationToken.None));

        // El archivo nunca debe llegar a escribirse en disco
        Assert.False(Directory.Exists(Path.Combine(_baseDir, _tenantId.ToString())));
    }

    [Theory]
    [InlineData(".png")]
    [InlineData(".PNG")]
    [InlineData(".jpg")]
    [InlineData(".jpeg")]
    [InlineData(".gif")]
    [InlineData(".webp")]
    [InlineData(".svg")]
    public async Task Upload_AllowedImageExtensions_AreAccepted(string extension)
    {
        var handler = CreateHandler();
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("img"));

        var url = await handler.Handle(
            new UploadTenantMediaCommand($"foto{extension}", "image/*", content.Length, content),
            CancellationToken.None);

        // El handler preserva la extensión tal como vino en el nombre
        Assert.EndsWith(extension, url);
    }

    [Fact]
    public async Task Upload_ExceedingMaxSize_ThrowsArgumentException()
    {
        var handler = CreateHandler();
        // El handler valida SizeBytes antes de copiar el stream,
        // así que basta declarar un tamaño mayor al máximo sin materializarlo.
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("x"));

        await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(
                new UploadTenantMediaCommand("big.png", "image/png", 5 * 1024 * 1024 + 1, content),
                CancellationToken.None));

        Assert.False(Directory.Exists(Path.Combine(_baseDir, _tenantId.ToString())));
    }

    [Fact]
    public async Task Upload_ExactlyMaxSize_IsAccepted()
    {
        var handler = CreateHandler();
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("x"));

        var url = await handler.Handle(
            new UploadTenantMediaCommand("exact.png", "image/png", 5 * 1024 * 1024, content),
            CancellationToken.None);

        Assert.StartsWith($"/uploads/tenants/{_tenantId}/", url);
    }

    [Fact]
    public async Task Upload_ZeroOrNegativeSize_ThrowsArgumentException()
    {
        var handler = CreateHandler();
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("x"));

        await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(
                new UploadTenantMediaCommand("empty.png", "image/png", 0, content),
                CancellationToken.None));
    }

    [Theory]
    [InlineData("../secrets")]
    [InlineData("..\\secrets")]
    [InlineData("report<2024>?.png")]
    [InlineData("")]
    public async Task Upload_InvalidFileName_ThrowsArgumentException(string fileName)
    {
        var handler = CreateHandler();
        using var content = new MemoryStream(Encoding.UTF8.GetBytes("x"));

        await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(
                new UploadTenantMediaCommand(fileName, "image/png", content.Length, content),
                CancellationToken.None));
    }

    private sealed class NullTenantResolver : AssetHub.Application.Interfaces.ITenantResolver
    {
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => null;
    }

    private UploadTenantMediaCommandHandler CreateHandler()
        => new(new CommunicationTemplateTestHelper.FakeTenantResolver(_tenantId));

    public void Dispose()
    {
        var tenantDir = Path.Combine(_baseDir, _tenantId.ToString());
        if (Directory.Exists(tenantDir))
        {
            Directory.Delete(tenantDir, recursive: true);
        }
    }
}
