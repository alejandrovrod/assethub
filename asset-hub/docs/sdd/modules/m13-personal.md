# M13 — Personal y equipos

Gestión de empleados (con o sin usuario del sistema), equipos con líderes, habilidades y disponibilidad semanal. Base para asignaciones de órdenes (M12) y tareas (M14).

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-13.1 | TenantAdmin/Gestor | Crea empleado (nombre, contacto, oficio desde catálogo) |
| CU-13.2 | TenantAdmin | Vincula empleado a un usuario del sistema (`UserId`) para que ejecute tareas en la app |
| CU-13.3 | Gestor | Gestiona habilidades del empleado (`SkillsJson`, desde catálogo) |
| CU-13.4 | Gestor | Define disponibilidad semanal (`EmployeeAvailability`: día, horario, disponible) |
| CU-13.5 | Gestor | Crea equipo, añade miembros y designa líder (`IsLead`) |
| CU-13.6 | Gestor | Desactiva empleado (soft-delete); valida asignaciones abiertas |
| CU-13.7 | Lectura | Consulta disponibilidad y carga de un empleado/equipo |

## Reglas de negocio

- RN-13.1: Tenant-scoped (R1, R2); oficio y habilidades desde catálogos (M5), nunca hardcodeados.
- RN-13.2: `UserId` es opcional y único por tenant: un usuario ↔ un empleado; un empleado sin usuario no puede loguear.
- RN-13.3: Vincular `UserId` solo a usuarios del mismo tenant; email del empleado no tiene por qué coincidir con el del usuario.
- RN-13.4: Un equipo tiene al menos un miembro; puede tener varios líderes pero se recomienda uno (warning, no error).
- RN-13.5: Soft-delete (R8): un empleado con tareas/órdenes abiertas asignadas no se desactiva hasta reasignar → 409 con detalle.
- RN-13.6: Disponibilidad: `EndTime` > `StartTime`; solapes en el mismo día se permiten solo si se fusionan.
- RN-13.7: Mutaciones auditadas (R3); permiso `employees.manage`.

## Criterios de aceptación

- CA-13.1: Given oficio del catálogo `oficios`, When POST empleado, Then 201 con `RoleCatalogItemId` válido.
- CA-13.2: Given `UserId` de otro tenant, When vincular, Then 400/404 sin exponer que el usuario existe (R1).
- CA-13.3: Given usuario ya vinculado a otro empleado, When vincular, Then 409.
- CA-13.4: Given `EndTime` ≤ `StartTime`, When POST disponibilidad, Then 400.
- CA-13.5: Given empleado con 3 tareas abiertas, When desactivar, Then 409 listando las asignaciones pendientes.
- CA-13.6: Given empleado sin asignaciones, When desactivar, Then `IsActive=false` y soft-delete; no aparece en listas de asignación.
- CA-13.7: Given equipo con 4 miembros y 1 líder, When GET equipo, Then devuelve miembros con flag `IsLead`.
- CA-13.8: Given usuario sin `employees.manage`, When POST empleado, Then 403.
