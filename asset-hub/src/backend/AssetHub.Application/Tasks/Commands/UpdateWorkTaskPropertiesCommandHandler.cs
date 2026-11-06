using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Common.Workflow;
using AssetHub.Application.Field;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Helpers;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

public class UpdateWorkTaskPropertiesCommandHandler : IRequestHandler<UpdateWorkTaskPropertiesCommand, Unit>
{
    private readonly ITenantDbContext _db;
    private readonly FieldTaskAccess _access;

    public UpdateWorkTaskPropertiesCommandHandler(ITenantDbContext db, FieldTaskAccess access)
    {
        _db = db;
        _access = access;
    }

    public async Task<Unit> Handle(UpdateWorkTaskPropertiesCommand request, CancellationToken cancellationToken)
    {
        var task = await _db.WorkTasks.FirstOrDefaultAsync(t => t.Id == request.WorkTaskId, cancellationToken);
        if (task == null)
            throw new NotFoundException("Tarea no encontrada");

        if (WorkTaskStates.TerminalStates.Contains(task.State))
            throw new InvalidOperationException("No se puede editar una tarea en un estado terminal");

        await _access.EnsureCanOperateAsync(task, cancellationToken);

        if (request.ExpectedRowVersion is { Length: > 0 }
            && !task.RowVersion.AsSpan().SequenceEqual(request.ExpectedRowVersion))
        {
            throw new ConcurrencyException(
                $"La tarea '{task.Title}' fue modificada por otra persona.",
                currentState: task.State,
                allowedTransitions: TaskStateTransitionValidator.GetAllowedTransitions(task.State),
                currentETag: RowVersionToken.ToToken(task.RowVersion));
        }

        task.PropertiesJson = request.PropertiesJson;
        task.UpdatedAt = DateTime.UtcNow;

        if (WorkflowProperties.TryGetExecutorId(request.PropertiesJson, out var executorId))
        {
            var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == executorId, cancellationToken);
            if (emp != null && emp.IsActive)
            {
                task.AssignedEmployeeId = executorId;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
