using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.IncidentTemplates;
using MediatR;

namespace AssetHub.Application.IncidentTemplates.Commands;

public record CreateIncidentTemplateCommand(
    string Code,
    string Name,
    string Description,
    string SchemaJson,
    Domain.AssetTemplates.LifecycleConfig LifecycleStates
) : IRequest<Guid>;

public class CreateIncidentTemplateCommandHandler : IRequestHandler<CreateIncidentTemplateCommand, Guid>
{
    private readonly ITenantDbContext _context;
    private readonly ITenantResolver _tenantResolver;

    public CreateIncidentTemplateCommandHandler(ITenantDbContext context, ITenantResolver tenantResolver)
    {
        _context = context;
        _tenantResolver = tenantResolver;
    }

    public async Task<Guid> Handle(CreateIncidentTemplateCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId() ?? throw new InvalidOperationException("Tenant is required");

        var template = new IncidentTemplate
        {
            TenantId = tenantId,
            Code = request.Code,
            Name = request.Name,
            Description = request.Description,
            SchemaJson = string.IsNullOrWhiteSpace(request.SchemaJson) ? "{}" : request.SchemaJson,
            LifecycleStates = request.LifecycleStates ?? new()
        };

        _context.IncidentTemplates.Add(template);
        await _context.SaveChangesAsync(cancellationToken);

        return template.Id;
    }
}
