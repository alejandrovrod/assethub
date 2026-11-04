using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Field;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Queries;

/// <summary>
/// Evidencias capturadas para una tarea (022 T072).
///
/// Es el complemento de lectura de <c>POST /work-tasks/{id}/evidences</c>: el cliente de
/// campo sube fotos/firmas offline y necesita poder confirmar qué quedó del otro lado
/// antes de dar la tarea por sincronizada.
/// </summary>
public record GetTaskEvidencesQuery(Guid WorkTaskId) : IRequest<List<TaskEvidenceDto>>;

public class TaskEvidenceDto
{
    public Guid Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? BlobUri { get; set; }
    public string? Note { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public Guid CapturedByUserId { get; set; }
    public DateTime CapturedAt { get; set; }
}

public class GetTaskEvidencesQueryHandler : IRequestHandler<GetTaskEvidencesQuery, List<TaskEvidenceDto>>
{
    private readonly ITenantDbContext _db;
    private readonly FieldTaskAccess _access;

    public GetTaskEvidencesQueryHandler(ITenantDbContext db, FieldTaskAccess access)
    {
        _db = db;
        _access = access;
    }

    public async Task<List<TaskEvidenceDto>> Handle(GetTaskEvidencesQuery request, CancellationToken cancellationToken)
    {
        // La tarea se materializa (no un AnyAsync) porque la visibilidad del rol de campo
        // depende de AssignedEmployeeId/AssignedTeamId: sin la fila no hay nada que evaluar.
        var task = await _db.WorkTasks
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == request.WorkTaskId, cancellationToken);

        if (task is null)
        {
            // 404 y no 403: para un id de otro tenant el filtro global ya lo hace inexistente,
            // así que distinguir "no existe" de "no es tuyo" filtraría información.
            throw new NotFoundException("WorkTask", request.WorkTaskId);
        }

        await _access.EnsureCanOperateAsync(task, cancellationToken);

        return await _db.TaskEvidences
            .AsNoTracking()
            .Where(e => e.WorkTaskId == request.WorkTaskId)
            .OrderBy(e => e.CapturedAt)
            .Select(e => new TaskEvidenceDto
            {
                Id = e.Id,
                Type = e.Type,
                BlobUri = e.BlobUri,
                Note = e.Note,
                Latitude = e.Latitude,
                Longitude = e.Longitude,
                CapturedByUserId = e.CapturedByUserId,
                CapturedAt = e.CapturedAt
            })
            .ToListAsync(cancellationToken);
    }
}
