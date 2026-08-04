using System;
using System.Collections.Generic;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Incidents;

namespace AssetHub.Domain.Maintenance;

public class MaintenanceOrder
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public string Kind { get; set; } = string.Empty; // corrective, preventive
    public string State { get; set; } = "draft"; // draft, approved, scheduled, in_progress, done, verified, cancelled
    
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    public Guid AssetId { get; set; }
    public Asset? Asset { get; set; }
    
    public Guid? PreventivePlanId { get; set; }
    public PreventivePlan? PreventivePlan { get; set; }
    
    public Guid? IncidentId { get; set; }
    public Incident? Incident { get; set; }
    
    public Guid? AssignedEmployeeId { get; set; }
    
    public DateTime? ScheduledStart { get; set; }
    public DateTime? ScheduledEnd { get; set; }
    public DateTime? CompletedAt { get; set; }
    
    public decimal LaborCost { get; set; }
    
    public List<MaintenancePart> Parts { get; set; } = new();
    
    public bool IsDeleted { get; set; }
}
