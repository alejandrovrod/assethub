using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Dtos;
using AssetHub.Domain.Concurrency;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Queries;

public class GetWorkTasksQuery : IRequest<GetWorkTasksResult>
{
    public string? State { get; set; }
    public bool? AssignedToMe { get; set; }
    public Guid? AssetId { get; set; }
    public Guid? IncidentId { get; set; }
    public Guid? MaintenanceOrderId { get; set; }
    public Guid? PreventivePlanId { get; set; }
    public Guid? TaskRecurrenceId { get; set; }
    public string? Search { get; set; }
    public DateTime? DueBefore { get; set; }
    public DateTime? DueAfter { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class GetWorkTasksResult
{
    public List<WorkTaskSummaryDto> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class GetWorkTasksQueryHandler : IRequestHandler<GetWorkTasksQuery, GetWorkTasksResult>
{
    private readonly ITenantDbContext _db;
    private readonly ICurrentUser _currentUser;

    public GetWorkTasksQueryHandler(ITenantDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task<GetWorkTasksResult> Handle(GetWorkTasksQuery request, CancellationToken cancellationToken)
    {
        var query = _db.WorkTasks
            .AsNoTracking()
            .Include(t => t.Asset)
            .Include(t => t.Incident)
            .Include(t => t.PreventivePlan)
            .Include(t => t.AssignedEmployee)
            .Include(t => t.AssignedTeam)
            .Include(t => t.PriorityCatalogItem)
                .ThenInclude(ci => ci!.Translations)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.State))
        {
            query = query.Where(t => t.State == request.State);
        }

        if (request.AssignedToMe == true && _currentUser.Id.HasValue)
        {
            var userId = _currentUser.Id.Value;
            query = query.Where(t => t.AssignedEmployee != null && t.AssignedEmployee.UserId == userId);
        }

        if (request.AssetId.HasValue)
        {
            query = query.Where(t => t.AssetId == request.AssetId.Value);
        }

        if (request.IncidentId.HasValue)
        {
            var incidentId = request.IncidentId.Value;

            // Una tarea tiene un único padre, así que las tareas de reparación cuelgan
            // de la orden y no de la incidencia. Para que la incidencia muestre todo lo
            // que se hizo, se incluyen también las tareas de sus órdenes de mantenimiento.
            var incidentOrderIds = await _db.MaintenanceOrders
                .Where(o => o.IncidentId == incidentId && !o.IsDeleted)
                .Select(o => o.Id)
                .ToListAsync(cancellationToken);

            query = query.Where(t =>
                t.IncidentId == incidentId ||
                (t.MaintenanceOrderId != null && incidentOrderIds.Contains(t.MaintenanceOrderId.Value)));
        }

        if (request.MaintenanceOrderId.HasValue)
        {
            query = query.Where(t => t.MaintenanceOrderId == request.MaintenanceOrderId.Value);
        }

        if (request.PreventivePlanId.HasValue)
        {
            query = query.Where(t => t.PreventivePlanId == request.PreventivePlanId.Value);
        }

        if (request.TaskRecurrenceId.HasValue)
        {
            query = query.Where(t => t.TaskRecurrenceId == request.TaskRecurrenceId.Value);
        }

        if (request.DueBefore.HasValue)
        {
            query = query.Where(t => t.DueAt.HasValue && t.DueAt.Value <= request.DueBefore.Value);
        }

        if (request.DueAfter.HasValue)
        {
            query = query.Where(t => t.DueAt.HasValue && t.DueAt.Value >= request.DueAfter.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLowerInvariant();
            query = query.Where(t =>
                t.Title.ToLower().Contains(term) ||
                (t.Asset != null && t.Asset.Name.ToLower().Contains(term)));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(t => new WorkTaskSummaryDto
            {
                Id = t.Id,
                RowVersion = t.RowVersion,
                Title = t.Title,
                State = t.State,
                DueAt = t.DueAt,
                CreatedAt = t.CreatedAt,
                AssetId = t.AssetId ?? (t.MaintenanceOrder != null ? t.MaintenanceOrder.AssetId : (t.PreventivePlan != null ? t.PreventivePlan.AssetId : (t.Incident != null ? t.Incident.AssetId : null))),
                AssetName = t.Asset != null ? t.Asset.Name : (t.MaintenanceOrder != null && t.MaintenanceOrder.Asset != null ? t.MaintenanceOrder.Asset.Name : (t.PreventivePlan != null && t.PreventivePlan.Asset != null ? t.PreventivePlan.Asset.Name : (t.Incident != null && t.Incident.Asset != null ? t.Incident.Asset.Name : null))),
                IncidentId = t.IncidentId,
                IncidentTitle = t.Incident != null ? t.Incident.Title : null,
                WorkflowTemplateId = t.MaintenanceOrder != null && t.MaintenanceOrder.WorkflowTemplateId != null ? t.MaintenanceOrder.WorkflowTemplateId : (t.Incident != null && t.Incident.WorkflowTemplateId != null ? t.Incident.WorkflowTemplateId : (t.PreventivePlan != null ? t.PreventivePlan.WorkflowTemplateId : null)),
                PreventivePlanId = t.PreventivePlanId,
                PreventivePlanName = t.PreventivePlan != null ? t.PreventivePlan.Name : null,
                MaintenanceOrderId = t.MaintenanceOrderId,
                MaintenanceOrderTitle = t.MaintenanceOrder != null ? t.MaintenanceOrder.Title : null,
                MaintenanceOrderState = t.MaintenanceOrder != null ? t.MaintenanceOrder.State : null,
                AssignedEmployeeId = t.AssignedEmployeeId,
                AssignedEmployeeName = t.AssignedEmployee != null ? $"{t.AssignedEmployee.FirstName} {t.AssignedEmployee.LastName}" : null,
                AssignedTeamId = t.AssignedTeamId,
                AssignedTeamName = t.AssignedTeam != null ? t.AssignedTeam.Name : null,
                PriorityLabel = _db.CatalogItemTranslations
                    .Where(tr => tr.CatalogItemId == t.PriorityCatalogItemId && tr.Locale == "es")
                    .Select(tr => tr.Label)
                    .FirstOrDefault(),
                Description = t.Description,
                PropertiesJson = t.PropertiesJson
            })
            .ToListAsync(cancellationToken);

        // El encoder no es traducible a SQL: se calcula en memoria sobre los bytes.
        foreach (var item in items)
        {
            item.ETag = RowVersionToken.ToToken(item.RowVersion);
        }

        // El checklist se resuelve en una segunda consulta, no con un join en la
        // proyección: tocar la navegación dentro del `Select` hace que EF la traduzca
        // como INNER JOIN y las tareas sin formulario desaparezcan del listado.
        if (items.Count > 0)
        {
            var taskIds = items.Select(i => i.Id).ToList();
            var checklistRows = await _db.TaskChecklists
                .AsNoTracking()
                .Where(c => taskIds.Contains(c.WorkTaskId))
                .Select(c => new { c.WorkTaskId, c.RowVersion })
                .ToListAsync(cancellationToken);

            var checklistByTask = checklistRows
                .GroupBy(c => c.WorkTaskId)
                .ToDictionary(g => g.Key, g => g.First().RowVersion);

            foreach (var item in items)
            {
                if (checklistByTask.TryGetValue(item.Id, out var checklistRowVersion))
                {
                    item.HasChecklist = true;
                    item.ChecklistETag = RowVersionToken.ToToken(checklistRowVersion);
                }
            }
        }

        return new GetWorkTasksResult
        {
            Items = items,
            TotalCount = totalCount,
            Page = request.Page,
            PageSize = request.PageSize
        };
    }
}
