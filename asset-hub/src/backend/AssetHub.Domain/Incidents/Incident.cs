using System;
using NetTopologySuite.Geometries;
using AssetHub.Domain.Assets;

namespace AssetHub.Domain.Incidents;

public class Incident
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    public Guid AssetId { get; set; }
    public Asset? Asset { get; set; }
    public Guid TypeId { get; set; }
    public Guid? PriorityId { get; set; }
    
    public Guid? IncidentTemplateId { get; set; }
    public IncidentTemplates.IncidentTemplate? IncidentTemplate { get; set; }

    public string PropertiesJson { get; set; } = "{}";

    public string State { get; set; } = "reported"; // reported, triaged, assigned, in_progress, resolved, closed, cancelled
    
    public Geometry? Geo { get; set; }
    public string? GeoType { get; set; }
    
    public DateTime ReportedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    
    public bool IsDeleted { get; set; }
}
