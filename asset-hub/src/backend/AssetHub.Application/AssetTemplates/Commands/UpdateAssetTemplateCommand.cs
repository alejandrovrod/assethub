using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NJsonSchema;

namespace AssetHub.Application.AssetTemplates.Commands;

public record UpdateAssetTemplateCommand(Guid Id, string Name, string Description, string SchemaJson, List<Guid> AllowedChildTemplateIds, LifecycleConfig LifecycleStates, string MaintenanceChecklist) : IRequest<Guid>;

public class UpdateAssetTemplateCommandHandler : IRequestHandler<UpdateAssetTemplateCommand, Guid>
{
    private readonly ITenantDbContext _dbContext;
    private readonly IAssetTemplateUsageChecker _usageChecker;

    public UpdateAssetTemplateCommandHandler(ITenantDbContext dbContext, IAssetTemplateUsageChecker usageChecker)
    {
        _dbContext = dbContext;
        _usageChecker = usageChecker;
    }

    public async Task<Guid> Handle(UpdateAssetTemplateCommand request, CancellationToken cancellationToken)
    {
        var existing = await _dbContext.AssetTemplates
            .FirstOrDefaultAsync(t => t.Id == request.Id && t.IsActive, cancellationToken);

        if (existing == null) throw new InvalidOperationException("Template no encontrado.");

        try
        {
            var schema = await JsonSchema.FromJsonAsync(request.SchemaJson, cancellationToken);
        }
        catch (Exception ex)
        {
            throw new InvalidTemplateSchemaException($"SchemaJson inválido: {ex.Message}");
        }

        if (request.LifecycleStates == null || string.IsNullOrWhiteSpace(request.LifecycleStates.InitialState))
        {
            throw new InvalidOperationException("El estado inicial de LifecycleStates es obligatorio.");
        }

        var usages = await _usageChecker.GetUsageCountAsync(existing.Id);
        
        if (usages > 0)
        {
            // Clonar y versionar
            existing.IsActive = false; // Desactivar la versión anterior

            var clone = new AssetTemplate
            {
                TenantId = existing.TenantId,
                BusinessEntityTypeId = existing.BusinessEntityTypeId,
                Code = existing.Code, // Mantener mismo código
                Name = request.Name,
                Description = request.Description,
                SchemaJson = request.SchemaJson,
                AllowedChildTemplateIds = request.AllowedChildTemplateIds ?? new List<Guid>(),
                LifecycleStates = request.LifecycleStates,
                MaintenanceChecklist = request.MaintenanceChecklist ?? string.Empty,
                Version = existing.Version + 1,
                IsActive = true
            };

            _dbContext.AssetTemplates.Add(clone);
            await _dbContext.SaveChangesAsync(cancellationToken);
            return clone.Id;
        }
        else
        {
            // Pisar si no está en uso
            existing.Name = request.Name;
            existing.Description = request.Description;
            existing.SchemaJson = request.SchemaJson;
            existing.AllowedChildTemplateIds = request.AllowedChildTemplateIds ?? new List<Guid>();
            existing.LifecycleStates = request.LifecycleStates;
            existing.MaintenanceChecklist = request.MaintenanceChecklist ?? string.Empty;
            
            await _dbContext.SaveChangesAsync(cancellationToken);
            return existing.Id;
        }
    }
}
