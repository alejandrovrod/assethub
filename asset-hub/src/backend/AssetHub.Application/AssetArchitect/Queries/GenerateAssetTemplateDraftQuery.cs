using MediatR;

namespace AssetHub.Application.AssetArchitect.Queries;

public sealed record GenerateAssetTemplateDraftQuery(string Description) : IRequest<AssetArchitectDraftResponse>;

public sealed record AssetArchitectDraftResponse(
    IReadOnlyList<TemplateDraftResult> Templates
);

public sealed record TemplateDraftResult(
    string Code,
    string Name,
    string Description,
    IReadOnlyList<string> ChildTemplateCodes,
    string SchemaJson,
    string InitialState,
    IReadOnlyList<StateSummary> LifecycleStates,
    string MaintenanceChecklistJson,
    IReadOnlyList<FieldSummary> Fields
);

public sealed record FieldSummary(
    string KeyName,
    string Title,
    string Type,
    bool Required,
    IReadOnlyList<string> EnumOptions,
    string? CatalogCode
);

public sealed record StateSummary(
    string Name,
    string? Color,
    bool IsTerminal,
    int? MaxHoursInState,
    IReadOnlyList<string> Transitions,
    string? OnEnterAction = null,
    string? NotificationTargetFieldId = null,
    string? AssociatedModule = null,
    IReadOnlyList<string>? RequiresFields = null,
    IReadOnlyList<string>? AllowedRoles = null,
    IReadOnlyList<ChildStateDependencyDraft>? ChildStateDependencies = null
);
