using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Commands;
using AssetHub.Application.Assets.EventHandlers;
using AssetHub.Application.Assets.Events;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Tenancy;
using AssetHub.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests;

public class ParentStatePropagationHandlerTests
{
    private const string Activo = "Activo";
    private const string FallaTotal = "Falla_Total";

    private sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId = Guid.NewGuid();
        public Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    private sealed class CapturingMediator : IMediator
    {
        public List<ChangeAssetEnvironmentStateCommand> SentCommands { get; } = new();

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
        {
            if (request is ChangeAssetEnvironmentStateCommand cmd)
                SentCommands.Add(cmd);
            return Task.FromResult(default(TResponse)!);
        }

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default) where TRequest : IRequest
        {
            if (request is ChangeAssetEnvironmentStateCommand cmd)
                SentCommands.Add(cmd);
            return Task.CompletedTask;
        }

        public Task<object?> Send(object request, CancellationToken cancellationToken = default)
        {
            if (request is ChangeAssetEnvironmentStateCommand cmd)
                SentCommands.Add(cmd);
            return Task.FromResult<object?>(null);
        }

        public Task Publish(object notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = default) where TNotification : INotification => Task.CompletedTask;
        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = default) => AsyncEnumerable.Empty<TResponse>();
        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default) => AsyncEnumerable.Empty<object?>();
    }

    private static TenantDbContext CreateDbContext(ITenantResolver resolver)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }

    private static LifecycleConfig BuildLifecycle() => new()
    {
        InitialState = Activo,
        Transitions = new Dictionary<string, List<string>>
        {
            [Activo] = new() { FallaTotal },
            [FallaTotal] = new() { Activo },
        },
        States = new Dictionary<string, StateConfig>
        {
            [Activo] = new(),
            [FallaTotal] = new()
            {
                ChildStateDependencies = new List<ChildStateDependency>
                {
                    new() { ConditionType = "All", ChildStates = new List<string> { Activo }, TargetState = Activo }
                }
            }
        }
    };

    [Fact]
    public async Task Handle_WhenIntermediateParentAlreadyInTargetState_StillReevaluatesGrandparent()
    {
        // Arrange: abuelo en Falla_Total, hijo ya Activo, nieto cambia a Activo.
        // Antes del fix, la cadena moría en el hijo y el abuelo nunca se reevaluaba.
        var resolver = new FakeTenantResolver();
        var tenantId = resolver.GetCurrentTenantId()!.Value;
        await using var db = CreateDbContext(resolver);

        var template = new AssetTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "T1",
            Name = "Template",
            LifecycleStates = BuildLifecycle()
        };

        var grandparent = new Asset { Id = Guid.NewGuid(), TenantId = tenantId, AssetTemplateId = template.Id, AssetTemplate = template, State = FallaTotal, Code = "001", Name = "Abuelo" };
        var parent = new Asset { Id = Guid.NewGuid(), TenantId = tenantId, AssetTemplateId = template.Id, AssetTemplate = template, State = Activo, Code = "002", Name = "Hijo", ParentId = grandparent.Id };
        var child = new Asset { Id = Guid.NewGuid(), TenantId = tenantId, AssetTemplateId = template.Id, AssetTemplate = template, State = Activo, Code = "003", Name = "Nieto", ParentId = parent.Id };

        db.AssetTemplates.Add(template);
        db.Assets.AddRange(grandparent, parent, child);
        await db.SaveChangesAsync();

        var mediator = new CapturingMediator();
        var handler = new ParentStatePropagationHandler(db, mediator);

        // Act
        await handler.Handle(new AssetStateChangedEvent(child.Id, FallaTotal, Activo, "Template"), CancellationToken.None);

        // Assert: el abuelo (Falla_Total, todos sus hijos en Activo) debe recibir la transición a Activo
        Assert.Contains(mediator.SentCommands, c => c.AssetId == grandparent.Id && c.ToState == Activo);
    }

    [Fact]
    public async Task Handle_WhenGrandparentRuleNotMet_DoesNotTriggerTransition()
    {
        // Arrange: abuelo en Falla_Total pero con otro hijo aún en Falla_Total → regla "All" no se cumple
        var resolver = new FakeTenantResolver();
        var tenantId = resolver.GetCurrentTenantId()!.Value;
        await using var db = CreateDbContext(resolver);

        var template = new AssetTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Code = "T1",
            Name = "Template",
            LifecycleStates = BuildLifecycle()
        };

        var grandparent = new Asset { Id = Guid.NewGuid(), TenantId = tenantId, AssetTemplateId = template.Id, AssetTemplate = template, State = FallaTotal, Code = "001", Name = "Abuelo" };
        var parent = new Asset { Id = Guid.NewGuid(), TenantId = tenantId, AssetTemplateId = template.Id, AssetTemplate = template, State = Activo, Code = "002", Name = "Hijo", ParentId = grandparent.Id };
        var blockedSibling = new Asset { Id = Guid.NewGuid(), TenantId = tenantId, AssetTemplateId = template.Id, AssetTemplate = template, State = FallaTotal, Code = "004", Name = "Otro hijo", ParentId = grandparent.Id };
        var child = new Asset { Id = Guid.NewGuid(), TenantId = tenantId, AssetTemplateId = template.Id, AssetTemplate = template, State = Activo, Code = "003", Name = "Nieto", ParentId = parent.Id };

        db.AssetTemplates.Add(template);
        db.Assets.AddRange(grandparent, parent, blockedSibling, child);
        await db.SaveChangesAsync();

        var mediator = new CapturingMediator();
        var handler = new ParentStatePropagationHandler(db, mediator);

        // Act
        await handler.Handle(new AssetStateChangedEvent(child.Id, FallaTotal, Activo, "Template"), CancellationToken.None);

        // Assert
        Assert.DoesNotContain(mediator.SentCommands, c => c.AssetId == grandparent.Id);
    }
}
