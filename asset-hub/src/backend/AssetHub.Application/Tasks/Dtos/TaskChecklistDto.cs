using System;
using System.Text.Json.Serialization;

namespace AssetHub.Application.Tasks.Dtos;

/// <summary>
/// Checklist de una tarea tal como lo consume el cliente de campo.
///
/// <c>schemaJson</c> y <c>uiSchemaJson</c> son strings, no objetos embebidos: el
/// cliente los persiste en IndexedDB y los entrega tal cual a Ajv y a RJSF. Si el
/// servidor los parseara y re-serializara, cualquier cambio de orden o de formato
/// haría que el snapshot guardado no coincida con el que validó el técnico.
/// </summary>
public class TaskChecklistDto
{
    public Guid TaskId { get; set; }

    public string SchemaJson { get; set; } = "{}";

    public string UiSchemaJson { get; set; } = "{}";

    public string ResponseJson { get; set; } = "{}";

    public string State { get; set; } = string.Empty;

    public DateTime? SubmittedAt { get; set; }

    public int Version { get; set; }

    /// <summary>Token base64url del <c>rowversion</c> del checklist, sin comillas.</summary>
    [JsonPropertyName("etag")]
    public string? ETag { get; set; }
}
