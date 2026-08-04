# M15 — Seguimiento de tareas

Ejecución y seguimiento: cambios de estado con historial (`TaskStatusHistory`), evidencias (foto, firma, nota, geocheck), comentarios, SLA por prioridad con vencimiento y vistas Kanban/calendario.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-15.1 | Técnico | Cambia estado de su tarea (`todo`→`in_progress`→`review`→`done`) |
| CU-15.2 | Sistema | Registra cada cambio en `TaskStatusHistory` (from/to, usuario, UTC) |
| CU-15.3 | Técnico | Sube evidencia: foto, firma, nota o geocheck (coordenadas del dispositivo) |
| CU-15.4 | Gestor/Técnico | Comenta en la tarea (`TaskComments`) |
| CU-15.5 | Sistema | Calcula vencimiento SLA según prioridad y marca tareas vencidas |
| CU-15.6 | Gestor | Visualiza tablero Kanban por estado y arrastra tarjetas |
| CU-15.7 | Lectura | Visualiza calendario por `DueAt`/asignado |
| CU-15.8 | Gestor | Reabre tarea en `review` que no pasa validación |

## Reglas de negocio

- RN-15.1: Tenant-scoped (R1); máquina de estados: `backlog`→`todo`→`in_progress`→(`blocked`)→`review`→`done`; `cancelled` desde cualquiera. Inválida → 409.
- RN-15.2: Todo cambio de estado genera `TaskStatusHistory` y actualiza `StartedAt`/`CompletedAt` cuando aplica (UTC, R5).
- RN-15.3: Evidencias: `geocheck` exige coordenadas (`Geo geography`); `photo` exige `BlobUri`; se valida tipo/tamaño. La evidencia es inmutable una vez subida.
- RN-15.4: SLA: cada prioridad del catálogo define horas de resolución (metadata del item); si `now > ReportedAt/CreatedAt + SLA` y la tarea no está `done`, queda marcada como vencida y aparece en dashboards (M16).
- RN-15.5: Solo el asignado, un líder de su equipo o Gestor puede cambiar estado; permisos `tasks.execute` / `tasks.manage`.
- RN-15.6: Kanban usa el estado como columna; los movimientos inválidos se rechazan en backend aunque el drag&drop los permita en UI.
- RN-15.7: Comentarios y evidencias auditados (R3); comentarios editables solo por su autor.

## Criterios de aceptación

- CA-15.1: Given tarea `todo` asignada al Técnico, When pasa a `in_progress`, Then 200, `StartedAt` UTC y fila en `TaskStatusHistory`.
- CA-15.2: Given tarea `todo`, When salto a `done` directo, Then 409 por transición inválida.
- CA-15.3: Given técnico no asignado ni líder, When cambia estado, Then 403.
- CA-15.4: Given evidencia `geocheck` sin coordenadas, When POST, Then 400 indicando geo requerida.
- CA-15.5: Given evidencia `photo` de 2 MB, When POST, Then 201 con `BlobUri` y `CapturedAt` UTC.
- CA-15.6: Given prioridad "Alta" con SLA 24 h y tarea creada hace 30 h en `in_progress`, When GET lista, Then la tarea aparece como vencida.
- CA-15.7: Given tarea `review`, When Gestor reabre, Then vuelve a `in_progress` con historial registrado.
- CA-15.8: Given 20 tareas, When GET kanban, Then agrupadas por estado y solo del tenant actual.
- CA-15.9: Given comentario de otro usuario, When PUT/DELETE, Then 403.
