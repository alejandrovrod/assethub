using System.Collections.Generic;

namespace AssetHub.Application.AssetArchitect;

/// <summary>
/// Input for the Asset Architect agent. The agent only receives free text plus the
/// catalog codes that actually exist for the tenant, so it cannot reference catalogs
/// that would later be rejected by <c>CreateAssetTemplateCommand</c>.
/// </summary>
public record AssetArchitectRequest(string Description, IReadOnlyCollection<string> ExistingCatalogCodes);

/// <summary>
/// Model-friendly draft. It deliberately avoids dictionaries and raw JSON strings because
/// LLM structured-output schemas cannot express open-ended maps reliably. The mapper
/// compiles this shape into the real <c>CreateAssetTemplateCommand</c> contract.
/// </summary>
public class AssetArchitectDraft
{
    public List<TemplateDraft> Templates { get; set; } = new();
}

public class TemplateDraft
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<FieldDraft> Fields { get; set; } = new();
    public string InitialState { get; set; } = string.Empty;
    public List<StateDraft> States { get; set; } = new();
    public List<ChecklistTaskDraft> MaintenanceTasks { get; set; } = new();

    /// <summary>Codes of other templates in the same draft that may be children of this one.</summary>
    public List<string> ChildTemplateCodes { get; set; } = new();
}

public class FieldDraft
{
    public string KeyName { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool Required { get; set; }
    public List<string> EnumOptions { get; set; } = new();
    public string? CatalogCode { get; set; }
}

public class StateDraft
{
    public string Name { get; set; } = string.Empty;
    public string? Color { get; set; }
    public bool IsTerminal { get; set; }
    public int? MaxHoursInState { get; set; }
    public List<string> Transitions { get; set; } = new();

    /// <summary>Actions triggered when entering state: e.g. CREATE_WORK_ORDER, NOTIFY_MANAGER.</summary>
    public string? OnEnterAction { get; set; }

    /// <summary>Key name of an employee or team field to notify when entering this state.</summary>
    public string? NotificationTargetFieldId { get; set; }

    /// <summary>Associated business module: e.g. work_orders, incidents.</summary>
    public string? AssociatedModule { get; set; }

    /// <summary>Fields that must not be empty before transitioning into this state.</summary>
    public List<string> RequiresFields { get; set; } = new();

    /// <summary>Roles allowed to transition the asset into this state.</summary>
    public List<string> AllowedRoles { get; set; } = new();

    /// <summary>Rules reacting to child asset states.</summary>
    public List<ChildStateDependencyDraft> ChildStateDependencies { get; set; } = new();
}

public class ChildStateDependencyDraft
{
    /// <summary>"Any" or "All".</summary>
    public string ConditionType { get; set; } = "Any";

    /// <summary>List of states the child asset(s) must have.</summary>
    public List<string> ChildStates { get; set; } = new();

    /// <summary>State this parent asset will transition into if the condition holds.</summary>
    public string TargetState { get; set; } = string.Empty;
}

public class ChecklistTaskDraft
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Frequency { get; set; } = string.Empty;
}

/// <summary>Field types supported by the frontend <c>schema-builder</c>.</summary>
public static class AssetArchitectFieldTypes
{
    public static readonly IReadOnlySet<string> Allowed = new HashSet<string>
    {
        "string", "number", "boolean", "date", "enum", "catalog", "employee", "team", "file", "files"
    };
}
