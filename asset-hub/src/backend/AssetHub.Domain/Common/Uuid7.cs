using System;
using System.Security.Cryptography;

namespace AssetHub.Domain.Common;

/// <summary>
/// Generates RFC 9562 version 7 UUIDs (48-bit Unix timestamp in milliseconds + random tail).
///
/// The offline lease uses a v7 <c>jti</c> (022 §4.4) for the same reason the PWA generates
/// <c>outbox_mutations.id</c> as v7: two identifiers created in the same second still sort
/// chronologically, which is what makes a trace of "what was issued when" readable without
/// a timestamp column next to it. A v4 GUID is random and loses that ordering.
/// </summary>
public static class Uuid7
{
    /// <summary>Creates a new version 7 UUID with the current UTC time.</summary>
    public static Guid NewGuid() => NewGuid(DateTimeOffset.UtcNow);

    /// <summary>Creates a new version 7 UUID with an explicit instant (used by tests).</summary>
    public static Guid NewGuid(DateTimeOffset timestamp)
    {
        Span<byte> bytes = stackalloc byte[16];
        RandomNumberGenerator.Fill(bytes);

        var unixMs = (ulong)timestamp.ToUnixTimeMilliseconds();

        // Bytes 0..5 hold the big-endian timestamp; RFC 9562 §5.7.
        bytes[0] = (byte)(unixMs >> 40);
        bytes[1] = (byte)(unixMs >> 32);
        bytes[2] = (byte)(unixMs >> 24);
        bytes[3] = (byte)(unixMs >> 16);
        bytes[4] = (byte)(unixMs >> 8);
        bytes[5] = (byte)unixMs;

        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x70); // version 7
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80); // variant 10xx

        // bigEndian: true keeps the RFC byte layout instead of Guid's mixed-endian one, so
        // the version nibble a client reads from the string is the one written above.
        return new Guid(bytes, bigEndian: true);
    }
}
