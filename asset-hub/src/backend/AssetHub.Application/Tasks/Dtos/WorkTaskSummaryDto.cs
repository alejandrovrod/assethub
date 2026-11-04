using System;
using System.Text.Json.Serialization;

namespace AssetHub.Application.Tasks.Dtos;

public class WorkTaskSummaryDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public DateTime? DueAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public Guid? AssetId { get; set; }
    public string? AssetName { get; set; }

    public Guid? IncidentId { get; set; }
    public string? IncidentTitle { get; set; }

    public Guid? WorkflowTemplateId { get; set; }

    public Guid? PreventivePlanId { get; set; }
    public string? PreventivePlanName { get; set; }

    public Guid? MaintenanceOrderId { get; set; }
    public string? MaintenanceOrderTitle { get; set; }
    public string? MaintenanceOrderState { get; set; }

    public Guid? AssignedEmployeeId { get; set; }
    public string? AssignedEmployeeName { get; set; }

    public Guid? AssignedTeamId { get; set; }
    public string? AssignedTeamName { get; set; }

    public string? PriorityLabel { get; set; }

    public string? Description { get; set; }
    public string? PropertiesJson { get; set; }

    /// <summary>Ver <see cref="WorkTaskDto.ETag"/>.</summary>
    [JsonPropertyName("etag")]
    public string? ETag { get; set; }

    /// <summary>
    /// Bytes crudos del rowversion, sólo para calcular <see cref="ETag"/> después de
    /// materializar la proyección (EF no puede traducir el encoder a SQL).
    /// </summary>
    [JsonIgnore]
    public byte[]? RowVersion { get; set; }

    /// <summary>
    /// Si la tarea tiene formulario de inspección. El cliente de campo lo usa para
    /// decidir si vale la pena pedir <c>GET /work-tasks/{id}/checklist</c>; sin este
    /// flag tendría que pedirlo para todas y comer 204 en la mayoría.
    /// </summary>
    public bool HasChecklist { get; set; }

    /// <summary>
    /// ETag del checklist, <b>no</b> de la tarea: son dos filas con dos rowversion
    /// distintos y el <c>If-Match</c> de cada endpoint espera el suyo. Nulo si la
    /// tarea no tiene checklist.
    /// </summary>
    [JsonPropertyName("checklistEtag")]
    public string? ChecklistETag { get; set; }
}
