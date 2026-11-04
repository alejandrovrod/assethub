using System;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Field;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tasks.Events;
using AssetHub.Application.Tasks.Helpers;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Commands;

public class ChangeWorkTaskStateCommand : IRequest<Unit>
{
    public Guid WorkTaskId { get; set; }

    [JsonPropertyName("state")]
    public string NewState { get; set; } = string.Empty;

    /// <summary>
    /// Versión que el cliente leyó, decodificada del header <c>If-Match</c>.
    /// <c>null</c> significa "sin precondition" (llamadas internas, como el scheduler de
    /// planes preventivos, o <c>If-Match: *</c>), no "cualquier versión vale para un
    /// cliente HTTP": el filtro del endpoint exige el header antes de llegar acá.
    /// </summary>
    [JsonIgnore]
    public byte[]? ExpectedRowVersion { get; set; }
}

public class ChangeWorkTaskStateCommandHandler : IRequestHandler<ChangeWorkTaskStateCommand, Unit>
{
    private readonly ITenantDbContext _db;
    private readonly ICurrentUser _currentUser;
    private readonly ITenantResolver _tenantResolver;
    private readonly IMediator _mediator;
    private readonly FieldTaskAccess _access;

    public ChangeWorkTaskStateCommandHandler(
        ITenantDbContext db,
        ICurrentUser currentUser,
        ITenantResolver tenantResolver,
        IMediator mediator,
        FieldTaskAccess access)
    {
        _db = db;
        _currentUser = currentUser;
        _tenantResolver = tenantResolver;
        _mediator = mediator;
        _access = access;
    }

    /// <summary>
    /// Reloj del handler. Es virtual para que los tests puedan mover el tiempo y verificar
    /// la aritmética de pausas (el mismo patrón que <c>TenantDbContext.UtcNow</c>).
    /// </summary>
    protected virtual DateTime UtcNow => DateTime.UtcNow;

    public async Task<Unit> Handle(ChangeWorkTaskStateCommand request, CancellationToken cancellationToken)
    {
        var task = await _db.WorkTasks.FirstOrDefaultAsync(t => t.Id == request.WorkTaskId, cancellationToken);
        if (task == null)
            throw new ArgumentException("Tarea no encontrada");

        // Autorización antes de precondition: un 412 sobre una tarea ajena le confirmaría
        // al cliente que la tarea existe y cambió, que es justo lo que el 403 evita.
        await _access.EnsureCanChangeStateAsync(task, request.NewState, cancellationToken);

        // Concurrencia optimista contra la versión que vio el cliente.
        // El rowversion de EF sólo cubre la ventana leer-modificar-escribir del propio
        // handler (milisegundos); el conflicto real es "el cliente leyó hace una hora,
        // desde la tablet, y otro usuario ya cambió la tarea". Ese caso sólo se detecta
        // comparando contra lo que el cliente declara haber leído.
        if (request.ExpectedRowVersion is { Length: > 0 }
            && !task.RowVersion.AsSpan().SequenceEqual(request.ExpectedRowVersion))
        {
            throw new ConcurrencyException(
                $"La tarea '{task.Title}' fue modificada por otra persona.",
                currentState: task.State,
                allowedTransitions: TaskStateTransitionValidator.GetAllowedTransitions(task.State),
                currentETag: RowVersionToken.ToToken(task.RowVersion));
        }

        var oldState = task.State;
        var newState = request.NewState;

        if (oldState == newState)
            return Unit.Value;

        if (!TaskStateTransitionValidator.IsValidTransition(oldState, newState))
        {
            // 409, no 422: el estado actual y el pedido son válidos por separado; lo que no
            // existe es esa arista en la máquina de estados. Va con allowedTransitions para
            // que el cliente offline se corrija solo.
            throw new InvalidTransitionException(
                oldState,
                newState,
                currentState: oldState,
                allowedTransitions: TaskStateTransitionValidator.GetAllowedTransitions(oldState));
        }

        var now = UtcNow;

        // Cerrar la pausa abierta antes de aplicar el nuevo estado. Cubre las tres salidas
        // de `paused` (in_progress, done y cancelled): si sólo se cerrara al reanudar,
        // completar una tarea pausada perdería el último tramo en TotalPausedSeconds y la
        // duración neta lo contaría como trabajo.
        if (oldState == WorkTaskStates.Paused)
        {
            if (task.PausedAt is { } pausedAt)
            {
                task.TotalPausedSeconds += TaskTiming.ElapsedSeconds(pausedAt, now);
            }

            task.PausedAt = null;

            if (newState == WorkTaskStates.InProgress)
            {
                task.ResumedAt = now;
            }
        }

        if (oldState == WorkTaskStates.Todo && newState == WorkTaskStates.InProgress)
        {
            task.StartedAt = now;
        }
        else if (newState == WorkTaskStates.Done)
        {
            task.CompletedAt = now;

            // Una tarea sembrada directamente en `in_progress` (imports, datos legados)
            // no tiene StartedAt. Sin este fallback su duración sería nula y desaparecería
            // de las métricas en vez de contar como cero trabajo.
            task.StartedAt ??= now;
        }
        else if (newState == WorkTaskStates.Paused)
        {
            // Volver a pausar sin reanudar (no es posible desde `paused` porque esa arista
            // no existe) reinicia el tramo abierto; lo acumulado ya está en TotalPausedSeconds.
            task.PausedAt = now;
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
            ChangedAt = now
        });

        await _db.SaveChangesAsync(cancellationToken);

        await _mediator.Publish(new WorkTaskStateChangedEvent(
            task.Id,
            task.TenantId,
            oldState,
            newState,
            task.AssetId,
            task.IncidentId,
            task.MaintenanceOrderId,
            task.PreventivePlanId
        ), cancellationToken);

        return Unit.Value;
    }
}
