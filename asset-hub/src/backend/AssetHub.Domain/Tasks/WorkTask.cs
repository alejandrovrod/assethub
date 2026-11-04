using System;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Common;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;

namespace AssetHub.Domain.Tasks;

public class WorkTask : ITimestamped
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    public string State { get; set; } = WorkTaskStates.Todo;
    
    public Guid TaskTypeCatalogItemId { get; set; }
    public CatalogItem? TaskTypeCatalogItem { get; set; }
    
    public Guid PriorityCatalogItemId { get; set; }
    public CatalogItem? PriorityCatalogItem { get; set; }
    
    public DateTime? DueAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Última modificación de la fila. Es el cursor del delta sync: ver
    /// <see cref="ITimestamped"/>.
    /// </summary>
    public DateTime UpdatedAt { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? DueDate { get; set; }

    /// <summary>
    /// Momento en que la tarea entró en <see cref="WorkTaskStates.Paused"/>. Se limpia al
    /// salir de ese estado; el tiempo acumulado vive en <see cref="TotalPausedSeconds"/>.
    /// </summary>
    public DateTime? PausedAt { get; set; }

    /// <summary>Última vez que la tarea se reanudó desde <c>paused</c>.</summary>
    public DateTime? ResumedAt { get; set; }

    /// <summary>
    /// Segundos acumulados en <c>paused</c> a lo largo de toda la vida de la tarea. Se
    /// acumula en el servidor —no se deriva de un solo <see cref="PausedAt"/>— porque una
    /// tarea puede pausarse y reanudarse varias veces, y las métricas de resolución
    /// (duración neta) tienen que descontar todas las pausas.
    /// </summary>
    public int TotalPausedSeconds { get; set; }

    /// <summary>
    /// Por qué se envió la tarea a <see cref="WorkTaskStates.Rework"/>. Nulo mientras la
    /// tarea no haya vuelto nunca a rework.
    /// </summary>
    public string? ReworkReason { get; set; }

    public DateTime? ReworkedAt { get; set; }

    public Guid? ReworkedByUserId { get; set; }

    public ICollection<TaskStatusHistory> StatusHistory { get; set; } = new List<TaskStatusHistory>();
    public ICollection<TaskComment> TaskComments { get; set; } = new List<TaskComment>();

    /// <summary>
    /// Formulario de inspección, si la tarea lo tiene. Nulo es el caso normal de una
    /// tarea sin plantilla de checklist; no se crea una fila vacía.
    /// </summary>
    public TaskChecklist? Checklist { get; set; }
    
    public bool IsIndependent { get; set; }
    
    // Links (optional, but at least one must be present if not independent)
    public Guid? AssetId { get; set; }
    public Asset? Asset { get; set; }
    
    public Guid? MaintenanceOrderId { get; set; }
    public MaintenanceOrder? MaintenanceOrder { get; set; }
    
    public Guid? IncidentId { get; set; }
    public Incident? Incident { get; set; }
    
    // Assignment
    public Guid? AssignedEmployeeId { get; set; }
    public Employee? AssignedEmployee { get; set; }
    
    public Guid? AssignedTeamId { get; set; }
    public Team? AssignedTeam { get; set; }
    
    // Generator
    public Guid? TaskRecurrenceId { get; set; }
    public TaskRecurrence? TaskRecurrence { get; set; }

    public Guid? PreventivePlanId { get; set; }
    public PreventivePlan? PreventivePlan { get; set; }
    
    public string PropertiesJson { get; set; } = "{}";

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Token de concurrencia optimista (SQL Server <c>rowversion</c>). Cambia en cada
    /// UPDATE de la fila; el cliente lo recibe como <c>ETag</c> y lo devuelve en
    /// <c>If-Match</c>. Nunca se asigna desde código: lo genera el motor.
    /// </summary>
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();
}
