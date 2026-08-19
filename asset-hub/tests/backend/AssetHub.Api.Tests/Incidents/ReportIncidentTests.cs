using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Commands;
using AssetHub.Application.Incidents.Commands;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AssetHub.Api.Tests.Incidents;

public class ReportIncidentTests
{
    private sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    private sealed class LocalMediator : IMediator
    {
        private readonly TenantDbContext _db;

        public LocalMediator(TenantDbContext db) => _db = db;

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
        {
            if (request is ChangeAssetEnvironmentStateCommand changeCmd && typeof(TResponse) == typeof(bool))
            {
                var handler = new ChangeAssetEnvironmentStateCommandHandler(_db, this, NullLogger<ChangeAssetEnvironmentStateCommandHandler>.Instance);
                var result = handler.Handle(changeCmd, cancellationToken).GetAwaiter().GetResult();
                return Task.FromResult((TResponse)(object)result);
            }

            return Task.FromResult(default(TResponse)!);
        }

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default) where TRequest : IRequest
            => Task.CompletedTask;

        public Task<object?> Send(object request, CancellationToken cancellationToken = default)
            => Task.FromResult<object?>(null);

        public Task Publish(object notification, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = default) where TNotification : INotification
            => Task.CompletedTask;

        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = default)
            => AsyncEnumerable.Empty<TResponse>();

        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default)
            => AsyncEnumerable.Empty<object?>();
    }

    private static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var resolver = new FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }

    private static AssetTemplate CreateTemplate(Guid tenantId, string initialState = "Activo")
    {
        return new AssetTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "T1",
            Name = "Template",
            LifecycleStates = new LifecycleConfig
            {
                InitialState = initialState,
                Transitions = new System.Collections.Generic.Dictionary<string, System.Collections.Generic.List<string>>
                {
                    ["Activo"] = new() { "EnReparacion", "FueraDeServicio" },
                    ["EnReparacion"] = new() { "Activo" },
                    ["FueraDeServicio"] = new() { "Activo" }
                },
                States = new System.Collections.Generic.Dictionary<string, StateConfig>
                {
                    ["Activo"] = new(),
                    ["EnReparacion"] = new() { AssociatedModule = "incidents" },
                    ["FueraDeServicio"] = new() { AssociatedModule = "incidents" }
                }
            }
        };
    }

    private static Asset CreateAsset(Guid tenantId, AssetTemplate template)
    {
        return new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = template.Id,
            AssetTemplate = template,
            Code = "A-001",
            Name = "Test Asset",
            State = template.LifecycleStates.InitialState,
            Path = "/"
        };
    }

    private static CatalogItem CreateCatalogItem(Guid tenantId, string code)
    {
        return new CatalogItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = code,
            Order = 0
        };
    }

    [Fact]
    public async Task ReportIncident_WithTargetAssetState_LocksAssetToRequestedState()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDbContext(tenantId);

        var template = CreateTemplate(tenantId);
        var asset = CreateAsset(tenantId, template);
        var type = CreateCatalogItem(tenantId, "mechanical");

        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        db.CatalogItems.Add(type);
        await db.SaveChangesAsync();

        var mediator = new LocalMediator(db);
        var handler = new ReportIncidentCommandHandler(db, new FakeTenantResolver(tenantId), mediator, NullLogger<ReportIncidentCommandHandler>.Instance);

        var incidentId = await handler.Handle(new ReportIncidentCommand
        {
            Title = "Test incident",
            AssetId = asset.Id,
            TypeId = type.Id,
            TargetAssetState = "EnReparacion"
        }, CancellationToken.None);

        Assert.NotEqual(Guid.Empty, incidentId);

        var refreshedAsset = await db.Assets.FindAsync(asset.Id);
        Assert.Equal("EnReparacion", refreshedAsset!.State);

        var incidentEvent = db.IncidentLifecycleEvents.FirstOrDefault(e => e.IncidentId == incidentId);
        Assert.NotNull(incidentEvent);
        Assert.Equal("reportado", incidentEvent.EventType);

        var assetEvent = db.AssetLifecycleEvents.FirstOrDefault(e => e.AssetId == asset.Id);
        Assert.NotNull(assetEvent);
        Assert.Equal("cambio_estado", assetEvent.EventType);
        Assert.Equal("Activo", assetEvent.FromState);
        Assert.Equal("EnReparacion", assetEvent.ToState);
    }

    [Fact]
    public async Task ReportIncident_WithoutTargetAssetState_LocksAssetToFirstIncidentsState()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDbContext(tenantId);

        var template = CreateTemplate(tenantId);
        var asset = CreateAsset(tenantId, template);
        var type = CreateCatalogItem(tenantId, "mechanical");

        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        db.CatalogItems.Add(type);
        await db.SaveChangesAsync();

        var mediator = new LocalMediator(db);
        var handler = new ReportIncidentCommandHandler(db, new FakeTenantResolver(tenantId), mediator, NullLogger<ReportIncidentCommandHandler>.Instance);

        var incidentId = await handler.Handle(new ReportIncidentCommand
        {
            Title = "Test incident",
            AssetId = asset.Id,
            TypeId = type.Id
        }, CancellationToken.None);

        Assert.NotEqual(Guid.Empty, incidentId);

        var refreshedAsset = await db.Assets.FindAsync(asset.Id);
        Assert.Equal("EnReparacion", refreshedAsset!.State);
    }

    [Fact]
    public async Task ReportIncident_WithInvalidTargetAssetState_Throws()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDbContext(tenantId);

        var template = CreateTemplate(tenantId);
        var asset = CreateAsset(tenantId, template);
        var type = CreateCatalogItem(tenantId, "mechanical");

        db.AssetTemplates.Add(template);
        db.Assets.Add(asset);
        db.CatalogItems.Add(type);
        await db.SaveChangesAsync();

        var mediator = new LocalMediator(db);
        var handler = new ReportIncidentCommandHandler(db, new FakeTenantResolver(tenantId), mediator, NullLogger<ReportIncidentCommandHandler>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(new ReportIncidentCommand
        {
            Title = "Test incident",
            AssetId = asset.Id,
            TypeId = type.Id,
            TargetAssetState = "Activo"
        }, CancellationToken.None));
    }
}
