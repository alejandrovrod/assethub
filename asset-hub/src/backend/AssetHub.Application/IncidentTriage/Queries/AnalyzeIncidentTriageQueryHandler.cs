using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.IncidentTriage.Queries;

public sealed class AnalyzeIncidentTriageQueryHandler
    : IRequestHandler<AnalyzeIncidentTriageQuery, IncidentTriageProposalResponse>
{
    private const int MaxCandidateParts = 40;
    private const int MaxHistoryItems = 5;

    private readonly ITenantDbContext _db;
    private readonly IIncidentTriageAgent _agent;
    private readonly IIncidentMediaLoader _mediaLoader;

    public AnalyzeIncidentTriageQueryHandler(
        ITenantDbContext db,
        IIncidentTriageAgent agent,
        IIncidentMediaLoader mediaLoader)
    {
        _db = db;
        _agent = agent;
        _mediaLoader = mediaLoader;
    }

    public async Task<IncidentTriageProposalResponse> Handle(
        AnalyzeIncidentTriageQuery request,
        CancellationToken cancellationToken)
    {
        var incident = await _db.Incidents
            .AsNoTracking()
            .Include(i => i.WorkflowTemplate)
            .FirstOrDefaultAsync(i => i.Id == request.IncidentId, cancellationToken);

        if (incident is null)
            throw new ArgumentException($"Incident {request.IncidentId} not found.", nameof(request));

        if (IncidentTriageStateHelper.IsTerminalState(incident, incident.State))
            throw new InvalidOperationException("Cannot triage a closed or cancelled incident.");

        var asset = await _db.Assets
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == incident.AssetId, cancellationToken);

        var assetTemplate = asset is not null
            ? await _db.AssetTemplates
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == asset.AssetTemplateId, cancellationToken)
            : null;

        var preferredLang = ResolvePreferredLanguage();

        var attachments = await _db.IncidentAttachments
            .AsNoTracking()
            .Where(a => a.IncidentId == incident.Id)
            .Select(a => new { a.FileUrl, a.ContentType, a.FileName })
            .ToListAsync(cancellationToken);

        var images = await _mediaLoader.LoadImagesAsync(
            attachments.Select(a => (a.FileUrl, (string?)a.ContentType, a.FileName)),
            incident.PropertiesJson,
            cancellationToken: cancellationToken);

        var latestHealth = await _db.AssetHealthPredictions
            .AsNoTracking()
            .Where(p => p.AssetId == incident.AssetId)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new { p.RiskLevel, p.RiskProbability })
            .FirstOrDefaultAsync(cancellationToken);

        var recentIncidents = await _db.Incidents
            .AsNoTracking()
            .Where(i => i.AssetId == incident.AssetId && i.Id != incident.Id)
            .OrderByDescending(i => i.ReportedAt)
            .Take(MaxHistoryItems)
            .Select(i => new HistoricalIncidentSnapshot(
                i.Id,
                i.Title,
                i.Description,
                i.State,
                i.ReportedAt,
                i.ResolvedAt))
            .ToListAsync(cancellationToken);

        var recentOrdersRaw = await _db.MaintenanceOrders
            .AsNoTracking()
            .Include(o => o.Parts)
            .Where(o => o.AssetId == incident.AssetId && o.Kind == MaintenanceOrderKinds.Corrective)
            .OrderByDescending(o => o.CreatedAt)
            .Take(MaxHistoryItems)
            .ToListAsync(cancellationToken);

        var hasExistingCorrectiveOrder = await _db.MaintenanceOrders
            .AsNoTracking()
            .AnyAsync(o => o.IncidentId == incident.Id && o.Kind == MaintenanceOrderKinds.Corrective, cancellationToken);

        var priorities = await LoadPrioritiesAsync(preferredLang, cancellationToken);
        var technicians = await LoadTechniciansAsync(preferredLang, cancellationToken);
        var reachableStates = IncidentTriageStateHelper.GetReachableNonTerminalStates(incident);
        var (candidateParts, catalogLabelsById) = await LoadCandidatePartsAndLabelsAsync(
            incident.AssetId,
            recentOrdersRaw,
            preferredLang,
            cancellationToken);

        var recentOrders = recentOrdersRaw.Select(o => new HistoricalOrderSnapshot(
            o.Id,
            o.Title,
            o.State,
            o.CreatedAt,
            o.CompletedAt,
            o.Parts
                .Select(p => catalogLabelsById.TryGetValue(p.CatalogItemId, out var lbl) ? lbl : p.CatalogItemId.ToString())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList()
        )).ToList();

        var triageRequest = new IncidentTriageRequest(
            Incident: new IncidentSnapshot(
                Id: incident.Id,
                Title: incident.Title,
                Description: incident.Description,
                State: incident.State,
                ReportedAt: incident.ReportedAt,
                SanitizedPropertiesJson: IncidentTriageStateHelper.SanitizePropertiesJsonForPrompt(incident.PropertiesJson),
                AdditionalSupervisorNotes: string.IsNullOrWhiteSpace(request.AdditionalNotes) ? null : request.AdditionalNotes.Trim()),
            Asset: new AssetSnapshot(
                Id: incident.AssetId,
                Code: asset?.Code ?? string.Empty,
                Name: asset?.Name ?? string.Empty,
                State: asset?.State ?? string.Empty,
                ConditionIndex: asset?.ConditionIndex,
                TemplateName: assetTemplate?.Name ?? string.Empty,
                MaintenanceChecklist: assetTemplate?.MaintenanceChecklist ?? string.Empty,
                SanitizedPropertiesJson: IncidentTriageStateHelper.SanitizePropertiesJsonForPrompt(asset?.PropertiesJson),
                HealthRiskLevel: latestHealth?.RiskLevel,
                HealthRiskProbability: latestHealth?.RiskProbability),
            RecentIncidents: recentIncidents,
            RecentCorrectiveOrders: recentOrders,
            Priorities: priorities,
            Technicians: technicians,
            ReachableStates: reachableStates,
            CandidateParts: candidateParts,
            Images: images,
            PreferredLanguage: preferredLang);

        var draft = await _agent.AnalyzeAsync(triageRequest, cancellationToken);
        var validated = IncidentTriageProposalValidator.ValidateAndGround(draft, triageRequest);

        return new IncidentTriageProposalResponse(
            IncidentId: incident.Id,
            CurrentState: incident.State,
            ImagesAnalyzedCount: images.Count,
            Summary: validated.Summary,
            RecommendedSeverity: validated.RecommendedSeverity,
            SeverityRationale: validated.SeverityRationale,
            ConfidenceScore: validated.ConfidenceScore,
            VisualFindings: validated.VisualFindings,
            SuggestedPriorityId: validated.SuggestedPriorityId,
            SuggestedTechnicianId: validated.SuggestedTechnicianId,
            TechnicianRationale: validated.TechnicianRationale,
            SuggestedTargetState: validated.SuggestedTargetState,
            RecommendWorkOrder: validated.RecommendWorkOrder,
            ProbableRootCauses: validated.ProbableRootCauses,
            DiagnosticSteps: validated.DiagnosticSteps,
            SafetyPrecautions: validated.SafetyPrecautions,
            SuggestedParts: validated.SuggestedParts,
            ValidationWarnings: validated.ValidationWarnings,
            AvailablePriorities: priorities,
            AvailableTechnicians: technicians,
            ReachableStates: reachableStates,
            AvailableParts: candidateParts,
            RecentAssetIncidentsCount: recentIncidents.Count,
            HasExistingCorrectiveOrder: hasExistingCorrectiveOrder);
    }

    private async Task<IReadOnlyList<TriagePriorityOption>> LoadPrioritiesAsync(
        string preferredLang,
        CancellationToken cancellationToken)
    {
        var items = await _db.CatalogItems
            .AsNoTracking()
            .Include(ci => ci.Translations)
            .Include(ci => ci.Catalog)
            .Where(ci => ci.Catalog != null && ci.Catalog.Code.ToLower() == "priority")
            .OrderBy(ci => ci.Order)
            .ToListAsync(cancellationToken);

        return items
            .Select(ci => new TriagePriorityOption(
                ci.Id,
                ci.Code,
                ResolveLabel(ci, preferredLang)))
            .ToList();
    }

    private async Task<IReadOnlyList<TriageTechnicianOption>> LoadTechniciansAsync(
        string preferredLang,
        CancellationToken cancellationToken)
    {
        var employees = await _db.Employees
            .AsNoTracking()
            .Include(e => e.RoleCatalogItem)
                .ThenInclude(r => r!.Translations)
            .Where(e => e.IsActive && !e.IsDeleted)
            .OrderBy(e => e.FirstName)
            .ThenBy(e => e.LastName)
            .ToListAsync(cancellationToken);

        if (employees.Count == 0)
            return Array.Empty<TriageTechnicianOption>();

        var employeeIds = employees.Select(e => e.Id).ToList();
        var parsedSkillIdsByEmp = employees.ToDictionary(
            e => e.Id,
            e => ParseGuidArray(e.SkillsJson));

        var allSkillIds = parsedSkillIdsByEmp.Values
            .SelectMany(x => x)
            .Distinct()
            .ToList();

        var skillLabels = allSkillIds.Count == 0
            ? new Dictionary<Guid, string>()
            : (await _db.CatalogItems
                    .AsNoTracking()
                    .Include(ci => ci.Translations)
                    .Where(ci => allSkillIds.Contains(ci.Id))
                    .ToListAsync(cancellationToken))
                .ToDictionary(ci => ci.Id, ci => ResolveLabel(ci, preferredLang));

        var teamMemberships = await _db.TeamMembers
            .AsNoTracking()
            .Include(tm => tm.Team)
            .Where(tm => employeeIds.Contains(tm.EmployeeId) && tm.Team != null && !tm.Team.IsDeleted)
            .Select(tm => new { tm.EmployeeId, TeamName = tm.Team!.Name })
            .ToListAsync(cancellationToken);

        var teamsByEmp = teamMemberships
            .GroupBy(x => x.EmployeeId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<string>)g.Select(x => x.TeamName).Distinct(StringComparer.OrdinalIgnoreCase).ToList());

        var todayDow = (int)DateTime.UtcNow.DayOfWeek;
        var availabilities = await _db.EmployeeAvailabilities
            .AsNoTracking()
            .Where(ea => employeeIds.Contains(ea.EmployeeId) && ea.DayOfWeek == todayDow)
            .ToListAsync(cancellationToken);

        var availByEmp = availabilities
            .GroupBy(a => a.EmployeeId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var activeOrdersByEmp = await _db.MaintenanceOrders
            .AsNoTracking()
            .Where(o => o.AssignedEmployeeId.HasValue && MaintenanceOrderStates.ActiveStates.Contains(o.State))
            .GroupBy(o => o.AssignedEmployeeId!.Value)
            .Select(g => new { EmployeeId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.EmployeeId, x => x.Count, cancellationToken);

        var activeTasksByEmp = await _db.WorkTasks
            .AsNoTracking()
            .Where(t => t.AssignedEmployeeId.HasValue && !WorkTaskStates.TerminalStates.Contains(t.State))
            .GroupBy(t => t.AssignedEmployeeId!.Value)
            .Select(g => new { EmployeeId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.EmployeeId, x => x.Count, cancellationToken);

        return employees.Select(e =>
        {
            var skills = parsedSkillIdsByEmp[e.Id]
                .Where(skillLabels.ContainsKey)
                .Select(id => skillLabels[id])
                .ToList();

            var isAvailableToday = !availByEmp.TryGetValue(e.Id, out var empAvail) || empAvail.Count == 0
                ? true
                : empAvail.Any(a => a.IsAvailable);

            return new TriageTechnicianOption(
                Id: e.Id,
                FullName: $"{e.FirstName} {e.LastName}".Trim(),
                RoleLabel: ResolveLabel(e.RoleCatalogItem, preferredLang),
                Skills: skills,
                Teams: teamsByEmp.TryGetValue(e.Id, out var empTeams) ? empTeams : Array.Empty<string>(),
                IsAvailableToday: isAvailableToday,
                ActiveOrdersCount: activeOrdersByEmp.GetValueOrDefault(e.Id, 0),
                ActiveTasksCount: activeTasksByEmp.GetValueOrDefault(e.Id, 0));
        }).ToList();
    }

    private async Task<(IReadOnlyList<TriageCandidatePartOption> Parts, Dictionary<Guid, string> Labels)> LoadCandidatePartsAndLabelsAsync(
        Guid assetId,
        IReadOnlyList<MaintenanceOrder> recentOrders,
        string preferredLang,
        CancellationToken cancellationToken)
    {
        var bomItems = await _db.AssetMaterials
            .AsNoTracking()
            .Include(m => m.CatalogItem)
                .ThenInclude(ci => ci!.Translations)
            .Where(m => m.AssetId == assetId && !m.IsDeleted)
            .ToListAsync(cancellationToken);

        var historicalPartIds = recentOrders
            .SelectMany(o => o.Parts)
            .Select(p => p.CatalogItemId)
            .Distinct()
            .ToList();

        var stockBalances = await _db.StockBalances
            .AsNoTracking()
            .Include(sb => sb.Warehouse)
            .Include(sb => sb.CatalogItem)
                .ThenInclude(ci => ci!.Translations)
            .Where(sb => sb.Warehouse != null && sb.Warehouse.IsActive && !sb.Warehouse.IsDeleted)
            .ToListAsync(cancellationToken);

        var catalogById = new Dictionary<Guid, CatalogItem>();
        foreach (var bom in bomItems)
        {
            if (bom.CatalogItem is { IsDeleted: false })
                catalogById[bom.CatalogItemId] = bom.CatalogItem;
        }
        foreach (var sb in stockBalances)
        {
            if (sb.CatalogItem is { IsDeleted: false })
                catalogById[sb.CatalogItemId] = sb.CatalogItem;
        }

        var missingHistIds = historicalPartIds.Where(id => !catalogById.ContainsKey(id)).ToList();
        if (missingHistIds.Count > 0)
        {
            var histItems = await _db.CatalogItems
                .AsNoTracking()
                .Include(ci => ci.Translations)
                .Where(ci => missingHistIds.Contains(ci.Id))
                .ToListAsync(cancellationToken);
            foreach (var ci in histItems)
            {
                catalogById[ci.Id] = ci;
            }
        }

        var labels = catalogById.ToDictionary(kvp => kvp.Key, kvp => ResolveLabel(kvp.Value, preferredLang));
        var bomByItemId = bomItems.GroupBy(b => b.CatalogItemId).ToDictionary(g => g.Key, g => g.First());
        var histSet = historicalPartIds.ToHashSet();
        var stockByItemId = stockBalances.GroupBy(sb => sb.CatalogItemId).ToDictionary(g => g.Key, g => g.ToList());

        var prioritizedIds = new List<Guid>();
        var seen = new HashSet<Guid>();

        void AddIfValid(Guid catalogItemId)
        {
            if (prioritizedIds.Count < MaxCandidateParts && catalogById.ContainsKey(catalogItemId) && seen.Add(catalogItemId))
                prioritizedIds.Add(catalogItemId);
        }

        foreach (var bom in bomItems.OrderByDescending(b => b.IsCritical))
            AddIfValid(bom.CatalogItemId);

        foreach (var histId in historicalPartIds)
            AddIfValid(histId);

        foreach (var sbGroup in stockBalances
                     .GroupBy(s => s.CatalogItemId)
                     .OrderByDescending(g => g.Sum(x => x.QuantityOnHand)))
        {
            AddIfValid(sbGroup.Key);
        }

        var parts = prioritizedIds.Select(id =>
        {
            var ci = catalogById[id];
            bomByItemId.TryGetValue(id, out var bom);
            stockByItemId.TryGetValue(id, out var balances);

            var totalStock = balances?.Sum(b => b.QuantityOnHand) ?? 0m;
            var primaryBalance = balances?
                .OrderByDescending(b => b.QuantityOnHand)
                .FirstOrDefault();

            return new TriageCandidatePartOption(
                CatalogItemId: id,
                Code: ci.Code,
                Label: labels[id],
                IsBomPart: bom is not null,
                IsCritical: bom?.IsCritical ?? false,
                AvailableStock: totalStock,
                PrimaryWarehouseId: primaryBalance?.WarehouseId,
                WarehouseName: primaryBalance?.Warehouse?.Name,
                AverageUnitCost: primaryBalance?.AverageUnitCost ?? 0m);
        }).ToList();

        return (parts, labels);
    }

    private static string ResolvePreferredLanguage()
    {
        var iso = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        return string.Equals(iso, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "es";
    }

    private static string ResolveLabel(CatalogItem? item, string preferredLang)
    {
        if (item is null)
            return string.Empty;

        var translations = item.Translations;
        if (translations is { Count: > 0 })
        {
            var preferred = translations.FirstOrDefault(t => string.Equals(t.Locale, preferredLang, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(preferred?.Label))
                return preferred.Label;

            var spanish = translations.FirstOrDefault(t => string.Equals(t.Locale, "es", StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(spanish?.Label))
                return spanish.Label;

            var english = translations.FirstOrDefault(t => string.Equals(t.Locale, "en", StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(english?.Label))
                return english.Label;

            var first = translations.FirstOrDefault(t => !string.IsNullOrWhiteSpace(t.Label));
            if (first is not null)
                return first.Label;
        }

        return item.Code;
    }

    private static List<Guid> ParseGuidArray(string? skillsJson)
    {
        if (string.IsNullOrWhiteSpace(skillsJson))
            return new List<Guid>();

        try
        {
            using var doc = JsonDocument.Parse(skillsJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
                return new List<Guid>();

            var ids = new List<Guid>();
            foreach (var elem in doc.RootElement.EnumerateArray())
            {
                if (elem.ValueKind == JsonValueKind.String &&
                    Guid.TryParse(elem.GetString(), out var guid))
                {
                    ids.Add(guid);
                }
            }
            return ids;
        }
        catch (JsonException)
        {
            return new List<Guid>();
        }
    }
}
