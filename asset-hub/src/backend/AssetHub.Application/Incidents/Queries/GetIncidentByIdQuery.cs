using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;

namespace AssetHub.Application.Incidents.Queries;

public record IncidentDetailDto(
    Guid Id,
    string Title,
    string? Description,
    Guid AssetId,
    string AssetName,
    Guid TypeId,
    Guid? PriorityId,
    Guid? IncidentTemplateId,
    string PropertiesJson,
    string State,
    DateTime ReportedAt,
    DateTime? ResolvedAt,
    DateTime? ClosedAt,
    List<IncidentDetailDto.AttachmentDto> Attachments
)
{
    public record AttachmentDto(
        Guid Id,
        string FileUrl,
        string FileName,
        string ContentType,
        long SizeBytes
    );
}

public record GetIncidentByIdQuery(Guid Id) : IRequest<IncidentDetailDto?>;

public class GetIncidentByIdQueryHandler : IRequestHandler<GetIncidentByIdQuery, IncidentDetailDto?>
{
    private readonly ITenantDbContext _db;

    public GetIncidentByIdQueryHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<IncidentDetailDto?> Handle(GetIncidentByIdQuery request, CancellationToken cancellationToken)
    {
        var incident = await _db.Incidents
            .Include(i => i.Asset)
            .FirstOrDefaultAsync(i => i.Id == request.Id, cancellationToken);

        if (incident == null) return null;

        var attachments = await _db.IncidentAttachments
            .Where(a => a.IncidentId == incident.Id)
            .Select(a => new IncidentDetailDto.AttachmentDto(
                a.Id,
                a.FileUrl,
                a.FileName,
                a.ContentType,
                a.SizeBytes
            ))
            .ToListAsync(cancellationToken);

        return new IncidentDetailDto(
            incident.Id,
            incident.Title,
            incident.Description,
            incident.AssetId,
            incident.Asset?.Name ?? string.Empty,
            incident.TypeId,
            incident.PriorityId,
            incident.IncidentTemplateId,
            incident.PropertiesJson,
            incident.State,
            incident.ReportedAt,
            incident.ResolvedAt,
            incident.ClosedAt,
            attachments
        );
    }
}
