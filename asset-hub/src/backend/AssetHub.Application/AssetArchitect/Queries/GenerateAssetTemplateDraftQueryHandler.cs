using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AssetHub.Application.AssetArchitect.Queries;

public sealed class GenerateAssetTemplateDraftQueryHandler : IRequestHandler<GenerateAssetTemplateDraftQuery, AssetArchitectDraftResponse>
{
    private readonly IAssetArchitectAgent _agent;
    private readonly ITenantDbContext _tenantDbContext;
    private readonly ILogger<GenerateAssetTemplateDraftQueryHandler> _logger;

    public GenerateAssetTemplateDraftQueryHandler(
        IAssetArchitectAgent agent,
        ITenantDbContext tenantDbContext,
        ILogger<GenerateAssetTemplateDraftQueryHandler> logger)
    {
        _agent = agent;
        _tenantDbContext = tenantDbContext;
        _logger = logger;
    }

    public async Task<AssetArchitectDraftResponse> Handle(GenerateAssetTemplateDraftQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Description))
        {
            throw new ArgumentException("Asset requirements description cannot be empty.", nameof(request));
        }

        // 1. Fetch available tenant catalog codes so LLM is constrained to valid catalogs
        var existingCatalogs = await _tenantDbContext.Catalogs
            .AsNoTracking()
            .Select(c => c.Code)
            .ToListAsync(cancellationToken);

        var architectRequest = new AssetArchitectRequest(
            Description: request.Description.Trim(),
            ExistingCatalogCodes: existingCatalogs
        );

        // 2. Invoke AI architect agent
        var draft = await _agent.GenerateDraftAsync(architectRequest, cancellationToken);

        // 3. Domain validation
        var validationErrors = AssetArchitectDraftValidator.Validate(draft, existingCatalogs);
        if (validationErrors.Count > 0)
        {
            _logger.LogWarning("Generated draft failed validation: {Errors}", string.Join("; ", validationErrors));
            throw new InvalidOperationException($"The proposed asset template architecture is invalid: {string.Join(" | ", validationErrors)}");
        }

        // 4. Map each template draft to frontend-ready compilation
        var templateResults = new List<TemplateDraftResult>();

        foreach (var t in draft.Templates)
        {
            var command = AssetArchitectDraftMapper.ToCommand(t);

            var fieldSummaries = t.Fields
                .Select(f => new FieldSummary(
                    KeyName: f.KeyName,
                    Title: f.Title,
                    Type: f.Type,
                    Required: f.Required,
                    EnumOptions: f.EnumOptions ?? new List<string>(),
                    CatalogCode: f.CatalogCode
                ))
                .ToList();

            var stateSummaries = t.States
                .Select(s => new StateSummary(
                    Name: s.Name,
                    Color: s.Color,
                    IsTerminal: s.IsTerminal,
                    MaxHoursInState: s.MaxHoursInState,
                    Transitions: s.Transitions ?? new List<string>(),
                    OnEnterAction: s.OnEnterAction,
                    NotificationTargetFieldId: s.NotificationTargetFieldId,
                    AssociatedModule: s.AssociatedModule,
                    RequiresFields: s.RequiresFields ?? new List<string>(),
                    AllowedRoles: s.AllowedRoles ?? new List<string>(),
                    ChildStateDependencies: s.ChildStateDependencies ?? new List<ChildStateDependencyDraft>()
                ))
                .ToList();

            templateResults.Add(new TemplateDraftResult(
                Code: t.Code,
                Name: t.Name,
                Description: t.Description,
                ChildTemplateCodes: t.ChildTemplateCodes ?? new List<string>(),
                SchemaJson: command.SchemaJson,
                InitialState: t.InitialState,
                LifecycleStates: stateSummaries,
                MaintenanceChecklistJson: command.MaintenanceChecklist,
                Fields: fieldSummaries
            ));
        }

        return new AssetArchitectDraftResponse(templateResults);
    }
}
