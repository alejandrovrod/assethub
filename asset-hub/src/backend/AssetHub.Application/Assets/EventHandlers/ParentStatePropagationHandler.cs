using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Events;
using AssetHub.Application.Assets.Commands;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using AssetHub.Domain.AssetTemplates;

namespace AssetHub.Application.Assets.EventHandlers;

public class ParentStatePropagationHandler : INotificationHandler<AssetStateChangedEvent>
{
    private readonly ITenantDbContext _dbContext;
    private readonly IMediator _mediator;

    public ParentStatePropagationHandler(ITenantDbContext dbContext, IMediator mediator)
    {
        _dbContext = dbContext;
        _mediator = mediator;
    }

    public async Task Handle(AssetStateChangedEvent notification, CancellationToken cancellationToken)
    {
        // 1. Load the child asset that changed state
        var childAsset = await _dbContext.Assets
            .FirstOrDefaultAsync(a => a.Id == notification.AssetId, cancellationToken);

        if (childAsset == null || !childAsset.ParentId.HasValue)
        {
            return; // No parent, nothing to propagate
        }

        // 2. Load the Parent and its template
        var parentAsset = await _dbContext.Assets
            .Include(a => a.AssetTemplate)
            .FirstOrDefaultAsync(a => a.Id == childAsset.ParentId.Value, cancellationToken);

        if (parentAsset?.AssetTemplate?.LifecycleStates?.States == null)
        {
            return;
        }

        // 3. Get the Parent's current state configuration
        if (!parentAsset.AssetTemplate.LifecycleStates.States.TryGetValue(parentAsset.State, out var currentStateConfig))
        {
            return; // Parent state not found in config
        }

        if (currentStateConfig.ChildStateDependencies == null || !currentStateConfig.ChildStateDependencies.Any())
        {
            return; // No dependencies configured for the parent's current state
        }

        // 4. Load all children of this parent to evaluate rules
        var allChildren = await _dbContext.Assets
            .Where(a => a.ParentId == parentAsset.Id && !a.IsDeleted)
            .ToListAsync(cancellationToken);

        // 5. Evaluate the rules in order
        foreach (var rule in currentStateConfig.ChildStateDependencies)
        {
            bool conditionMet = false;

            if (rule.ConditionType.Equals("Any", StringComparison.OrdinalIgnoreCase))
            {
                // Is there ANY child in one of the required states?
                conditionMet = allChildren.Any(c => rule.ChildStates.Contains(c.State));
            }
            else if (rule.ConditionType.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                // Are ALL children in one of the required states?
                conditionMet = allChildren.Count > 0 && allChildren.All(c => rule.ChildStates.Contains(c.State));
            }

            if (conditionMet)
            {
                // Ensure the transition is allowed by the parent's lifecycle
                var allowedTransitions = parentAsset.AssetTemplate.LifecycleStates.Transitions;
                if (allowedTransitions.TryGetValue(parentAsset.State, out var possibleTransitions) &&
                    possibleTransitions.Contains(rule.TargetState))
                {
                    // 6. Trigger the state change
                    // We dispatch a new command so it goes through all normal validations and logs
                    var command = new ChangeAssetEnvironmentStateCommand(
                        parentAsset.Id, 
                        rule.TargetState, 
                        $"Transición automática propagada por dependencia de estado de sub-activos."
                    );
                    
                    await _mediator.Send(command, cancellationToken);
                    
                    // Stop evaluating after the first rule matches
                    break; 
                }
            }
        }
    }
}
