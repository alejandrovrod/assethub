# PWA Field App — Plan de Mejora Empresarial (Offline-First)

## Objetivo
Convertir la PWA de campo en una aplicación offline-first real que:
- Al tener conexión, cargue toda la información necesaria (tareas, incidencias, órdenes de trabajo asignadas al usuario).
- Permita propagar máquinas de estado (transiciones) offline con sincronización posterior.
- Renderice campos dinámicos de plantillas de activos.
- Sea funcional para técnicos de campo sin conexión.

## Estado Actual
- Sync engine usa stubs (pullFn/pushFn no-op). ✅ Corregido parcialmente (HttpClient real + pullDelta).
- CORS bloqueaba preflight (redirect HTTPS). ✅ Corregido (UseHttpsRedirection solo en prod).
- API base URL incorrecta (5000 vs 5168). ✅ Corregida.
- No se renderizan campos dinámicos de plantillas. ✅ Parcialmente corregido (propertiesJson).
- No hay carga inicial de datos asignados al usuario.
- Máquina de estados de tareas no está conectada a la UI de transición.

## Fases

### Fase A — Conexión Real (Prioridad Alta)
1. **A1**: Verificar que pullDelta funcione con endpoints reales (`/api/v1/tasks/changes`, etc.)
   - Validar formato de respuesta del backend (DeltaResponse con data + nextCursor)
   - Ajustar mapeo de campos si hay diferencias (snake_case vs camelCase)
2. **A2**: Carga inicial al login — después de autenticarse, disparar sync completo (pull all resources)
3. **A3**: Token refresh — implementar refreshToken en HttpClient usando session store
4. **A4**: Filtrado por usuario asignado — el pull debe traer solo tareas/incidentes/OT asignadas al técnico

### Fase B — Máquina de Estados (Prioridad Alta)
5. **B1**: Conectar TaskTransitionSheet a los comandos start/pause/complete (ya existen)
6. **B2**: Implementar transiciones de incidencias (cambiar estado: open → in_progress → resolved → closed)
7. **B3**: Implementar transiciones de órdenes de trabajo (si existen en backend)
8. **B4**: Validar transiciones permitidas por estado actual (no permitir completar si no está en progreso)
9. **B5**: Propagación offline — encolar transición en outbox, aplicar localmente, sincronizar cuando haya red

### Fase C — Campos Dinámicos (Prioridad Media)
10. **C1**: Renderizar schemaJson de activos (campos de plantilla) en detalle de activo
11. **C2**: Formulario de captura de evidencia con campos dinámicos (RJSF ya instalado)
12. **C3**: Formulario de checklist con campos dinámicos (ChecklistForm ya usa RJSF)
13. **C4**: Validación de campos requeridos offline

### Fase D — UX de Campo (Prioridad Media)
14. **D1**: Pantalla de detalle de tarea (ya existe: tasks.$taskId.tsx) — completar con checklist, evidencias, transiciones
15. **D2**: Pantalla de detalle de incidencia — con timeline, evidencias, transiciones
16. **D3**: Pantalla de detalle de OT (si aplica)
17. **D4**: Búsqueda de activos por código/QR/barcode (scanner ya existe)
18. **D5**: Navegación por tabs (tareas, incidencias, activos, stock, sync)

### Fase E — Calidad y Robustez (Prioridad Baja)
19. **E1**: Tests E2E con Playwright (sync-resilience, offline-lease, conflict-resolution)
20. **E2**: Tests unitarios de comandos (start-task, complete-task, report-incident)
21. **E3**: Manejo de errores de red (retry, backoff, dead letter)
22. **E4**: Telemetría local (sync:log) — ya implementado

## Endpoints Backend Requeridos
- GET /api/v1/tasks/changes?after={cursor}&limit=100
- GET /api/v1/incidents/changes?after={cursor}&limit=100
- GET /api/v1/assets/changes?after={cursor}&limit=100
- GET /api/v1/stock/changes?after={cursor}&limit=100
- POST /api/v1/work-tasks/{id}/state (transiciones)
- POST /api/v1/incidents (crear)
- POST /api/v1/incidents/{id}/state (transiciones)
- POST /api/v1/inventory/consumptions
- POST /api/v1/media/upload

## Criterios de Éxito
- Técnico puede hacer login, ver sus tareas asignadas, y ejecutar transiciones offline.
- Al recuperar conexión, los cambios se sincronizan automáticamente.
- Los campos dinámicos de activos se renderizan correctamente.
- Conflictos se detectan y se muestran para resolución manual.
