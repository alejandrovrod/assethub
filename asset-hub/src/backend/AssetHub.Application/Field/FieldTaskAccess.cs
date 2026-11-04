using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Security;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Field;

/// <summary>
/// Reglas de visibilidad y operación del rol de campo (022 §10).
///
/// El plan es explícito en que estas restricciones van en los handlers y **no** en una
/// policy: dependen del recurso concreto ("¿esta tarea es tuya?"), y una policy de
/// autorización sólo ve el usuario y la ruta, no la fila. Una policy podría decir "tiene
/// <c>tasks:update</c>"; sólo el handler puede decir "tiene <c>tasks:update</c> **y** la
/// tarea está asignada a él".
///
/// El rol se consulta por nombre porque es un rol de catálogo: lo puede reasignar cada
/// tenant, pero su nombre es el contrato con el cliente de campo.
/// </summary>
public sealed class FieldTaskAccess
{
    /// <summary>La tarea no está asignada al técnico ni a un equipo del que forme parte.</summary>
    public const string TaskNotAssignedKey = "field_role_task_not_assigned";

    /// <summary>El rol de campo no puede cancelar tareas: cancelar es una decisión de backoffice.</summary>
    public const string CannotCancelKey = "field_role_cannot_cancel";

    /// <summary>El rol de campo no reasigna: la asignación la decide quien planifica.</summary>
    public const string CannotReassignKey = "field_role_cannot_reassign";

    private readonly ITenantDbContext _db;
    private readonly ICurrentUser _currentUser;

    public FieldTaskAccess(ITenantDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    /// <summary>
    /// <c>true</c> cuando el usuario tiene el rol de campo y por lo tanto está sujeto a las
    /// restricciones por recurso. Cualquier otro rol conserva el comportamiento previo.
    /// </summary>
    public bool IsRestricted => _currentUser.IsInRole(FieldTechnicianRole.Name);

    /// <summary>
    /// Indica si el usuario puede operar sobre <paramref name="task"/>.
    ///
    /// Un usuario no restringido siempre puede (compatibilidad con <c>apps/web</c>). Un
    /// técnico de campo sólo puede si la tarea está asignada a su <c>Employee</c> o a un
    /// equipo del que forma parte. Si el usuario no tiene ficha de empleado, se niega:
    /// "no sé quién sos" no es lo mismo que "sos dueño de todo".
    /// </summary>
    public async Task<bool> OwnsAsync(WorkTask task, CancellationToken cancellationToken)
    {
        if (!IsRestricted)
        {
            return true;
        }

        var employeeId = await FindEmployeeIdAsync(cancellationToken);
        if (employeeId is null)
        {
            return false;
        }

        if (task.AssignedEmployeeId == employeeId)
        {
            return true;
        }

        var empStr = employeeId.Value.ToString();
        if (!string.IsNullOrEmpty(task.PropertiesJson) && task.PropertiesJson.Contains(empStr, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (task.MaintenanceOrderId.HasValue)
        {
            var orderInfo = await _db.MaintenanceOrders
                .Where(o => o.Id == task.MaintenanceOrderId.Value)
                .Select(o => new { o.AssignedEmployeeId, o.PropertiesJson })
                .FirstOrDefaultAsync(cancellationToken);

            if (orderInfo != null)
            {
                if (orderInfo.AssignedEmployeeId == employeeId)
                {
                    return true;
                }
                if (!string.IsNullOrEmpty(orderInfo.PropertiesJson) && orderInfo.PropertiesJson.Contains(empStr, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }

        if (task.AssignedTeamId is not { } teamId)
        {
            return false;
        }

        return await _db.TeamMembers.AnyAsync(
            m => m.TeamId == teamId && m.EmployeeId == employeeId.Value,
            cancellationToken);
    }

    /// <summary>
    /// Lanza <see cref="UnauthorizedAccessException"/> (403) cuando el usuario es de campo y
    /// la tarea no es suya. El mensaje es una clave de recursos, no texto: el middleware la
    /// traduce.
    /// </summary>
    public async Task EnsureCanOperateAsync(
        WorkTask task,
        CancellationToken cancellationToken,
        string messageKey = TaskNotAssignedKey)
    {
        if (await OwnsAsync(task, cancellationToken))
        {
            return;
        }

        throw new UnauthorizedAccessException(messageKey);
    }

    /// <summary>
    /// Regla de transición para el rol de campo (022 §10): sólo tareas propias y nunca
    /// hacia <c>cancelled</c>. Cancelar es una decisión de backoffice —implica devolver la
    /// orden de mantenimiento, avisar al cliente, reprogramar—, no algo que se decide en
    /// una tablet sin conexión.
    ///
    /// El orden importa: primero la regla de la transición (vale para cualquier tarea) y
    /// después la de propiedad. Ambas son 403, pero el mensaje debe decirle al cliente
    /// offline cuál de las dos lo frenó.
    /// </summary>
    public async Task EnsureCanChangeStateAsync(
        WorkTask task,
        string newState,
        CancellationToken cancellationToken)
    {
        if (!IsRestricted)
        {
            return;
        }

        if (string.Equals(newState, WorkTaskStates.Cancelled, StringComparison.Ordinal))
        {
            throw new UnauthorizedAccessException(CannotCancelKey);
        }

        await EnsureCanOperateAsync(task, cancellationToken);
    }

    /// <summary>
    /// Regla de asignación (022 §10, T076): el rol de campo no reasigna. Reasignar mueve
    /// trabajo entre personas y equipos; el técnico puede rechazar o pausar, no repartir.
    /// </summary>
    public void EnsureCanReassign()
    {
        if (IsRestricted)
        {
            throw new UnauthorizedAccessException(CannotReassignKey);
        }
    }

    /// <summary>
    /// Ficha de empleado del usuario actual dentro del tenant. Se lee con
    /// <c>AsNoTracking</c> porque es una consulta de autorización, no una edición.
    /// </summary>
    private async Task<Guid?> FindEmployeeIdAsync(CancellationToken cancellationToken)
    {
        var userId = _currentUser.Id;
        if (userId is null)
        {
            return null;
        }

        return await _db.Employees
            .AsNoTracking()
            .Where(e => e.UserId == userId)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
