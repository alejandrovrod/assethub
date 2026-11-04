using System;
using AssetHub.Api.Http;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// El fingerprint decide si dos requests con la misma Idempotency-Key son la misma
/// operación. Si es demasiado laxo, se reproduce una respuesta equivocada; si es
/// demasiado estricto, un reintento legítimo se rechaza como reutilización de key.
/// </summary>
public class IdempotencyFingerprintTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static string Compute(string body, string method = "POST", string path = "/api/v1/incidents")
        => IdempotencyFingerprint.Compute(method, path, string.Empty, TenantId, UserId, body);

    [Fact]
    public void SameBody_ProducesSameFingerprint()
    {
        var a = Compute("{\"title\":\"Fuga\",\"severity\":\"high\"}");
        var b = Compute("{\"title\":\"Fuga\",\"severity\":\"high\"}");

        Assert.Equal(a, b);
    }

    [Fact]
    public void PropertyOrder_DoesNotChangeFingerprint()
    {
        var a = Compute("{\"title\":\"Fuga\",\"severity\":\"high\"}");
        var b = Compute("{\"severity\":\"high\",\"title\":\"Fuga\"}");

        Assert.Equal(a, b);
    }

    [Fact]
    public void Whitespace_DoesNotChangeFingerprint()
    {
        var a = Compute("{\"title\":\"Fuga\",\"severity\":\"high\"}");
        var b = Compute("{\n  \"title\": \"Fuga\",\n  \"severity\": \"high\"\n}");

        Assert.Equal(a, b);
    }

    [Fact]
    public void DifferentValue_ChangesFingerprint()
    {
        var a = Compute("{\"title\":\"Fuga\"}");
        var b = Compute("{\"title\":\"Fuga de gas\"}");

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void ArrayOrder_IsSemantic_AndChangesFingerprint()
    {
        var a = Compute("{\"codes\":[\"A\",\"B\"]}");
        var b = Compute("{\"codes\":[\"B\",\"A\"]}");

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void NestedObjects_AreCanonicalizedRecursively()
    {
        var a = Compute("{\"outer\":{\"b\":1,\"a\":{\"y\":2,\"x\":1}}}");
        var b = Compute("{\"outer\":{\"a\":{\"x\":1,\"y\":2},\"b\":1}}");

        Assert.Equal(a, b);
    }

    [Fact]
    public void DifferentTenant_ChangesFingerprint()
    {
        var body = "{\"title\":\"Fuga\"}";
        var a = IdempotencyFingerprint.Compute("POST", "/api/v1/incidents", string.Empty, TenantId, UserId, body);
        var b = IdempotencyFingerprint.Compute("POST", "/api/v1/incidents", string.Empty, Guid.NewGuid(), UserId, body);

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void DifferentMethodOrPath_ChangesFingerprint()
    {
        var body = "{\"state\":\"in_progress\"}";
        var put = IdempotencyFingerprint.Compute("PUT", "/api/v1/work-tasks/1/state", string.Empty, TenantId, UserId, body);
        var patch = IdempotencyFingerprint.Compute("PATCH", "/api/v1/work-tasks/1/state", string.Empty, TenantId, UserId, body);
        var otherPath = IdempotencyFingerprint.Compute("PUT", "/api/v1/work-tasks/2/state", string.Empty, TenantId, UserId, body);

        Assert.NotEqual(put, patch);
        Assert.NotEqual(put, otherPath);
    }

    [Fact]
    public void InvalidJson_IsHashedAsTrimmedText()
    {
        var a = Compute("asdasd  ");
        var b = Compute("asdasd");

        Assert.Equal(a, b);
    }

    [Fact]
    public void EmptyAndNullBodies_AreEquivalent()
    {
        var a = IdempotencyFingerprint.Compute("DELETE", "/api/v1/work-tasks/1", string.Empty, TenantId, null, null);
        var b = IdempotencyFingerprint.Compute("DELETE", "/api/v1/work-tasks/1", string.Empty, TenantId, null, "  ");

        Assert.Equal(a, b);
    }

    [Fact]
    public void Fingerprint_IsLowercaseHexSha256()
    {
        var fingerprint = Compute("{}");

        Assert.Equal(64, fingerprint.Length);
        Assert.Equal(fingerprint.ToLowerInvariant(), fingerprint);
        Assert.Matches("^[0-9a-f]+$", fingerprint);
    }
}
