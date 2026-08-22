using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Helpers;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

public class CreateWorkTaskCommand : IRequest<Guid>
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }

    public Guid? TaskTypeCatalogItemId { get; set; }
    public Guid? PriorityCatalogItemId { get; set; }

    public DateTime? DueAt { get; set; }

    public bool IsIndependent { get; set; }

    public Guid? AssetId { get; set; }
    public Guid? MaintenanceOrderId { get; set; }
    public Guid? IncidentId { get; set; }
    public Guid? PreventivePlanId { get; set; }
    public Guid? TaskRecurrenceId { get; set; }

    public Guid? AssignedEmployeeId { get; set; }
    public Guid? AssignedTeamId { get; set; }
    
    public string PropertiesJson { get; set; } = "{}";
}

public class CreateWorkTaskCommandHandler : IRequestHandler<CreateWorkTaskCommand, Guid>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public CreateWorkTaskCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<Guid> Handle(CreateWorkTaskCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()!.Value;

        var hasAnyLink = request.AssetId.HasValue
            || request.MaintenanceOrderId.HasValue
            || request.IncidentId.HasValue
            || request.PreventivePlanId.HasValue
            || request.TaskRecurrenceId.HasValue;

        if (!request.IsIndependent && !hasAnyLink)
            throw new ArgumentException("Task must be linked to an Asset, MaintenanceOrder, Incident, PreventivePlan or TaskRecurrence, unless marked as IsIndependent");

        if (request.IsIndependent && hasAnyLink)
            throw new ArgumentException("An independent task cannot be linked to other entities");

        var parentLinkCount = new[]
        {
            request.MaintenanceOrderId,
            request.IncidentId,
            request.PreventivePlanId,
            request.AssetId,
            request.TaskRecurrenceId
        }.Count(id => id.HasValue);

        if (parentLinkCount > 1)
            throw new ArgumentException("A task can only be linked to one parent entity (Asset, Incident, MaintenanceOrder, PreventivePlan or TaskRecurrence)");

        // Ensure default catalog items if not provided
        Guid taskTypeCatalogItemId;
        Guid priorityCatalogItemId;

        if (request.TaskTypeCatalogItemId.HasValue && request.PriorityCatalogItemId.HasValue)
        {
            taskTypeCatalogItemId = request.TaskTypeCatalogItemId.Value;
            priorityCatalogItemId = request.PriorityCatalogItemId.Value;
        }
        else
        {
            var defaults = await TaskCatalogDefaults.EnsureDefaultCatalogsAsync(_db, tenantId, cancellationToken);
            taskTypeCatalogItemId = request.TaskTypeCatalogItemId ?? defaults.TaskTypeCatalogItemId;
            priorityCatalogItemId = request.PriorityCatalogItemId ?? defaults.PriorityCatalogItemId;
        }

        if (request.AssignedEmployeeId.HasValue)
        {
            var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == request.AssignedEmployeeId.Value, cancellationToken);
            if (emp == null || !emp.IsActive)
                throw new ArgumentException("Assigned employee not found or inactive");
        }

        if (request.AssignedTeamId.HasValue)
        {
            var team = await _db.Teams.FirstOrDefaultAsync(t => t.Id == request.AssignedTeamId.Value, cancellationToken);
            if (team == null || team.IsDeleted)
                throw new ArgumentException("Assigned team not found");
        }

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = request.Title,
            Description = request.Description,
            TaskTypeCatalogItemId = taskTypeCatalogItemId,
            PriorityCatalogItemId = priorityCatalogItemId,
            State = WorkTaskStates.Todo,
            DueAt = request.DueAt,
            IsIndependent = request.IsIndependent,
            AssetId = request.AssetId,
            MaintenanceOrderId = request.MaintenanceOrderId,
            IncidentId = request.IncidentId,
            PreventivePlanId = request.PreventivePlanId,
            TaskRecurrenceId = request.TaskRecurrenceId,
            AssignedEmployeeId = request.AssignedEmployeeId,
            AssignedTeamId = request.AssignedTeamId,
            PropertiesJson = request.PropertiesJson
        };

        _db.WorkTasks.Add(task);
        await _db.SaveChangesAsync(cancellationToken);

        return task.Id;
    }
}
