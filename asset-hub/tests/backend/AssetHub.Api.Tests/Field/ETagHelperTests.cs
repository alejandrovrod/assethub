using System;
using AssetHub.Api.Http;
using AssetHub.Domain.Concurrency;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// El ETag es el contrato de concurrencia del cliente offline: si el parseo es laxo,
/// un <c>If-Match</c> inválido se convierte en un no-op y el cliente pisa datos ajenos
/// creyendo que validó la versión.
/// </summary>
public class ETagHelperTests
{
    private static readonly byte[] Version = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xC1 };

    [Fact]
    public void ToHeader_QuotesTheToken()
    {
        var header = ETagHelper.ToHeader(Version);

        Assert.StartsWith("\"", header);
        Assert.EndsWith("\"", header);
        Assert.Equal("\"AAAAAAAAD8E\"", header);
    }

    [Fact]
    public void ToHeader_ReturnsEmpty_WhenNoVersion()
    {
        Assert.Equal(string.Empty, ETagHelper.ToHeader((byte[]?)null));
        Assert.Equal(string.Empty, ETagHelper.ToHeader(Array.Empty<byte>()));
        Assert.Equal(string.Empty, ETagHelper.ToHeader((string?)null));
    }

    [Fact]
    public void Parse_RoundTripsAStrongEtag()
    {
        var header = ETagHelper.ToHeader(Version);

        var result = ETagHelper.Parse(header);

        Assert.Equal(IfMatchKind.Version, result.Kind);
        Assert.Equal(Version, result.Version);
    }

    [Fact]
    public void Parse_AcceptsAny()
    {
        var result = ETagHelper.Parse("*");

        Assert.Equal(IfMatchKind.Any, result.Kind);
        Assert.Null(result.Version);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Parse_MissingHeader(string? header)
    {
        Assert.Equal(IfMatchKind.Missing, ETagHelper.Parse(header).Kind);
    }

    [Theory]
    [InlineData("W/\"AAAAAAAAD8E\"")]
    [InlineData("AAAAAAAAD8E")]
    [InlineData("\"AAAAAAAAD8E")]
    [InlineData("\"not base64!\"")]
    [InlineData("\"AAAAAAAAD8E\", \"AAAAAAAAAAA\"")]
    [InlineData("\"\"")]
    [InlineData("0")]
    public void Parse_RejectsInvalidValues(string header)
    {
        var result = ETagHelper.Parse(header);

        Assert.Equal(IfMatchKind.Invalid, result.Kind);
        Assert.False(string.IsNullOrWhiteSpace(result.Error));
    }

    [Fact]
    public void Token_UsesBase64UrlAlphabet()
    {
        var version = new byte[] { 0xFB, 0xFF, 0xBF, 0x3E };
        var token = RowVersionToken.ToToken(version);

        Assert.NotNull(token);
        Assert.DoesNotContain('+', token);
        Assert.DoesNotContain('/', token);
        Assert.DoesNotContain('=', token);
        Assert.Equal(version, RowVersionToken.FromToken(token));
    }
}
