using System;
using System.Collections.Generic;
using NetTopologySuite.Geometries;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Common;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;

namespace AssetHub.Domain.Incidents;

public class Incident : ITimestamped
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    public Guid AssetId { get; set; }
    public Asset? Asset { get; set; }
    public Guid TypeId { get; set; }
    public Guid? PriorityId { get; set; }
    
    public Guid? WorkflowTemplateId { get; set; }
    public WorkflowTemplates.WorkflowTemplate? WorkflowTemplate { get; set; }

    public string PropertiesJson { get; set; } = "{}";

    public string State { get; set; } = IncidentStates.Reported;
    
    public ICollection<MaintenanceOrder> MaintenanceOrders { get; set; } = new List<MaintenanceOrder>();
    public ICollection<WorkTask> WorkTasks { get; set; } = new List<WorkTask>();

    public Geometry? Geo { get; set; }
    public string? GeoType { get; set; }
    
    public DateTime ReportedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ClosedAt { get; set; }

    /// <summary>
    /// Alta de la fila. No se reutiliza <see cref="ReportedAt"/>: ese campo es el momento
    /// del reporte según el usuario y puede venir del pasado (una incidencia cargada a
    /// mano), mientras que éste es cuándo entró al sistema.
    /// </summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Última modificación de la fila. Cursor del delta sync.</summary>
    public DateTime UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    /// <summary>
    /// Momento del borrado lógico. Es lo que el cliente offline necesita para distinguir
    /// "ya no me interesa" de "nunca existió": sin esta marca el dispositivo conserva la
    /// incidencia en su caché para siempre.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Token de concurrencia optimista (SQL Server <c>rowversion</c>). Ver
    /// <see cref="AssetHub.Domain.Tasks.WorkTask.RowVersion"/>.
    /// </summary>
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();
}
