using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AssetHub.Application.Tasks.Dtos;

public class WorkTaskDto
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string State { get; set; } = string.Empty;

    public Guid TaskTypeCatalogItemId { get; set; }
    public string? TaskTypeLabel { get; set; }

    public Guid PriorityCatalogItemId { get; set; }
    public string? PriorityLabel { get; set; }

    public DateTime? DueAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public DateTime? StartedAt { get; set; }

    /// <summary>Sólo tiene valor mientras la tarea está en <c>paused</c>.</summary>
    public DateTime? PausedAt { get; set; }

    /// <summary>Última reanudación; nulo si nunca se reanudó.</summary>
    public DateTime? ResumedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    /// <summary>Segundos acumulados en <c>paused</c> (todas las pausas, no sólo la última).</summary>
    public int TotalPausedSeconds { get; set; }

    /// <summary>
    /// Duración neta en segundos: <c>CompletedAt - StartedAt - TotalPausedSeconds</c>.
    /// Se calcula al leer en vez de persistirse para que no pueda quedar desincronizada
    /// de los timestamps que la componen. Nula mientras la tarea no esté completada.
    /// </summary>
    public int? DurationSeconds { get; set; }

    /// <summary>Motivo del último envío a <c>rework</c>.</summary>
    public string? ReworkReason { get; set; }

    public DateTime? ReworkedAt { get; set; }

    public Guid? AssetId { get; set; }
    public string? AssetName { get; set; }

    public Guid? IncidentId { get; set; }
    public string? IncidentTitle { get; set; }

    public Guid? WorkflowTemplateId { get; set; }

    public Guid? MaintenanceOrderId { get; set; }
    public string? MaintenanceOrderTitle { get; set; }
    public string? MaintenanceOrderState { get; set; }

    public Guid? PreventivePlanId { get; set; }
    public string? PreventivePlanName { get; set; }

    public Guid? TaskRecurrenceId { get; set; }
    public string? TaskRecurrenceName { get; set; }

    public Guid? AssignedEmployeeId { get; set; }
    public string? AssignedEmployeeName { get; set; }

    public Guid? AssignedTeamId { get; set; }
    public string? AssignedTeamName { get; set; }

    public string? PropertiesJson { get; set; }

    public bool IsIndependent { get; set; }

    /// <summary>
    /// Estados alcanzables desde el actual, calculados por
    /// <c>TaskStateTransitionValidator</c>. Viaja en el body para que ningún cliente
    /// (PWA offline incluida) tenga que hardcodear la máquina de estados.
    /// </summary>
    public List<string> AllowedTransitions { get; set; } = new();

    /// <summary>
    /// ETag (token base64url del <c>rowversion</c>) de la tarea en el momento de la
    /// lectura. El cliente offline lo persiste junto a la tarea y lo devuelve en
    /// <c>If-Match</c> al cambiar el estado.
    ///
    /// El nombre en el JSON se fija a <c>etag</c> a propósito: la política camelCase de
    /// System.Text.Json convierte <c>ETag</c> en <c>eTag</c>, y todos los clientes (y el
    /// contrato OpenAPI) hablan <c>etag</c>. Sin este atributo el campo viaja con otro
    /// nombre, el cliente no encuentra la versión y su <c>If-Match</c> queda vacío.
    /// </summary>
    [JsonPropertyName("etag")]
    public string? ETag { get; set; }
}
