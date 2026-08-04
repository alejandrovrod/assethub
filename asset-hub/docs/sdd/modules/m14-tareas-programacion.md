# M14 — Tareas y programación

Tareas operativas (`install`, `repair`, `inspect`, `remove`, `other`) ligadas a activo, orden de mantenimiento o incidencia; asignación a empleado/equipo, fechas de vencimiento y recurrencia con `TaskRecurrences`, incluida la generación automática desde planes preventivos (M11).

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-14.1 | Gestor | Crea tarea con tipo, prioridad (catálogo), descripción y `DueAt` |
| CU-14.2 | Gestor | Liga la tarea a un activo, orden e/o incidencia |
| CU-14.3 | Gestor | Asigna empleado o equipo respetando disponibilidad (M13) |
| CU-14.4 | Gestor | Define recurrencia (cron o `IntervalDays`, `EndsAt`, `TaskTemplateJson`) |
| CU-14.5 | Sistema | Job genera la siguiente instancia de tarea recurrente al vencerse `NextRunAt` |
| CU-14.6 | Sistema | Genera tareas `inspect`/`repair` desde planes preventivos (M11) |
| CU-14.7 | Lectura | Lista tareas filtradas por estado, asignado, activo, vencimiento |

## Reglas de negocio

- RN-14.1: Tenant-scoped (R1); tipos y prioridades desde catálogos (M5).
- RN-14.2: La tarea debe tener al menos un vínculo (activo, orden o incidencia) o marcarse como independiente explícitamente.
- RN-14.3: Asignación a empleado/equipo activo; se valida contra disponibilidad semanal y se avisa (warning) si hay solape, sin bloquear.
- RN-14.4: Recurrencia: `NextRunAt` (UTC, R5) se recalcula tras cada generación; se detiene al pasar `EndsAt`; cron inválido → 400.
- RN-14.5: La generación automática (recurrencia o plan preventivo) es idempotente por período: no duplica tareas.
- RN-14.6: Estado inicial `backlog`/`todo`; la máquina de estados y su historial viven en M15.
- RN-14.7: Mutaciones auditadas (R3); permisos `tasks.manage` / `tasks.assign`.

## Criterios de aceptación

- CA-14.1: Given datos válidos, When POST tarea, Then 201 con estado inicial `todo` y GUID v7.
- CA-14.2: Given `AssetId` de otro tenant, When POST, Then 404/400 sin filtrar datos (RLS).
- CA-14.3: Given empleado inactivo, When asignar, Then 400.
- CA-14.4: Given usuario sin `tasks.assign`, When PUT asignación, Then 403.
- CA-14.5: Given recurrencia `IntervalDays=7`, When el job corre tras `NextRunAt`, Then crea la siguiente instancia con los datos de `TaskTemplateJson` y recalcula `NextRunAt`.
- CA-14.6: Given recurrencia con `EndsAt` pasado, When el job corre, Then no genera más instancias.
- CA-14.7: Given el job ejecutado dos veces el mismo día, When corre la 2ª, Then no hay duplicados.
- CA-14.8: Given plan preventivo vencido, When el job corre, Then se genera tarea ligada al activo/plan una sola vez.
- CA-14.9: Given cron inválido en recurrencia, When POST, Then 400.
