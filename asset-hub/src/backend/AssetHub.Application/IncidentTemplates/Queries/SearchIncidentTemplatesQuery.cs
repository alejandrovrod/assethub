using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.IncidentTemplates.Queries;

public record IncidentTemplateSummaryDto(
    Guid Id,
    string Code,
    string Name,
    string Description,
    bool IsActive
);

public record SearchIncidentTemplatesQuery(string? SearchTerm, bool IncludeInactive = false) : IRequest<List<IncidentTemplateSummaryDto>>;

public class SearchIncidentTemplatesQueryHandler : IRequestHandler<SearchIncidentTemplatesQuery, List<IncidentTemplateSummaryDto>>
{
    private readonly ITenantDbContext _context;

    public SearchIncidentTemplatesQueryHandler(ITenantDbContext context)
    {
        _context = context;
    }

    public async Task<List<IncidentTemplateSummaryDto>> Handle(SearchIncidentTemplatesQuery request, CancellationToken cancellationToken)
    {
        var query = _context.IncidentTemplates.AsQueryable();

        if (!request.IncludeInactive)
            query = query.Where(t => t.IsActive);

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.ToLower();
            query = query.Where(t => t.Name.ToLower().Contains(term) || t.Code.ToLower().Contains(term));
        }

        return await query
            .OrderBy(t => t.Name)
            .Select(t => new IncidentTemplateSummaryDto(
                t.Id,
                t.Code,
                t.Name,
                t.Description,
                t.IsActive
            ))
            .ToListAsync(cancellationToken);
    }
}
