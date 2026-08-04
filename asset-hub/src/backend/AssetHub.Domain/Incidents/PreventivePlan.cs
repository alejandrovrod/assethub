using System;
using AssetHub.Domain.Assets;
using AssetHub.Domain.AssetTemplates;

namespace AssetHub.Domain.Incidents;

public class PreventivePlan
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    public Guid? AssetTemplateId { get; set; }
    public AssetTemplate? AssetTemplate { get; set; }
    
    public Guid? AssetId { get; set; }
    public Asset? Asset { get; set; }
    
    public string? CronExpression { get; set; }
    public int? IntervalDays { get; set; }
    public string? ConditionRuleJson { get; set; }
    
    public DateTime? NextRunAt { get; set; }
    public DateTime? LastRunAt { get; set; }
    
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; }
}
