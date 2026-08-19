# M11 — Incidencias y prevención

Gestión de incidencias sobre activos (reporte con foto/geo, triaje, ciclo de estados, conversión a orden de mantenimiento) y planes preventivos por calendario (cron/intervalo) o condición (`conditionIndex`) con cálculo automático de `NextRunAt`.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-11.1 | Técnico/Gestor | Reporta incidencia sobre un activo con título, tipo, prioridad, fotos y geo |
| CU-11.2 | Gestor | Triage: asigna prioridad (catálogo) y pasa `reported`→`triaged` |
| CU-11.3 | Gestor | Convierte incidencia en orden de mantenimiento correctiva (M12) |
| CU-11.4 | Gestor | Cierra/cancela incidencia resuelta; queda `ResolvedAt` |
| CU-11.5 | Gestor | Crea plan preventivo por calendario (`CronExpression` o `IntervalDays`) sobre template o activo |
| CU-11.6 | Gestor | Crea plan preventivo por condición (`ConditionRuleJson`, p.ej. `conditionIndex < 40`) |
| CU-11.7 | Sistema | Job calcula `NextRunAt` y genera orden preventiva/tarea al vencerse (M12/M14) |
| CU-11.8 | Lectura | Lista incidencias por estado, prioridad, activo |

## Reglas de negocio

- RN-11.1: Tenant-scoped (R1, R2); tipos y prioridades vienen de catálogos (M5), nunca hardcodeados.
- RN-11.2: Máquina de estados: `reported`→`triaged`→`assigned`→`in_progress`→`resolved`→`closed`; `cancelled` desde cualquiera. Transiciones inválidas → 409.
  - *Automatización:* Cuando una Orden de Mantenimiento hija se completa (`done`), la incidencia asociada pasará automáticamente a `resolved`.
- RN-11.3: Al convertir a orden, la incidencia queda enlazada (`MaintenanceOrders.IncidentId`) y pasa a `assigned`/`in_progress`.
- RN-11.4: Un plan preventivo apunta a `TemplateId` (aplica a todos sus activos) o a `AssetId` específico, nunca a ambos.
- RN-11.5: `NextRunAt` (UTC, R5) se calcula al crear/actualizar el plan y tras cada ejecución; cron inválido → 400.
- RN-11.6: Planes por condición se evalúan cuando cambia `ConditionIndex` de un activo (M8) o en job periódico.
- RN-11.7: La generación automática es idempotente: no crea duplicados para el mismo plan y período.
- RN-11.8: Mutaciones auditadas (R3); permisos `incidents.manage`, `preventive-plans.manage`.

## Criterios de aceptación

- CA-11.1: Given activo válido y foto, When POST incidencia, Then 201 con estado `reported`, adjuntos y geo persistidos.
- CA-11.1b: En el panel de detalles de la incidencia de la interfaz gráfica, la sección de **Adjuntos no debe mostrarse** (los adjuntos de progreso se manejarán desde las tareas de mantenimiento).
- CA-11.2: Given prioridad de catálogo inexistente, When POST, Then 400 con detalle.
- CA-11.3: Given incidencia `reported`, When se intenta pasar a `resolved` directo, Then 409 por transición inválida.
- CA-11.4: Given incidencia `triaged`, When convertir a orden, Then existe `MaintenanceOrders` con `Kind=corrective` e `IncidentId` enlazado.
- CA-11.5: Given plan con `IntervalDays=30` creado el 1 de enero, When se guarda, Then `NextRunAt` = 31 de enero UTC.
- CA-11.6: Given `CronExpression` inválido, When POST plan, Then 400.
- CA-11.7: Given plan por condición `conditionIndex < 40`, When un activo baja a 35, Then se genera orden/tarea preventiva una sola vez.
- CA-11.8: Given el job ejecutado dos veces en el mismo período, When corre la segunda, Then no crea duplicados.
- CA-11.9: Given incidencia `resolved`, When se cierra, Then `ResolvedAt`/`closed` persistidos en UTC.
