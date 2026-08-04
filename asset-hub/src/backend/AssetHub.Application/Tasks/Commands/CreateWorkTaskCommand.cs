using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

public class CreateWorkTaskCommand : IRequest<Guid>
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    public Guid TaskTypeCatalogItemId { get; set; }
    public Guid PriorityCatalogItemId { get; set; }
    
    public DateTime? DueAt { get; set; }
    
    public bool IsIndependent { get; set; }
    
    public Guid? AssetId { get; set; }
    public Guid? MaintenanceOrderId { get; set; }
    public Guid? IncidentId { get; set; }
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
        var tenantId = _tenantResolver.GetCurrentTenantId();

        if (!request.IsIndependent && !request.AssetId.HasValue && !request.MaintenanceOrderId.HasValue && !request.IncidentId.HasValue)
            throw new ArgumentException("Task must be linked to an Asset, MaintenanceOrder or Incident, unless marked as IsIndependent");

        // Could add catalog item validation here

        var task = new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            Title = request.Title,
            Description = request.Description,
            TaskTypeCatalogItemId = request.TaskTypeCatalogItemId,
            PriorityCatalogItemId = request.PriorityCatalogItemId,
            State = "todo",
            DueAt = request.DueAt,
            IsIndependent = request.IsIndependent,
            AssetId = request.AssetId,
            MaintenanceOrderId = request.MaintenanceOrderId,
            IncidentId = request.IncidentId
        };

        _db.WorkTasks.Add(task);
        await _db.SaveChangesAsync(cancellationToken);

        return task.Id;
    }
}
