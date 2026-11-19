using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using AssetHub.Application.AssetTemplates.Commands;
using AssetHub.Domain.AssetTemplates;

namespace AssetHub.Application.AssetArchitect;

/// <summary>
/// Compiles a validated <see cref="TemplateDraft"/> into the real <see cref="CreateAssetTemplateCommand"/>.
/// The JSON shapes mirror what the frontend <c>schema-builder</c> and
/// <c>maintenance-checklist-builder</c> serialize, so the UI can open the result unchanged.
/// </summary>
public static class AssetArchitectDraftMapper
{
    private const string DefaultStateColor = "#94a3b8";

    public static CreateAssetTemplateCommand ToCommand(TemplateDraft template)
    {
        return new CreateAssetTemplateCommand(
            BusinessEntityTypeId: Guid.Empty, // the handler auto-assigns the tenant's default entity type
            Code: template.Code,
            Name: template.Name,
            Description: template.Description ?? string.Empty,
            SchemaJson: BuildSchemaJson(template.Fields),
            AllowedChildTemplateIds: new List<Guid>(), // resolved after children are persisted (milestone 4)
            LifecycleStates: BuildLifecycle(template),
            MaintenanceChecklist: BuildChecklistJson(template.MaintenanceTasks));
    }

    public static string BuildSchemaJson(IEnumerable<FieldDraft> fields)
    {
        var properties = new JsonObject();
        var required = new JsonArray();

        foreach (var field in fields)
        {
            properties[field.KeyName] = BuildProperty(field);
            if (field.Required) required.Add(field.KeyName);
        }

        var schema = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = required,
        };

        return schema.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    private static JsonObject BuildProperty(FieldDraft field)
    {
        var prop = new JsonObject { ["title"] = field.Title };

        switch (field.Type)
        {
            case "enum":
                prop["type"] = "string";
                prop["enum"] = new JsonArray(field.EnumOptions
                    .Where(o => !string.IsNullOrWhiteSpace(o))
                    .Select(o => (JsonNode?)JsonValue.Create(o.Trim()))
                    .ToArray());
                break;
            case "catalog":
                prop["type"] = "string";
                prop["catalogCode"] = field.CatalogCode;
                break;
            case "date":
                prop["type"] = "string";
                prop["format"] = "date";
                break;
            case "employee":
            case "team":
                prop["type"] = "string";
                prop["format"] = field.Type;
                break;
            case "file":
                prop["type"] = "string";
                prop["format"] = "data-url";
                break;
            case "files":
                prop["type"] = "array";
                prop["items"] = new JsonObject { ["type"] = "string", ["format"] = "data-url" };
                break;
            default: // string | number | boolean
                prop["type"] = field.Type;
                break;
        }

        return prop;
    }

    public static LifecycleConfig BuildLifecycle(TemplateDraft template)
    {
        var config = new LifecycleConfig { InitialState = template.InitialState };

        foreach (var state in template.States)
        {
            config.Transitions[state.Name] = state.Transitions.Distinct(StringComparer.Ordinal).ToList();
            var stateConfig = new StateConfig
            {
                Color = string.IsNullOrWhiteSpace(state.Color) ? DefaultStateColor : state.Color!,
                IsTerminal = state.IsTerminal,
                MaxHoursInState = state.MaxHoursInState,
                OnEnterAction = state.OnEnterAction ?? string.Empty,
                NotificationTargetFieldId = state.NotificationTargetFieldId ?? string.Empty,
                AssociatedModule = state.AssociatedModule ?? string.Empty,
                RequiresFields = state.RequiresFields ?? new(),
                AllowedRoles = state.AllowedRoles ?? new(),
                ChildStateDependencies = state.ChildStateDependencies?.Select(d => new ChildStateDependency
                {
                    ConditionType = string.IsNullOrWhiteSpace(d.ConditionType) ? "Any" : d.ConditionType,
                    ChildStates = d.ChildStates ?? new(),
                    TargetState = d.TargetState ?? string.Empty,
                }).ToList() ?? new(),
            };

            config.States[state.Name] = stateConfig;
        }

        return config;
    }

    public static string BuildChecklistJson(IEnumerable<ChecklistTaskDraft> tasks)
    {
        var array = new JsonArray();
        foreach (var task in tasks)
        {
            array.Add(new JsonObject
            {
                ["id"] = Guid.NewGuid().ToString("N"),
                ["title"] = task.Title,
                ["description"] = task.Description ?? string.Empty,
                ["frequency"] = task.Frequency ?? string.Empty,
            });
        }

        return new JsonObject { ["tasks"] = array }.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }
}
