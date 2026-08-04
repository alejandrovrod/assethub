using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

public class AssignWorkTaskCommand : IRequest<Unit>
{
    public Guid WorkTaskId { get; set; }
    
    public Guid? AssignedEmployeeId { get; set; }
    public Guid? AssignedTeamId { get; set; }
}

public class AssignWorkTaskCommandHandler : IRequestHandler<AssignWorkTaskCommand, Unit>
{
    private readonly ITenantDbContext _db;

    public AssignWorkTaskCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<Unit> Handle(AssignWorkTaskCommand request, CancellationToken cancellationToken)
    {
        var task = await _db.WorkTasks.FirstOrDefaultAsync(t => t.Id == request.WorkTaskId, cancellationToken);
        if (task == null)
            throw new ArgumentException("WorkTask not found");

        if (request.AssignedEmployeeId.HasValue)
        {
            var emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == request.AssignedEmployeeId, cancellationToken);
            if (emp == null || !emp.IsActive)
                throw new ArgumentException("Employee not found or inactive");
        }

        task.AssignedEmployeeId = request.AssignedEmployeeId;
        task.AssignedTeamId = request.AssignedTeamId;

        await _db.SaveChangesAsync(cancellationToken);

        return Unit.Value;
    }
}
