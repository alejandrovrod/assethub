using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Common.Workflow;
using AssetHub.Application.Incidents.EventHandlers;
using AssetHub.Application.Incidents.Events;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.Events;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.IncidentTriage.Commands;

public sealed class ApplyIncidentTriageCommandHandler
    : IRequestHandler<ApplyIncidentTriageCommand, ApplyIncidentTriageResult>
{
    private readonly ITenantDbContext _db;
    private readonly IMediator _mediator;
    private readonly ICurrentUser _currentUser;

    public ApplyIncidentTriageCommandHandler(
        ITenantDbContext db,
        IMediator mediator,
        ICurrentUser currentUser)
    {
        _db = db;
        _mediator = mediator;
        _currentUser = currentUser;
    }

    public async Task<ApplyIncidentTriageResult> Handle(
        ApplyIncidentTriageCommand request,
        CancellationToken cancellationToken)
    {
        var incident = await _db.Incidents
            .Include(i => i.WorkflowTemplate)
            .Include(i => i.MaintenanceOrders)
            .FirstOrDefaultAsync(i => i.Id == request.IncidentId, cancellationToken);

        if (incident is null)
            throw new ArgumentException("Incident not found.", nameof(request));

        if (request.ExpectedRowVersion is { Length: > 0 } &&
            !incident.RowVersion.AsSpan().SequenceEqual(request.ExpectedRowVersion))
        {
            throw new ConcurrencyException(
                "The incident was modified by another user.",
                currentState: incident.State,
                currentETag: RowVersionToken.ToToken(incident.RowVersion));
        }

        if (IncidentTriageStateHelper.IsTerminalState(incident, incident.State))
            throw new InvalidOperationException("Cannot apply triage to a closed or cancelled incident.");

        await ValidatePriorityAsync(request.PriorityId, cancellationToken);
        await ValidateAssigneeAsync(request.AssignedEmployeeId, cancellationToken);
        var targetStateInfo = ResolveValidatedTargetState(incident, request.TargetState);

        var requestedParts = request.SuggestedParts ?? new List<ApplyTriagePartInput>();
        await ValidateSuggestedPartsAsync(requestedParts, cancellationToken);

        if (request.PriorityId.HasValue)
            incident.PriorityId = request.PriorityId.Value;

        if (request.AssignedEmployeeId.HasValue)
            incident.PropertiesJson = MergeAssigneeProperty(incident.PropertiesJson, request.AssignedEmployeeId.Value);

        var previousState = incident.State;
        if (targetStateInfo is not null &&
            !string.Equals(targetStateInfo.Name, incident.State, StringComparison.Ordinal))
        {
            incident.State = targetStateInfo.Name;
        }

        _db.IncidentLifecycleEvents.Add(new IncidentLifecycleEvent
        {
            Id = Guid.NewGuid(),
            IncidentId = incident.Id,
            EventType = "triaje_ia",
            FromState = previousState,
            ToState = incident.State,
            Notes = BuildAuditNotes(request, previousState, incident.State),
            At = DateTime.UtcNow,
            UserId = _currentUser.Id ?? Guid.Empty
        });

        await _db.SaveChangesAsync(cancellationToken);

        var shouldEnsureOrder = request.CreateOrUpdateWorkOrder || (targetStateInfo?.TriggersWorkOrder == true);
        var order = incident.MaintenanceOrders
            .Where(o => !o.IsDeleted && o.Kind == MaintenanceOrderKinds.Corrective)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefault();

        var createdNewOrder = false;
        if (order is null && shouldEnsureOrder)
        {
            var propagatable = PropertyPropagation.FilterToPropagatable(
                incident.PropertiesJson,
                incident.WorkflowTemplate?.SchemaJson);

            var description = BuildOrderDescription(incident.Description, request.DiagnosisSummary);
            order = new MaintenanceOrder
            {
                Id = Guid.NewGuid(),
                TenantId = incident.TenantId,
                Kind = MaintenanceOrderKinds.Corrective,
                State = MaintenanceOrderStates.Draft,
                Title = $"Orden correctiva: {incident.Title}",
                Description = description,
                AssetId = incident.AssetId,
                IncidentId = incident.Id,
                WorkflowTemplateId = incident.WorkflowTemplateId,
                AssignedEmployeeId = request.AssignedEmployeeId,
                PropertiesJson = propagatable
            };

            _db.MaintenanceOrders.Add(order);
            await _db.SaveChangesAsync(cancellationToken);

            await IncidentOrderTaskFactory.EnsureExecutableTaskAsync(
                _db,
                _mediator,
                order,
                incident,
                cancellationToken,
                descriptionOverride: order.Description);

            createdNewOrder = true;
        }
        else if (order is not null && shouldEnsureOrder)
        {
            if (request.AssignedEmployeeId.HasValue)
            {
                order.AssignedEmployeeId = request.AssignedEmployeeId.Value;

                var unassignedOpenTasks = await _db.WorkTasks
                    .Where(t => t.MaintenanceOrderId == order.Id &&
                                !t.IsDeleted &&
                                t.AssignedEmployeeId == null &&
                                !WorkTaskStates.TerminalStates.Contains(t.State))
                    .ToListAsync(cancellationToken);

                foreach (var task in unassignedOpenTasks)
                {
                    task.AssignedEmployeeId = request.AssignedEmployeeId.Value;
                }
            }

            if (!string.IsNullOrWhiteSpace(request.DiagnosisSummary))
            {
                var summary = request.DiagnosisSummary.Trim();
                if (string.IsNullOrWhiteSpace(order.Description) ||
                    !order.Description.Contains(summary, StringComparison.Ordinal))
                {
                    order.Description = BuildOrderDescription(order.Description, summary);
                }
            }

            await _db.SaveChangesAsync(cancellationToken);

            await IncidentOrderTaskFactory.EnsureExecutableTaskAsync(
                _db,
                _mediator,
                order,
                incident,
                cancellationToken,
                descriptionOverride: order.Description);
        }

        var addedPartsCount = 0;
        if (order is not null && requestedParts.Count > 0)
        {
            addedPartsCount = await AttachPlannedPartsAsync(order, requestedParts, cancellationToken);
        }

        if (createdNewOrder && order is not null)
        {
            await _mediator.Publish(new MaintenanceOrderCreatedEvent(
                order.Id,
                order.TenantId,
                order.AssetId,
                order.PropertiesJson
            ), cancellationToken);
        }

        if (!string.Equals(previousState, incident.State, StringComparison.Ordinal))
        {
            await _mediator.Publish(new IncidentStateChangedEvent(
                incident.Id,
                incident.AssetId,
                previousState,
                incident.State,
                IsTerminal: false
            ), cancellationToken);
        }

        return new ApplyIncidentTriageResult(
            IncidentId: incident.Id,
            State: incident.State,
            PriorityId: incident.PriorityId,
            AssignedEmployeeId: request.AssignedEmployeeId,
            MaintenanceOrderId: order?.Id,
            AddedPartsCount: addedPartsCount,
            ETag: RowVersionToken.ToToken(incident.RowVersion));
    }

    private async Task ValidatePriorityAsync(Guid? priorityId, CancellationToken cancellationToken)
    {
        if (!priorityId.HasValue)
            return;

        var exists = await _db.CatalogItems
            .AsNoTracking()
            .AnyAsync(c => c.Id == priorityId.Value && !c.IsDeleted, cancellationToken);

        if (!exists)
            throw new ArgumentException("Priority catalog item not found.", nameof(priorityId));
    }

    private async Task ValidateAssigneeAsync(Guid? employeeId, CancellationToken cancellationToken)
    {
        if (!employeeId.HasValue)
            return;

        var valid = await _db.Employees
            .AsNoTracking()
            .AnyAsync(e => e.Id == employeeId.Value && e.IsActive && !e.IsDeleted, cancellationToken);

        if (!valid)
            throw new ArgumentException("Assigned employee not found or inactive.", nameof(employeeId));
    }

    private static TriageReachableStateOption? ResolveValidatedTargetState(Incident incident, string? rawTargetState)
    {
        if (string.IsNullOrWhiteSpace(rawTargetState) ||
            string.Equals(rawTargetState.Trim(), incident.State, StringComparison.Ordinal))
        {
            return null;
        }

        var reachable = IncidentTriageStateHelper.GetReachableNonTerminalStates(incident);
        var match = reachable.FirstOrDefault(s =>
            string.Equals(s.Name, rawTargetState.Trim(), StringComparison.OrdinalIgnoreCase));

        if (match is null)
            throw new InvalidOperationException($"Transition from '{incident.State}' to '{rawTargetState}' is not allowed during triage.");

        return match;
    }

    private async Task ValidateSuggestedPartsAsync(
        IReadOnlyCollection<ApplyTriagePartInput> parts,
        CancellationToken cancellationToken)
    {
        if (parts.Count == 0)
            return;

        if (parts.Any(p => p.Quantity < 1))
            throw new ArgumentException("All suggested spare part quantities must be at least 1.", nameof(parts));

        var catalogIds = parts.Select(p => p.CatalogItemId).Distinct().ToList();
        var existingCount = await _db.CatalogItems
            .AsNoTracking()
            .CountAsync(c => catalogIds.Contains(c.Id) && !c.IsDeleted, cancellationToken);

        if (existingCount != catalogIds.Count)
            throw new ArgumentException("One or more suggested spare parts do not exist in tenant catalogs.", nameof(parts));
    }

    private async Task<int> AttachPlannedPartsAsync(
        MaintenanceOrder order,
        IReadOnlyCollection<ApplyTriagePartInput> requestedParts,
        CancellationToken cancellationToken)
    {
        var existingPartIds = (await _db.MaintenanceParts
                .AsNoTracking()
                .Where(p => p.MaintenanceOrderId == order.Id)
                .Select(p => p.CatalogItemId)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        var distinctRequests = requestedParts
            .GroupBy(p => p.CatalogItemId)
            .Select(g => new ApplyTriagePartInput(
                g.Key,
                Math.Clamp(g.Sum(x => x.Quantity), 1, 999),
                g.FirstOrDefault(x => x.WarehouseId.HasValue)?.WarehouseId))
            .Where(p => !existingPartIds.Contains(p.CatalogItemId))
            .ToList();

        if (distinctRequests.Count == 0)
            return 0;

        var neededCatalogIds = distinctRequests.Select(p => p.CatalogItemId).ToList();
        var balances = await _db.StockBalances
            .AsNoTracking()
            .Where(sb => neededCatalogIds.Contains(sb.CatalogItemId))
            .ToListAsync(cancellationToken);

        var requestedWarehouseIds = distinctRequests
            .Where(p => p.WarehouseId.HasValue)
            .Select(p => p.WarehouseId!.Value)
            .Distinct()
            .ToList();

        var validWarehouseIds = requestedWarehouseIds.Count == 0
            ? new HashSet<Guid>()
            : (await _db.Warehouses
                    .AsNoTracking()
                    .Where(w => requestedWarehouseIds.Contains(w.Id) && w.IsActive && !w.IsDeleted)
                    .Select(w => w.Id)
                    .ToListAsync(cancellationToken))
                .ToHashSet();

        foreach (var part in distinctRequests)
        {
            var warehouseId = part.WarehouseId.HasValue && validWarehouseIds.Contains(part.WarehouseId.Value)
                ? part.WarehouseId
                : null;

            var itemBalances = balances.Where(b => b.CatalogItemId == part.CatalogItemId).ToList();
            var matchingBalance = warehouseId.HasValue
                ? itemBalances.FirstOrDefault(b => b.WarehouseId == warehouseId.Value)
                : itemBalances.OrderByDescending(b => b.QuantityOnHand).FirstOrDefault();

            _db.MaintenanceParts.Add(new MaintenancePart
            {
                Id = Guid.NewGuid(),
                TenantId = order.TenantId,
                MaintenanceOrderId = order.Id,
                CatalogItemId = part.CatalogItemId,
                Quantity = part.Quantity,
                UnitCost = matchingBalance?.AverageUnitCost ?? 0m,
                WarehouseId = warehouseId,
                SourceType = "None"
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        return distinctRequests.Count;
    }

    private static string MergeAssigneeProperty(string? propertiesJson, Guid employeeId)
    {
        JsonObject? obj = null;
        if (!string.IsNullOrWhiteSpace(propertiesJson))
        {
            try
            {
                obj = JsonNode.Parse(propertiesJson) as JsonObject;
            }
            catch (JsonException)
            {
                obj = null;
            }
        }

        obj ??= new JsonObject();
        obj["asignar_a"] = employeeId.ToString();
        return obj.ToJsonString();
    }

    private static string? BuildOrderDescription(string? existingDescription, string? diagnosisSummary)
    {
        if (string.IsNullOrWhiteSpace(diagnosisSummary))
            return existingDescription;

        var block = $"[AI Triage Diagnosis]\n{diagnosisSummary.Trim()}";
        return string.IsNullOrWhiteSpace(existingDescription)
            ? block
            : $"{existingDescription.Trim()}\n\n{block}";
    }

    private static string BuildAuditNotes(ApplyIncidentTriageCommand request, string previousState, string newState)
    {
        var partsSummary = request.SuggestedParts?.Count > 0
            ? $" | Parts: {request.SuggestedParts.Count}"
            : string.Empty;

        var diagnosis = string.IsNullOrWhiteSpace(request.DiagnosisSummary)
            ? "Human-approved AI triage applied."
            : request.DiagnosisSummary.Trim();

        return $"[{previousState} -> {newState}{partsSummary}] {diagnosis}";
    }
}
