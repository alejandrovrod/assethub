using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Commands;

public record ChangeAssetEnvironmentStateCommand(Guid AssetId, string ToState, string? Notes) : IRequest<bool>;

public class ChangeAssetEnvironmentStateCommandHandler : IRequestHandler<ChangeAssetEnvironmentStateCommand, bool>
{
    private readonly ITenantDbContext _dbContext;

    public ChangeAssetEnvironmentStateCommandHandler(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
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
        }

        asset.State = request.ToState;

        _dbContext.AssetLifecycleEvents.Add(new AssetLifecycleEvent
        {
            AssetId = asset.Id,
            EventType = "cambio_estado",
            FromState = fromState,
            ToState = request.ToState,
            Notes = request.Notes,
            At = DateTime.UtcNow,
            UserId = Guid.Empty // Debe venir de Auth
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
