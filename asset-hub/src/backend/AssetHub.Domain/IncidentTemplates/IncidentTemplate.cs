using System;
using System.Collections.Generic;

namespace AssetHub.Domain.IncidentTemplates;

public class IncidentTemplate
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    
    public string SchemaJson { get; set; } = string.Empty;
    
    public AssetTemplates.LifecycleConfig LifecycleStates { get; set; } = new();
    
    public int Version { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}
