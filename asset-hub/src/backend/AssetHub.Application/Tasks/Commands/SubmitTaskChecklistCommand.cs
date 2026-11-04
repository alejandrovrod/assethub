using System;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Checklists;
using AssetHub.Application.Tasks.Dtos;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

public class SubmitTaskChecklistCommand : IRequest<TaskChecklistDto>
{
    public Guid TaskId { get; set; }

    /// <summary>Respuesta serializada del formulario, validada contra el snapshot.</summary>
    public string ResponseJson { get; set; } = "{}";

    /// <summary>
    /// Versión que el cliente leyó, decodificada del header <c>If-Match</c>.
    /// <c>null</c> = sin precondition (llamadas internas); el endpoint exige el header
    /// antes de llegar acá.
    /// </summary>
    [JsonIgnore]
    public byte[]? ExpectedRowVersion { get; set; }
}

public class SubmitTaskChecklistCommandHandler : IRequestHandler<SubmitTaskChecklistCommand, TaskChecklistDto>
{
    private readonly ITenantDbContext _db;
    private readonly ICurrentUser _currentUser;

    public SubmitTaskChecklistCommandHandler(ITenantDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task<TaskChecklistDto> Handle(SubmitTaskChecklistCommand request, CancellationToken cancellationToken)
    {
        var checklist = await _db.TaskChecklists
            .FirstOrDefaultAsync(c => c.WorkTaskId == request.TaskId, cancellationToken);

        if (checklist is null)
        {
            var taskExists = await _db.WorkTasks
                .AsNoTracking()
                .AnyAsync(t => t.Id == request.TaskId, cancellationToken);

            throw new NotFoundException(taskExists
                ? "La tarea no tiene checklist."
                : "Tarea no encontrada.");
        }

        // Misma regla que en el estado de la tarea: el rowversion de EF cubre la
        // ventana leer-modificar-escribir del handler, no el caso real de un técnico
        // que envió el formulario hace horas desde una tablet sin red.
        if (request.ExpectedRowVersion is { Length: > 0 }
            && !checklist.RowVersion.AsSpan().SequenceEqual(request.ExpectedRowVersion))
        {
            throw new ConcurrencyException(
                "El checklist fue modificado por otra persona.",
                currentState: checklist.State,
                currentETag: RowVersionToken.ToToken(checklist.RowVersion));
        }

        var errors = await TaskChecklistValidator.ValidateAsync(
            checklist.SchemaJson,
            request.ResponseJson,
            cancellationToken);

        if (errors.Count > 0)
        {
            throw new ChecklistValidationException(errors);
        }

        TaskChecklistValidator.TryCanonicalizeObject(request.ResponseJson, out var canonical, out _);

        var now = DateTime.UtcNow;
        checklist.ResponseJson = canonical!;
        checklist.State = TaskChecklistStates.Submitted;
        checklist.Version++;
        checklist.SubmittedAt = now;
        checklist.SubmittedByUserId = _currentUser.Id;
        checklist.UpdatedAt = now;

        await _db.SaveChangesAsync(cancellationToken);

        // Después del UPDATE, SQL Server refresca el rowversion en la entidad: el ETag
        // que se devuelve ya es el de la versión que quedó guardada, así que el cliente
        // puede seguir enviando sin releer.
        return new TaskChecklistDto
        {
            TaskId = checklist.WorkTaskId,
            SchemaJson = checklist.SchemaJson,
            UiSchemaJson = checklist.UiSchemaJson,
            ResponseJson = checklist.ResponseJson,
            State = checklist.State,
            SubmittedAt = checklist.SubmittedAt,
            Version = checklist.Version,
            ETag = RowVersionToken.ToToken(checklist.RowVersion),
        };
    }
}
