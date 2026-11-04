using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace AssetHub.Application.Tasks.Checklists;

/// <summary>
/// Convierte el checklist legado de <c>AssetTemplate.MaintenanceChecklist</c> en un
/// JSON Schema draft-07 (el dialecto que valida Ajv8) + un UiSchema de RJSF v6.
///
/// El legado es un array plano de tareas:
/// <code>
/// { "tasks": [ { "title": "...", "description": "...", "frequency": "..." } ] }
/// </code>
/// No tiene identificadores por ítem, así que la clave es la posición
/// (<c>item_0</c>, <c>item_1</c>, ...). Eso es estable <b>dentro del snapshot</b>: el
/// esquema se copia una vez al crear la tarea y no se regenera, así que reordenar la
/// plantilla mañana no reinterpreta respuestas ya guardadas.
///
/// Todos los ítems son <c>boolean</c> ("hecho / no hecho") y todos son <c>required</c>:
/// un checklist enviado con 3 de 6 ítems no es "3 hechos", es un formulario incompleto.
/// </summary>
public static class ChecklistSchemaFactory
{
    /// <summary>Esquema generado, listo para persistir como snapshot.</summary>
    public sealed record ChecklistSchema(string SchemaJson, string UiSchemaJson);

    private const string Draft07 = "http://json-schema.org/draft-07/schema#";

    /// <summary>
    /// Devuelve <c>null</c> cuando no hay checklist utilizable: JSON vacío, sin
    /// <c>tasks</c>, con <c>tasks</c> vacío o mal formado. Un checklist ilegible no
    /// debe impedir crear la tarea; la tarea simplemente queda sin formulario (204).
    /// </summary>
    public static ChecklistSchema? FromLegacyChecklist(string? legacyJson)
    {
        var items = ReadTasks(legacyJson);
        if (items.Count == 0)
        {
            return null;
        }

        var properties = new JsonObject();
        var required = new JsonArray();
        var order = new JsonArray();
        var uiFields = new JsonObject();

        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            var key = $"item_{index}";
            var title = string.IsNullOrWhiteSpace(item.Title) ? $"Ítem {index + 1}" : item.Title!;

            var property = new JsonObject
            {
                ["type"] = "boolean",
                ["title"] = title,
            };

            if (!string.IsNullOrWhiteSpace(item.Description))
            {
                property["description"] = item.Description;
            }

            properties[key] = property;
            required.Add(key);
            order.Add(key);

            var uiField = new JsonObject
            {
                // Explícito: el widget de un boolean depende del tema de RJSF y el
                // técnico necesita un checkbox, no un select "true/false".
                ["ui:widget"] = "checkbox",
            };

            if (!string.IsNullOrWhiteSpace(item.Frequency))
            {
                uiField["ui:help"] = item.Frequency;
            }

            uiFields[key] = uiField;
        }

        var schema = new JsonObject
        {
            ["$schema"] = Draft07,
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = required,
            ["additionalProperties"] = false,
        };

        var uiSchema = new JsonObject
        {
            ["ui:order"] = order,
        };

        foreach (var (key, value) in uiFields)
        {
            uiSchema[key] = value?.DeepClone();
        }

        return new ChecklistSchema(
            schema.ToJsonString(JsonOptions),
            uiSchema.ToJsonString(JsonOptions));
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static List<LegacyChecklistItem> ReadTasks(string? legacyJson)
    {
        var items = new List<LegacyChecklistItem>();

        if (string.IsNullOrWhiteSpace(legacyJson))
        {
            return items;
        }

        try
        {
            using var document = JsonDocument.Parse(legacyJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return items;
            }

            if (!document.RootElement.TryGetProperty("tasks", out var tasks)
                || tasks.ValueKind != JsonValueKind.Array)
            {
                return items;
            }

            foreach (var task in tasks.EnumerateArray())
            {
                if (task.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                items.Add(new LegacyChecklistItem(
                    ReadString(task, "title"),
                    ReadString(task, "description"),
                    ReadString(task, "frequency")));
            }
        }
        catch (JsonException)
        {
            return new List<LegacyChecklistItem>();
        }

        return items;
    }

    private static string? ReadString(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private sealed record LegacyChecklistItem(string? Title, string? Description, string? Frequency);
}
