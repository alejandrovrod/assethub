using System;

namespace AssetHub.Domain.Tasks;

/// <summary>
/// Checklist de una tarea.
///
/// Por qué es una tabla y no columnas en <see cref="WorkTask"/>: SQL Server admite
/// <b>una sola</b> columna <c>rowversion</c> por tabla. Con el checklist en su propia
/// fila, cada uno tiene su token y una transición de estado de la tarea no invalida el
/// <c>If-Match</c> del checklist (y viceversa). Ese es el motivo funcional, no estético:
/// el técnico puede enviar el formulario y después mover la tarea sin recibir un 412
/// por un cambio que no toca su formulario.
///
/// El checklist guarda un <b>snapshot</b> del esquema: se copia de la plantilla del
/// activo al crear la tarea. Editar la plantilla después no reescribe el formulario de
/// tareas ya creadas, porque el técnico ya está completando ese formulario y el
/// histórico debe seguir siendo interpretable con el esquema con el que se respondió.
/// </summary>
public class TaskChecklist
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    public Guid WorkTaskId { get; set; }
    public WorkTask? WorkTask { get; set; }

    /// <summary>
    /// JSON Schema draft-07 del formulario (mismo dialecto que valida Ajv8 en el
    /// cliente). Se genera con <c>ChecklistSchemaFactory</c> a partir del
    /// <c>MaintenanceChecklist</c> legado de la plantilla.
    /// </summary>
    public string SchemaJson { get; set; } = "{}";

    /// <summary>UiSchema de RJSF v6 (<c>ui:order</c>, <c>ui:widget</c>, <c>ui:help</c>).</summary>
    public string UiSchemaJson { get; set; } = "{}";

    /// <summary>
    /// Respuesta del técnico, serializada. <c>"{}"</c> mientras no haya envío: el
    /// borrador vive sólo en el cliente (IndexedDB), nunca se persiste acá.
    /// </summary>
    public string ResponseJson { get; set; } = "{}";

    /// <summary>
    /// <see cref="TaskChecklistStates.Pending"/> hasta el primer envío; después
    /// <see cref="TaskChecklistStates.Submitted"/>. Permite distinguir "nunca enviado"
    /// de "enviado y quizá incompleto" sin inferirlo de <see cref="Version"/>.
    /// </summary>
    public string State { get; set; } = TaskChecklistStates.Pending;

    /// <summary>
    /// Versión visible para el usuario, empieza en 1 con el snapshot y sube en cada
    /// envío. No reemplaza al <see cref="RowVersion"/>: ese es opaco y cambia con
    /// cualquier escritura; este sirve para mostrar "v3" y para que el cliente offline
    /// razone sobre el orden de sus propios envíos.
    /// </summary>
    public int Version { get; set; } = 1;

    public DateTime? SubmittedAt { get; set; }

    /// <summary>Nulo mientras el checklist esté pendiente (o si lo envió un proceso).</summary>
    public Guid? SubmittedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Token de concurrencia optimista (SQL Server <c>rowversion</c>). Ver
    /// <see cref="WorkTask.RowVersion"/>.
    /// </summary>
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();
}
