using System;
using System.Text;
using AssetHub.Application.Common.Cursors;
using AssetHub.Domain.Exceptions;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Cursor keyset del delta sync (022 T051).
///
/// El cursor es la única pieza de estado que el cliente guarda entre sesiones. Si se
/// corrompe y el servidor lo ignora en silencio, el cliente recibe la primera página de
/// nuevo, la aplica sobre su caché y cree que sincronizó: pierde los cambios posteriores
/// sin ningún error visible. Por eso un cursor inválido es un <c>400</c>, no un "empezamos
/// de cero".
/// </summary>
public class KeysetCursorTests
{
    [Fact]
    public void RoundTrip_PreservesTicksAndId()
    {
        var updatedAt = new DateTime(2026, 3, 14, 15, 9, 26, DateTimeKind.Utc).AddTicks(8071234);
        var id = Guid.Parse("9f1c2e44-5b6a-4c3d-9e8f-0a1b2c3d4e5f");

        var encoded = KeysetCursor.Encode(updatedAt, id);
        var decoded = KeysetCursor.Decode(encoded);

        Assert.Equal(updatedAt.Ticks, decoded.UpdatedAt.Ticks);
        Assert.Equal(id, decoded.Id);
    }

    [Fact]
    public void Cursor_IsUrlSafe()
    {
        var encoded = KeysetCursor.Encode(DateTime.UtcNow, Guid.NewGuid());

        // El cursor viaja en un query string: '+', '/' y '=' se romperían (o se
        // reinterpretarían como espacio) según el cliente HTTP.
        Assert.DoesNotContain("+", encoded);
        Assert.DoesNotContain("/", encoded);
        Assert.DoesNotContain("=", encoded);
        Assert.DoesNotContain(":", encoded);
    }

    [Fact]
    public void MinAndMaxTicks_RoundTrip()
    {
        var min = KeysetCursor.Decode(KeysetCursor.Encode(DateTime.MinValue, Guid.Empty));
        Assert.Equal(DateTime.MinValue.Ticks, min.UpdatedAt.Ticks);
        Assert.Equal(Guid.Empty, min.Id);

        var max = KeysetCursor.Decode(KeysetCursor.Encode(DateTime.MaxValue, Guid.NewGuid()));
        Assert.Equal(DateTime.MaxValue.Ticks, max.UpdatedAt.Ticks);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("no-es-un-cursor")]
    [InlineData("!!!")]
    public void Garbage_IsRejected(string cursor)
    {
        var error = Assert.Throws<DomainException>(() => KeysetCursor.Decode(cursor));

        Assert.Equal("invalid_cursor", error.Code);
    }

    [Fact]
    public void ValidBase64WithoutSeparator_IsRejected()
    {
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes("1234567890"));
        var error = Assert.Throws<DomainException>(() => KeysetCursor.Decode(payload));

        Assert.Equal("invalid_cursor", error.Code);
    }

    [Fact]
    public void NonGuidId_IsRejected()
    {
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes("637000000000000000:no-soy-un-guid"));
        var error = Assert.Throws<DomainException>(() => KeysetCursor.Decode(payload));

        Assert.Equal("invalid_cursor", error.Code);
    }

    [Fact]
    public void TicksOutOfRange_IsRejected()
    {
        var payload = Convert.ToBase64String(
            Encoding.UTF8.GetBytes("99999999999999999999:9f1c2e445b6a4c3d9e8f0a1b2c3d4e5f"));

        var error = Assert.Throws<DomainException>(() => KeysetCursor.Decode(payload));

        Assert.Equal("invalid_cursor", error.Code);
    }

    [Fact]
    public void EmptyId_IsRejected()
    {
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes("637000000000000000:"));

        Assert.Throws<DomainException>(() => KeysetCursor.Decode(payload));
    }
}
