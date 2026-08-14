using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.IncidentTemplates.Commands;

public record DeleteIncidentTemplateCommand(Guid Id) : IRequest;

public class DeleteIncidentTemplateCommandHandler : IRequestHandler<DeleteIncidentTemplateCommand>
{
    private readonly ITenantDbContext _context;

    public DeleteIncidentTemplateCommandHandler(ITenantDbContext context)
    {
        _context = context;
    }

    public async Task Handle(DeleteIncidentTemplateCommand request, CancellationToken cancellationToken)
    {
        var template = await _context.IncidentTemplates.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);
        if (template != null)
        {
            template.IsActive = false; // Soft delete
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
