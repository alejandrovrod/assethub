using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NJsonSchema;

namespace AssetHub.Application.AssetTemplates.Commands;

public record CreateAssetTemplateCommand(Guid BusinessEntityTypeId, string Code, string Name, string Description, string SchemaJson, List<Guid> AllowedChildTemplateIds, LifecycleConfig LifecycleStates, string MaintenanceChecklist) : IRequest<Guid>;

public class CreateAssetTemplateCommandHandler : IRequestHandler<CreateAssetTemplateCommand, Guid>
{
    private readonly ITenantDbContext _dbContext;
    private readonly ITenantResolver _tenantResolver;

    public CreateAssetTemplateCommandHandler(ITenantDbContext dbContext, ITenantResolver tenantResolver)
    {
        _dbContext = dbContext;
        _tenantResolver = tenantResolver;
    }

    public async Task<Guid> Handle(CreateAssetTemplateCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId().Value;

        // Validar o auto-asignar BusinessEntityType
        var finalEntityTypeId = request.BusinessEntityTypeId;
        if (finalEntityTypeId == Guid.Empty)
        {
            var firstType = await _dbContext.BusinessEntityTypes
                .FirstOrDefaultAsync(e => e.TenantId == tenantId && e.IsActive, cancellationToken);
            
            if (firstType != null)
            {
                finalEntityTypeId = firstType.Id;
            }
            else
            {
                var newType = new AssetHub.Domain.EntityTypes.BusinessEntityType
                {
                    TenantId = tenantId,
                    Name = "General",
                    Code = "GEN",
                    IsActive = true
                };
                _dbContext.BusinessEntityTypes.Add(newType);
                await _dbContext.SaveChangesAsync(cancellationToken);
                finalEntityTypeId = newType.Id;
            }
        }
        else
        {
            var entityTypeExists = await _dbContext.BusinessEntityTypes
                .AnyAsync(e => e.Id == finalEntityTypeId && e.TenantId == tenantId && e.IsActive, cancellationToken);
            if (!entityTypeExists) throw new InvalidOperationException("BusinessEntityTypeId inválido.");
        }

        // Validar Code único
        var codeExists = await _dbContext.AssetTemplates
            .AnyAsync(t => t.Code == request.Code && t.TenantId == tenantId && t.IsActive, cancellationToken);
        if (codeExists) throw new InvalidOperationException($"Ya existe un template con el código {request.Code}");

        // Validar SchemaJson usando NJsonSchema
        try
        {
            var schema = await JsonSchema.FromJsonAsync(request.SchemaJson, cancellationToken);
        }
        catch (Exception ex)
        {
            throw new InvalidTemplateSchemaException($"SchemaJson inválido: {ex.Message}");
        }

        // TODO: Validar extrayendo referencias a catálogos en el schema y verificándolas

        // Validar Lifecycle
        if (request.LifecycleStates == null || string.IsNullOrWhiteSpace(request.LifecycleStates.InitialState))
        {
            throw new InvalidOperationException("El estado inicial de LifecycleStates es obligatorio.");
        }

        var template = new AssetTemplate
        {
            TenantId = tenantId,
            BusinessEntityTypeId = finalEntityTypeId,
            Code = request.Code,
            Name = request.Name,
            Description = request.Description,
            SchemaJson = request.SchemaJson,
            AllowedChildTemplateIds = request.AllowedChildTemplateIds ?? new List<Guid>(),
            LifecycleStates = request.LifecycleStates,
            MaintenanceChecklist = request.MaintenanceChecklist ?? string.Empty,
            Version = 1,
            IsActive = true
        };

        _dbContext.AssetTemplates.Add(template);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return template.Id;
    }
}
