using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

public class ChangeWorkTaskStateCommand : IRequest<Unit>
{
    public Guid WorkTaskId { get; set; }
    public string NewState { get; set; } = string.Empty;
}

public class ChangeWorkTaskStateCommandHandler : IRequestHandler<ChangeWorkTaskStateCommand, Unit>
{
    private readonly ITenantDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly ITenantResolver _tenantResolver;

    public ChangeWorkTaskStateCommandHandler(ITenantDbContext db, ICurrentUser currentUser, ITenantResolver tenantResolver)
    {
        _db = db;
        _currentUser = currentUser;
        _tenantResolver = tenantResolver;
    }

    public async Task<Unit> Handle(ChangeWorkTaskStateCommand request, CancellationToken cancellationToken)
    {
        var task = await _db.WorkTasks.FirstOrDefaultAsync(t => t.Id == request.WorkTaskId, cancellationToken);
        if (task == null)
            throw new ArgumentException("Task not found");

        // Validate permissions: in a real app, verify user is AssignedEmployee, Team Lead, or has 'tasks.manage' permission.
        // For MVP, we skip the deep role check.

        var oldState = task.State;
        var newState = request.NewState;

        if (oldState == newState)
            return Unit.Value;

        if (newState == "cancelled" && (oldState == "done" || oldState == "cancelled"))
            throw new InvalidOperationException("Invalid state transition");

        bool valid = false;
        switch (oldState)
        {
            case "todo":
                valid = newState == "in_progress" || newState == "cancelled";
                break;
            case "in_progress":
                valid = newState == "review" || newState == "blocked" || newState == "cancelled";
                break;
            case "blocked":
                valid = newState == "in_progress" || newState == "cancelled";
                break;
            case "review":
                valid = newState == "done" || newState == "in_progress" || newState == "cancelled";
                break;
            case "done":
            case "cancelled":
                valid = false;
                break;
        }

        if (!valid)
            throw new InvalidOperationException($"Cannot transition from {oldState} to {newState}"); // Should be 409

        // Update times
        if (oldState == "todo" && newState == "in_progress")
        {
            task.StartedAt = DateTime.UtcNow;
        }
        else if (newState == "done")
        {
            task.CompletedAt = DateTime.UtcNow;
        }

        task.State = newState;

        _db.TaskStatusHistories.Add(new TaskStatusHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantResolver.GetCurrentTenantId()!.Value,
            WorkTaskId = task.Id,
            FromState = oldState,
            ToState = newState,
            ChangedByUserId = _currentUser.Id,
            ChangedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(cancellationToken);

        return Unit.Value;
    }
}
