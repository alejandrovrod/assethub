using System.Collections.Generic;

namespace AssetHub.Domain.Security;

/// <summary>
/// Rol de campo (022 §10, B8). Única fuente de verdad de su nombre y de sus permisos: la
/// usan el seeder, los handlers que aplican restricciones por recurso y el test de matriz.
///
/// **Mapeo desde §10**: el plan nombra tres permisos que no existen en el catálogo real
/// (`tasks:write`, `incidents:write`, `media:write`). Se traducen a los códigos granulares
/// que el catálogo ya define, en vez de agregar una segunda taxonomía paralela que ningún
/// endpoint evalúa: `tasks:write` → <c>tasks:update</c> + <c>tasks:start</c> +
/// <c>tasks:complete</c> + <c>tasks:comment</c>; `incidents:write` → <c>incidents:read</c> +
/// <c>incidents:create</c> + <c>incidents:update</c> + <c>incidents:change-state</c>;
/// `media:write` → <c>tasks:evidence</c>. `inventory:consume` no existía y se agregó al
/// catálogo (T074): un consumo de material no es un ajuste de stock.
///
/// Lo que este rol **no** tiene es tan importante como lo que tiene: nada de
/// `tasks:delete`, `tasks:assign`, `tasks:cancel`, `roles:manage`, `users:manage`,
/// `employees:update`, `stock:adjust`, `inventory:configure` ni `maintenance:cancel`.
/// </summary>
public static class FieldTechnicianRole
{
    /// <summary>Nombre del rol. Es el que viaja como claim y el que verifica <c>FieldTaskAccess</c>.</summary>
    public const string Name = "field-technician";

    public const string Description = "Ejecución de tareas desde el cliente de campo (offline)";

    /// <summary>Permisos del rol, tal como se siembran en la matriz de cada tenant.</summary>
    public static readonly IReadOnlyList<string> Permissions = new[]
    {
        "tasks:read",
        "tasks:update",
        "tasks:start",
        "tasks:complete",
        "tasks:evidence",
        "tasks:comment",
        "task-status:read",

        "assets:read",

        "incidents:read",
        "incidents:create",
        "incidents:update",
        "incidents:change-state",

        "inventory:read",
        "inventory:consume",
        "stock:read",
        "warehouses:read",
    };
}
