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

## Estado de implementación

### ✅ Implementado

| Capa | Componente | Estado |
|------|-----------|--------|
| Domain | `Employee` (FirstName, LastName, Email, Phone, RoleCatalogItemId, SkillsJson, UserId, IsActive, IsDeleted) | Completo |
| Domain | `Team` (Name, Description, IsDeleted, Members collection) | Completo |
| Domain | `TeamMember` (TeamId, EmployeeId, IsLead) | Completo |
| Domain | `EmployeeAvailability` (DayOfWeek, StartTime, EndTime, IsAvailable) | Completo |
| Application | `CreateEmployeeCommand` (con validación de RoleCatalogItemId) | Completo |
| Application | `CreateTeamCommand` (con validación de miembros y al menos 1 requerido) | Completo |
| Application | `DeactivateEmployeeCommand` | Completo |
| Application | `LinkUserToEmployeeCommand` | Completo |
| Application | `SetEmployeeAvailabilityCommand` | Completo |
| API | `EmployeesController` (POST, PATCH link-user, PUT availability, DELETE) | Parcial |
| API | `TeamsController` (POST) | Mínimo |
| Frontend | `staff/employees.tsx` — placeholder "Próximamente" | Placeholder |
| Frontend | `staff/teams.tsx` — placeholder "Próximamente" | Placeholder |

### ❌ Pendiente

| Capa | Componente | Prioridad |
|------|-----------|----------|
| Application | `GetEmployeesQuery` — listado paginado con búsqueda y filtro por estado | P1 |
| Application | `GetEmployeeByIdQuery` — detalle con skills, disponibilidad y equipos | P1 |
| Application | `UpdateEmployeeCommand` — editar nombre, email, teléfono, rol, skills | P1 |
| Application | `GetTeamsQuery` — listado con count de miembros | P1 |
| Application | `GetTeamByIdQuery` — detalle con miembros | P1 |
| Application | `UpdateTeamCommand` — editar nombre, descripción, agregar/quitar miembros | P1 |
| Application | `DeleteTeamCommand` — soft-delete con validación de asignaciones abiertas | P2 |
| API | `EmployeesController` — endpoints GET (listar, detalle) y PUT (editar) | P1 |
| API | `TeamsController` — endpoints GET, PUT, DELETE | P1 |
| Frontend | UI funcional de Empleados (tabla, búsqueda, modal CRUD) | P1 |
| Frontend | UI funcional de Equipos (tabla, gestión de miembros, modal CRUD) | P1 |

### Dependencias

- M5 (Catálogos): Oficios y habilidades se consumen desde catálogos asociados al módulo `staff`.
- M14 (Tareas) y M12 (Mantenimiento): Requieren empleados/equipos funcionales para asignación.
- La desactivación de empleado (CU-13.6) requiere consultar tareas/órdenes abiertas asignadas.
