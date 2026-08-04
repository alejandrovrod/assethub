using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Incidents;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Cronos;

namespace AssetHub.Application.Incidents.Commands;

public class CreatePreventivePlanCommand : IRequest<Guid>
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? AssetTemplateId { get; set; }
    public Guid? AssetId { get; set; }
    
    public string? CronExpression { get; set; }
    public int? IntervalDays { get; set; }
    public string? ConditionRuleJson { get; set; }
}

public class CreatePreventivePlanCommandHandler : IRequestHandler<CreatePreventivePlanCommand, Guid>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public CreatePreventivePlanCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<Guid> Handle(CreatePreventivePlanCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();

        if ((request.AssetTemplateId.HasValue && request.AssetId.HasValue) || 
            (!request.AssetTemplateId.HasValue && !request.AssetId.HasValue))
        {
            throw new ArgumentException("A preventive plan must target either a TemplateId or an AssetId, but not both.");
        }

        DateTime? nextRunAt = null;

        if (!string.IsNullOrWhiteSpace(request.CronExpression))
        {
            try
            {
                var expression = CronExpression.Parse(request.CronExpression);
                nextRunAt = expression.GetNextOccurrence(DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                throw new ArgumentException($"Invalid CronExpression: {ex.Message}");
            }
        }
        else if (request.IntervalDays.HasValue && request.IntervalDays.Value > 0)
        {
            nextRunAt = DateTime.UtcNow.AddDays(request.IntervalDays.Value);
        }

        var plan = new PreventivePlan
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            Name = request.Name,
            Description = request.Description,
            AssetTemplateId = request.AssetTemplateId,
            AssetId = request.AssetId,
            CronExpression = request.CronExpression,
            IntervalDays = request.IntervalDays,
            ConditionRuleJson = request.ConditionRuleJson,
            NextRunAt = nextRunAt,
            IsActive = true
        };

        _db.PreventivePlans.Add(plan);
        await _db.SaveChangesAsync(cancellationToken);

        return plan.Id;
    }
}
