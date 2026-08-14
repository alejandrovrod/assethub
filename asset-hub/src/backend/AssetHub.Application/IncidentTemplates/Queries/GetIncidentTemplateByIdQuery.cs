using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.IncidentTemplates;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.IncidentTemplates.Queries;

public record IncidentTemplateDetailDto(
    Guid Id,
    string Code,
    string Name,
    string Description,
    string SchemaJson,
    Domain.AssetTemplates.LifecycleConfig LifecycleStates,
    bool IsActive
);

public record GetIncidentTemplateByIdQuery(Guid Id) : IRequest<IncidentTemplateDetailDto?>;

public class GetIncidentTemplateByIdQueryHandler : IRequestHandler<GetIncidentTemplateByIdQuery, IncidentTemplateDetailDto?>
{
    private readonly ITenantDbContext _context;

    public GetIncidentTemplateByIdQueryHandler(ITenantDbContext context)
    {
        _context = context;
    }

    public async Task<IncidentTemplateDetailDto?> Handle(GetIncidentTemplateByIdQuery request, CancellationToken cancellationToken)
    {
        var template = await _context.IncidentTemplates
            .FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);

        if (template == null) return null;

        return new IncidentTemplateDetailDto(
            template.Id,
            template.Code,
            template.Name,
            template.Description,
            template.SchemaJson,
            template.LifecycleStates,
            template.IsActive
        );
    }
}
