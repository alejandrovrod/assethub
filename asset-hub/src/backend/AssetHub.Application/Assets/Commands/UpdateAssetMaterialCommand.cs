using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Commands;

public record UpdateAssetMaterialCommand(
    Guid MaterialId,
    decimal Quantity,
    string UnitOfMeasure,
    bool IsCritical,
    string? Notes
) : IRequest<Unit>;

public class UpdateAssetMaterialCommandValidator : AbstractValidator<UpdateAssetMaterialCommand>
{
    public UpdateAssetMaterialCommandValidator()
    {
        RuleFor(x => x.MaterialId).NotEmpty();
        RuleFor(x => x.Quantity).GreaterThan(0);
        RuleFor(x => x.UnitOfMeasure).NotEmpty();
    }
}

public class UpdateAssetMaterialCommandHandler : IRequestHandler<UpdateAssetMaterialCommand, Unit>
{
    private readonly ITenantDbContext _dbContext;

    public UpdateAssetMaterialCommandHandler(ITenantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Unit> Handle(UpdateAssetMaterialCommand request, CancellationToken cancellationToken)
    {
        var material = await _dbContext.AssetMaterials
            .FirstOrDefaultAsync(m => m.Id == request.MaterialId, cancellationToken);

        if (material == null)
        {
            throw new InvalidOperationException("Asset material not found."); // Return 404
        }

        material.Quantity = request.Quantity;
        material.UnitOfMeasure = request.UnitOfMeasure;
        material.IsCritical = request.IsCritical;
        material.Notes = request.Notes;

        await _dbContext.SaveChangesAsync(cancellationToken);

        return Unit.Value;
    }
}
