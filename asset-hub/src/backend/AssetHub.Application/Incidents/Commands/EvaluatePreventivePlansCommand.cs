using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Cronos;

namespace AssetHub.Application.Incidents.Commands;

public class EvaluatePreventivePlansCommand : IRequest<int>
{
    // Evaluates all tenants. 
    // Usually this is triggered by a global system scheduler, so it might not run under a specific tenant context.
}

public class EvaluatePreventivePlansCommandHandler : IRequestHandler<EvaluatePreventivePlansCommand, int>
{
    private readonly ITenantDbContext _db;

    public EvaluatePreventivePlansCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<int> Handle(EvaluatePreventivePlansCommand request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        
        // Use IgnoreQueryFilters so we evaluate plans for all tenants in the background job
        var duePlans = await _db.PreventivePlans
            .IgnoreQueryFilters()
            .Where(p => p.IsActive && !p.IsDeleted && p.NextRunAt != null && p.NextRunAt <= now)
            .ToListAsync(cancellationToken);

        int processed = 0;

        foreach (var plan in duePlans)
        {
            // Encontrar tipo y prioridad por defecto para la tarea
            var defaultType = await _db.CatalogItems.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.TenantId == plan.TenantId && (c.Code == "inspect" || c.Code == "preventive"), cancellationToken);
            var defaultPriority = await _db.CatalogItems.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.TenantId == plan.TenantId && (c.Code == "medium" || c.Code == "normal"), cancellationToken);
            
            var typeId = defaultType?.Id ?? Guid.Empty; // Ideally this should be a real ID
            var priorityId = defaultPriority?.Id ?? Guid.Empty;

            var task = new AssetHub.Domain.Tasks.WorkTask
            {
                Id = Guid.NewGuid(),
                TenantId = plan.TenantId,
                Title = $"Preventive: {plan.Name}",
                Description = plan.Description,
                TaskTypeCatalogItemId = typeId,
                PriorityCatalogItemId = priorityId,
                State = "todo",
                AssetId = plan.AssetId, // Si es a nivel template, la logica seria crear para todos los assets del template, pero simplificamos.
                DueAt = now.AddDays(7) // Example due date
            };
            
            _db.WorkTasks.Add(task);
            // Calculate NextRunAt
            plan.LastRunAt = now;
            
            if (!string.IsNullOrWhiteSpace(plan.CronExpression))
            {
                var expression = CronExpression.Parse(plan.CronExpression);
                plan.NextRunAt = expression.GetNextOccurrence(now);
            }
            else if (plan.IntervalDays.HasValue && plan.IntervalDays.Value > 0)
            {
                plan.NextRunAt = now.AddDays(plan.IntervalDays.Value);
            }
            else
            {
                // Unlikely to reach here if NextRunAt was not null and it's not cron/interval, but just in case
                plan.NextRunAt = null; 
            }
            
            processed++;
        }

        if (processed > 0)
        {
            await _db.SaveChangesAsync(cancellationToken);
        }

        return processed;
    }
}
