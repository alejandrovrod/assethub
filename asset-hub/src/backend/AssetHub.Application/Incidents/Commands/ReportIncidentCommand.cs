using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Incidents;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.IO;
using System.Text.Json;

namespace AssetHub.Application.Incidents.Commands;

public class ReportIncidentCommand : IRequest<Guid>
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid AssetId { get; set; }
    public Guid TypeId { get; set; }
    public Guid? PriorityId { get; set; }
    
    public string? GeoJson { get; set; }
    
    public List<AttachmentDto> Attachments { get; set; } = new();

    public class AttachmentDto
    {
        public string FileUrl { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public long SizeBytes { get; set; }
    }
}

public class ReportIncidentCommandHandler : IRequestHandler<ReportIncidentCommand, Guid>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public ReportIncidentCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<Guid> Handle(ReportIncidentCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();
        
        var assetExists = await _db.Assets.AnyAsync(a => a.Id == request.AssetId, cancellationToken);
        if (!assetExists)
            throw new ArgumentException("Asset not found");
            
        var typeExists = await _db.CatalogItems.AnyAsync(c => c.Id == request.TypeId, cancellationToken);
        if (!typeExists)
            throw new ArgumentException("Type catalog item not found");
            
        if (request.PriorityId.HasValue)
        {
            var priorityExists = await _db.CatalogItems.AnyAsync(c => c.Id == request.PriorityId.Value, cancellationToken);
            if (!priorityExists)
                throw new ArgumentException("Priority catalog item not found");
        }
        
        NetTopologySuite.Geometries.Geometry? geo = null;
        string? geoType = null;
        if (!string.IsNullOrWhiteSpace(request.GeoJson))
        {
            var reader = new GeoJsonReader();
            geo = reader.Read<NetTopologySuite.Geometries.Geometry>(request.GeoJson);
            if (geo != null)
            {
                geo.SRID = 4326;
                geoType = geo.GeometryType;
            }
        }

        var incident = new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            Title = request.Title,
            Description = request.Description,
            AssetId = request.AssetId,
            TypeId = request.TypeId,
            PriorityId = request.PriorityId,
            State = "reported",
            Geo = geo,
            GeoType = geoType
        };

        _db.Incidents.Add(incident);

        foreach (var att in request.Attachments)
        {
            _db.IncidentAttachments.Add(new IncidentAttachment
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId.Value,
                IncidentId = incident.Id,
                FileUrl = att.FileUrl,
                FileName = att.FileName,
                ContentType = att.ContentType,
                SizeBytes = att.SizeBytes
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        return incident.Id;
    }
}
