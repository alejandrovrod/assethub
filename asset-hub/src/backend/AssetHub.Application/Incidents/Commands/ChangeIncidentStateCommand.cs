using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Incidents.Commands;

public class ChangeIncidentStateCommand : IRequest<Unit>
{
    public Guid IncidentId { get; set; }
    public string TargetState { get; set; } = string.Empty;
}

public class ChangeIncidentStateCommandHandler : IRequestHandler<ChangeIncidentStateCommand, Unit>
{
    private readonly ITenantDbContext _db;

    public ChangeIncidentStateCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<Unit> Handle(ChangeIncidentStateCommand request, CancellationToken cancellationToken)
    {
        var incident = await _db.Incidents.FirstOrDefaultAsync(i => i.Id == request.IncidentId, cancellationToken);
        if (incident == null)
            throw new ArgumentException("Incident not found");

        // Regla RN-11.2: reported->triaged->assigned->in_progress->resolved->closed. cancelled from anywhere.
        if (request.TargetState == "cancelled")
        {
            incident.State = "cancelled";
            incident.ClosedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return Unit.Value;
        }

        bool isValid = false;
        switch (incident.State)
        {
            case "reported":
                if (request.TargetState == "triaged") isValid = true;
                break;
            case "triaged":
                if (request.TargetState == "assigned") isValid = true;
                break;
            case "assigned":
                if (request.TargetState == "in_progress") isValid = true;
                break;
            case "in_progress":
                if (request.TargetState == "resolved") isValid = true;
                break;
            case "resolved":
                if (request.TargetState == "closed") isValid = true;
                break;
        }

        if (!isValid)
            throw new InvalidOperationException($"Invalid transition from {incident.State} to {request.TargetState}");

        incident.State = request.TargetState;

        if (request.TargetState == "resolved")
            incident.ResolvedAt = DateTime.UtcNow;
            
        if (request.TargetState == "closed")
            incident.ClosedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        
        return Unit.Value;
    }
}
