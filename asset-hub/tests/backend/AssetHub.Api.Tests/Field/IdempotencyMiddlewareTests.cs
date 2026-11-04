using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Http;
using AssetHub.Api.Middleware;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Sync;
using AssetHub.Domain.Tenancy;
using AssetHub.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Contrato HTTP de idempotencia (022 T010–T015).
///
/// El punto delicado del middleware es que reserva la key en un scope propio, antes de
/// ejecutar el handler. Estos tests verifican ese ciclo completo: reserva, replay,
/// conflicto por payload distinto, conflicto por ejecución en curso, liberación en 5xx
/// y aislamiento por tenant.
/// </summary>
public class IdempotencyMiddlewareTests
{
    private const string KeyHeader = IdempotencyMiddleware.HeaderName;
    private const string ReplayHeader = IdempotencyMiddleware.ReplayHeaderName;
    private const string TenantHeader = "X-Test-Tenant";

    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid CurrentUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task RequestWithoutKey_IsNotTracked()
    {
        await using var harness = await CreateHarnessAsync();

        var response = await harness.Client.PostAsync("/api/v1/incidents", Json("{\"title\":\"Fuga\"}"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, harness.Counters.Incidents);
        Assert.Equal(0, await harness.CountRecordsAsync());
    }

    [Fact]
    public async Task SecondRequestWithSameKey_ReplaysStoredResponse()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();

        var first = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, "{\"title\":\"Fuga\"}");
        var firstBody = await first.Content.ReadAsStringAsync();
        var second = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, "{\"title\":\"Fuga\"}");
        var secondBody = await second.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        Assert.Equal(firstBody, secondBody);
        Assert.Equal(1, harness.Counters.Incidents);
        Assert.Equal(1, await harness.CountRecordsAsync());

        // La respuesta original no está marcada como replay; la repetida sí.
        Assert.False(first.Headers.Contains(ReplayHeader));
        Assert.True(second.Headers.TryGetValues(ReplayHeader, out var replayValues));
        Assert.Equal("true", replayValues!.Single());
    }

    [Fact]
    public async Task Replay_PreservesLocationHeaderAndContentType()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();

        var first = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, "{\"title\":\"Fuga\"}");
        var second = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, "{\"title\":\"Fuga\"}");

        Assert.Equal(first.Headers.Location, second.Headers.Location);
        Assert.Equal("/api/v1/incidents/inc-1", second.Headers.Location?.ToString());
        Assert.Equal("application/json", second.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task SameKeyWithDifferentPayload_Returns409KeyReuse()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();

        await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, "{\"title\":\"Fuga\"}");
        var conflict = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, "{\"title\":\"Incendio\"}");
        var body = await conflict.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Contains("idempotency_key_reuse", body);
        Assert.Equal(1, harness.Counters.Incidents);
    }

    [Fact]
    public async Task InvalidKey_Returns400()
    {
        await using var harness = await CreateHarnessAsync();

        var response = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", "no-es-un-uuid", "{\"title\":\"Fuga\"}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("invalid_idempotency_key", await response.Content.ReadAsStringAsync());
        Assert.Equal(0, harness.Counters.Incidents);
    }

    [Fact]
    public async Task RequestWhileOriginalIsRunning_Returns409RequestInProgress()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();
        const string body = "{\"title\":\"Lenta\"}";

        var inFlight = SendAsync(harness.Client, HttpMethod.Post, "/api/v1/slow", key, body);

        // Sólo se considera "en curso" si el handler ya arrancó después de reservar.
        await harness.SlowEntered.Task.WaitAsync(Timeout);

        var conflict = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/slow", key, body);
        var conflictBody = await conflict.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Contains("request_in_progress", conflictBody);
        Assert.True(conflict.Headers.TryGetValues("Retry-After", out var retryAfter));
        Assert.Equal("1", retryAfter!.Single());

        harness.SlowGate.SetResult();
        var original = await inFlight;
        Assert.Equal(HttpStatusCode.Created, original.StatusCode);
        Assert.Equal(1, harness.Counters.Slow);

        // Una vez completada, el reintento pasa a ser un replay y no vuelve a ejecutar.
        var replay = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/slow", key, body);
        Assert.Equal(HttpStatusCode.Created, replay.StatusCode);
        Assert.Equal(1, harness.Counters.Slow);
    }

    [Fact]
    public async Task ServerError_ReleasesKeySoClientCanRetry()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();
        const string body = "{\"title\":\"Falla una vez\"}";

        var failed = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/failing", key, body);
        var retried = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/failing", key, body);

        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        Assert.Equal(HttpStatusCode.Created, retried.StatusCode);
        Assert.Equal(2, harness.Counters.Failing);
        Assert.Equal(1, await harness.CountRecordsAsync());
    }

    [Fact]
    public async Task SameKeyFromDifferentTenants_AreIndependentOperations()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();
        const string body = "{\"title\":\"Fuga\"}";

        var tenantA = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, body, TenantA);
        var tenantB = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, body, TenantB);

        Assert.Equal(HttpStatusCode.Created, tenantA.StatusCode);
        Assert.Equal(HttpStatusCode.Created, tenantB.StatusCode);
        Assert.Equal(2, harness.Counters.Incidents);
        Assert.Equal(2, await harness.CountRecordsAsync());
    }

    [Fact]
    public async Task NonMutatingRequests_AreNotTracked()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();

        var first = await SendAsync(harness.Client, HttpMethod.Get, "/api/v1/incidents", key, body: null);
        var second = await SendAsync(harness.Client, HttpMethod.Get, "/api/v1/incidents", key, body: null);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(2, harness.Counters.Gets);
        Assert.Equal(0, await harness.CountRecordsAsync());
    }

    [Fact]
    public async Task AuthEndpoints_AreExcluded()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();

        await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/auth/login", key, "{\"user\":\"a\"}");
        await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/auth/login", key, "{\"user\":\"a\"}");

        Assert.Equal(2, harness.Counters.Logins);
        Assert.Equal(0, await harness.CountRecordsAsync());
    }

    [Fact]
    public async Task StaleInProgressReservation_IsTakenOver()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();
        const string body = "{\"title\":\"Huérfana\"}";

        // Simula un proceso que reservó la key y murió antes de responder.
        await harness.SeedAsync(new HttpIdempotencyRecord
        {
            Id = Guid.NewGuid(),
            TenantId = TenantA,
            UserId = CurrentUserId,
            IdempotencyKey = key,
            Fingerprint = IdempotencyFingerprint.Compute(
                "POST", "/api/v1/incidents", string.Empty, TenantA, CurrentUserId, body),
            Method = "POST",
            Path = "/api/v1/incidents",
            Status = HttpIdempotencyStatus.InProgress,
            CreatedAt = DateTime.UtcNow.AddMinutes(-5),
        });

        var response = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, harness.Counters.Incidents);
        Assert.Equal(1, await harness.CountRecordsAsync());
    }

    [Fact]
    public async Task UnhandledException_ReleasesKeyAndPropagates()
    {
        await using var harness = await CreateHarnessAsync();
        var key = Guid.NewGuid().ToString();

        await Assert.ThrowsAnyAsync<Exception>(() =>
            SendAsync(harness.Client, HttpMethod.Post, "/api/v1/boom", key, "{}"));

        // La key no debe quedar reservada: se libera para que el cliente pueda reintentar.
        Assert.Equal(0, await harness.CountRecordsAsync());

        var retried = await SendAsync(harness.Client, HttpMethod.Post, "/api/v1/incidents", key, "{}");
        Assert.Equal(HttpStatusCode.Created, retried.StatusCode);
        Assert.Equal(1, await harness.CountRecordsAsync());
    }

    // ------------------------------------------------------------------
    // Harness
    // ------------------------------------------------------------------

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        string? key,
        string? body,
        Guid? tenantId = null)
    {
        var request = new HttpRequestMessage(method, path);
        if (key is not null)
        {
            request.Headers.TryAddWithoutValidation(KeyHeader, key);
        }

        if (tenantId is not null)
        {
            request.Headers.TryAddWithoutValidation(TenantHeader, tenantId.Value.ToString());
        }

        if (body is not null)
        {
            request.Content = Json(body);
        }

        return client.SendAsync(request);
    }

    private sealed class Counters
    {
        public int Incidents;
        public int Failing;
        public int Logins;
        public int Gets;
        public int Slow;
    }

    /// <summary>
    /// Resuelve el tenant desde el header X-Test-Tenant y cae a TenantA cuando no hay
    /// request (por ejemplo, cuando el test siembra datos directamente en el DbContext).
    /// Es singleton porque el middleware lo resuelve fuera del scope del request.
    /// </summary>
    private sealed class HeaderTenantResolver : ITenantResolver
    {
        private readonly IHttpContextAccessor _accessor;
        private readonly Guid _fallback;

        public HeaderTenantResolver(IHttpContextAccessor accessor, Guid fallback)
        {
            _accessor = accessor;
            _fallback = fallback;
        }

        public Tenant? GetCurrentTenant() => null;

        public Guid? GetCurrentTenantId()
        {
            var context = _accessor.HttpContext;
            if (context is not null
                && context.Request.Headers.TryGetValue(TenantHeader, out var raw)
                && Guid.TryParse(raw.ToString(), out var tenantId))
            {
                return tenantId;
            }

            return _fallback;
        }

        public Guid? GetCurrentUserId() => CurrentUserId;
    }

    private sealed class Harness : IAsyncDisposable
    {
        public required WebApplication App { get; init; }
        public required HttpClient Client { get; init; }
        public required Counters Counters { get; init; }
        public required TaskCompletionSource SlowEntered { get; init; }
        public required TaskCompletionSource SlowGate { get; init; }

        public async Task<int> CountRecordsAsync()
        {
            using var scope = App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            return await db.HttpIdempotencyRecords.IgnoreQueryFilters().CountAsync();
        }

        public async Task SeedAsync(HttpIdempotencyRecord record)
        {
            using var scope = App.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.HttpIdempotencyRecords.Add(record);
            await db.SaveChangesAsync();
        }

        public async ValueTask DisposeAsync()
        {
            // Nunca dejar un handler colgado esperando el gate: bloquearía el shutdown.
            SlowGate.TrySetResult();
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    private static async Task<Harness> CreateHarnessAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRouting();
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddSingleton<ITenantResolver>(sp =>
            new HeaderTenantResolver(sp.GetRequiredService<IHttpContextAccessor>(), TenantA));

        // Nombre compartido entre scopes: el middleware reserva en un scope propio y
        // necesita ver exactamente el mismo store que el resto del pipeline.
        // El root explícito es obligatorio: sin él, cada scope puede construir su propio
        // service provider interno de InMemory y termina con un store distinto.
        var databaseRoot = new InMemoryDatabaseRoot();
        var databaseName = "idempotency-tests-" + Guid.NewGuid().ToString("N");
        builder.Services.AddSingleton(databaseRoot);
        builder.Services.AddDbContext<TenantDbContext>((sp, options) =>
            options.UseInMemoryDatabase(databaseName, sp.GetRequiredService<InMemoryDatabaseRoot>()));

        var counters = new Counters();
        var slowEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var slowGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var app = builder.Build();
        app.UseMiddleware<IdempotencyMiddleware>();

        app.MapPost("/api/v1/incidents", async context =>
        {
            Interlocked.Increment(ref counters.Incidents);
            context.Response.StatusCode = StatusCodes.Status201Created;
            context.Response.ContentType = "application/json";
            context.Response.Headers.Location = "/api/v1/incidents/inc-1";
            await context.Response.WriteAsync("{\"id\":\"inc-1\"}");
        });

        app.MapGet("/api/v1/incidents", async context =>
        {
            Interlocked.Increment(ref counters.Gets);
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("[]");
        });

        app.MapPost("/api/v1/slow", async context =>
        {
            Interlocked.Increment(ref counters.Slow);
            slowEntered.TrySetResult();
            await slowGate.Task;
            context.Response.StatusCode = StatusCodes.Status201Created;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"id\":\"slow-1\"}");
        });

        app.MapPost("/api/v1/failing", async context =>
        {
            var attempt = Interlocked.Increment(ref counters.Failing);
            if (attempt == 1)
            {
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"error\":\"boom\"}");
                return;
            }

            context.Response.StatusCode = StatusCodes.Status201Created;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"id\":\"recovered\"}");
        });

        app.MapPost("/api/v1/auth/login", async context =>
        {
            Interlocked.Increment(ref counters.Logins);
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"token\":\"t\"}");
        });

        app.MapPost("/api/v1/boom", _ => throw new InvalidOperationException("boom"));

        await app.StartAsync();

        var server = (TestServer)app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();

        return new Harness
        {
            App = app,
            Client = server.CreateClient(),
            Counters = counters,
            SlowEntered = slowEntered,
            SlowGate = slowGate,
        };
    }
}
