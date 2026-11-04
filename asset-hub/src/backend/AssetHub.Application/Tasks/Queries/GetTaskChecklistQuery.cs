using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Dtos;
using AssetHub.Domain.Concurrency;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Queries;

public record GetTaskChecklistQuery(Guid TaskId) : IRequest<TaskChecklistQueryResult>;

/// <summary>
/// Tres estados, no dos: la tarea no existe (404), la tarea existe pero no tiene
/// checklist (204) y hay checklist (200). Colapsar los dos primeros en un <c>null</c>
/// obligaría al cliente a tratar "no existe" como "sin formulario" y a cachear un
/// 204 para una tarea que en realidad nunca recibió.
/// </summary>
public record TaskChecklistQueryResult(bool TaskExists, TaskChecklistDto? Checklist);

public class GetTaskChecklistQueryHandler : IRequestHandler<GetTaskChecklistQuery, TaskChecklistQueryResult>
{
    private readonly ITenantDbContext _db;

    public GetTaskChecklistQueryHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<TaskChecklistQueryResult> Handle(GetTaskChecklistQuery request, CancellationToken cancellationToken)
    {
        var checklist = await _db.TaskChecklists
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.WorkTaskId == request.TaskId, cancellationToken);

        if (checklist is null)
        {
            var taskExists = await _db.WorkTasks
                .AsNoTracking()
                .AnyAsync(t => t.Id == request.TaskId, cancellationToken);

            return new TaskChecklistQueryResult(taskExists, null);
        }

        return new TaskChecklistQueryResult(true, new TaskChecklistDto
        {
            TaskId = checklist.WorkTaskId,
            SchemaJson = checklist.SchemaJson,
            UiSchemaJson = checklist.UiSchemaJson,
            ResponseJson = checklist.ResponseJson,
            State = checklist.State,
            SubmittedAt = checklist.SubmittedAt,
            Version = checklist.Version,
            ETag = RowVersionToken.ToToken(checklist.RowVersion),
        });
    }
}
