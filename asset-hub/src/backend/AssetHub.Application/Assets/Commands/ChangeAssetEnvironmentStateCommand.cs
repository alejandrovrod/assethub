using System;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;
using System.Text.Json.Nodes;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Application.Assets.Events;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Commands;

public record ChangeAssetEnvironmentStateCommand(Guid AssetId, string ToState, string? Notes, System.Collections.Generic.Dictionary<string, string>? TransitionData = null) : IRequest<bool>;

public class ChangeAssetEnvironmentStateCommandHandler : IRequestHandler<ChangeAssetEnvironmentStateCommand, bool>
{
    private readonly ITenantDbContext _dbContext;
    private readonly IMediator _mediator;

    public ChangeAssetEnvironmentStateCommandHandler(ITenantDbContext dbContext, IMediator mediator)
    {
        _dbContext = dbContext;
        _mediator = mediator;
    }

    public async Task<bool> Handle(ChangeAssetEnvironmentStateCommand request, CancellationToken cancellationToken)
    {
        var asset = await _dbContext.Assets
            .Include(a => a.AssetTemplate)
            .FirstOrDefaultAsync(a => a.Id == request.AssetId, cancellationToken);
            
        if (asset == null) return false;

        var fromState = asset.State;
        
        // Validación del template
        if (asset.AssetTemplate != null)
        {
            var allowedTransitions = asset.AssetTemplate.LifecycleStates.Transitions;
            if (!allowedTransitions.ContainsKey(fromState) || !allowedTransitions[fromState].Contains(request.ToState))
            {
                throw new InvalidOperationException($"Transición no permitida de {fromState} a {request.ToState}");
            }

            var statesConfig = asset.AssetTemplate.LifecycleStates.States;
            
            if (statesConfig != null)
            {
                // Ver si el estado actual es terminal
                if (statesConfig.TryGetValue(fromState, out var currentConfig) && currentConfig.IsTerminal)
                {
                    throw new InvalidOperationException($"El estado actual {fromState} es terminal. No se permiten más transiciones.");
                }

                if (statesConfig.TryGetValue(request.ToState, out var targetConfig))
                {
                    // Validación de Roles (mock)
                    if (targetConfig.AllowedRoles != null && targetConfig.AllowedRoles.Count > 0)
                    {
                        // En la vida real verificaríamos el rol del usuario conectado
                        // if (!targetConfig.AllowedRoles.Intersect(userRoles).Any()) throw...
                    }

                    // Validación de Campos Requeridos
                    if (targetConfig.RequiresFields != null && targetConfig.RequiresFields.Count > 0)
                    {
                        if (request.TransitionData == null)
                            throw new InvalidOperationException($"Faltan campos requeridos para transicionar a {request.ToState}");

                        foreach (var field in targetConfig.RequiresFields)
                        {
                            if (!request.TransitionData.ContainsKey(field) || string.IsNullOrWhiteSpace(request.TransitionData[field]))
                            {
                                throw new InvalidOperationException($"El campo {field} es requerido para cambiar al estado {request.ToState}");
                            }
                        }
                    }

                    // Trigger Acciones Automáticas (mock logs)
                    if (!string.IsNullOrEmpty(targetConfig.OnEnterAction))
                    {
                        // Log the action execution
                        Console.WriteLine($"[AUTOMATED ACTION TRIGGERED] Asset: {asset.Id}, Action: {targetConfig.OnEnterAction}");
                    }
                }
            }
        }

        // Merge TransitionData into PropertiesJson
        if (request.TransitionData != null && request.TransitionData.Count > 0)
        {
            var currentProps = string.IsNullOrWhiteSpace(asset.PropertiesJson) 
                ? new JsonObject() 
                : JsonNode.Parse(asset.PropertiesJson)?.AsObject() ?? new JsonObject();
            
            foreach (var kvp in request.TransitionData)
            {
                currentProps[kvp.Key] = kvp.Value;
            }
            asset.PropertiesJson = currentProps.ToJsonString();
        }

        asset.State = request.ToState;

        var serializedTransitionData = request.TransitionData != null && request.TransitionData.Count > 0 
            ? JsonSerializer.Serialize(request.TransitionData) 
            : null;

        _dbContext.AssetLifecycleEvents.Add(new AssetLifecycleEvent
        {
            AssetId = asset.Id,
            EventType = "cambio_estado",
            FromState = fromState,
            ToState = request.ToState,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? serializedTransitionData : request.Notes + (serializedTransitionData != null ? "\nData: " + serializedTransitionData : ""),
            At = DateTime.UtcNow,
            UserId = Guid.Empty // Debe venir de Auth
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
        
        // Publish Event for background processors (Notifications, Modules, etc)
        await _mediator.Publish(new AssetStateChangedEvent(
            asset.Id, 
            fromState, 
            request.ToState, 
            asset.AssetTemplate?.Name ?? "Desconocido", 
            request.TransitionData
        ), cancellationToken);

        return true;
    }
}
