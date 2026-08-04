# M12 — Mantenimiento

Órdenes de mantenimiento correctivas (desde incidencia) y preventivas (desde plan): aprobación, asignación a equipo/empleado, registro de costos (mano de obra + repuestos) y verificación de cierre.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-12.1 | Gestor | Crea orden correctiva manual o desde incidencia (M11) |
| CU-12.2 | Sistema | Crea orden preventiva desde `PreventivePlans` con su checklist |
| CU-12.3 | Gestor | Aprueba orden `draft`→`approved` |
| CU-12.4 | Gestor | Asigna equipo y/o empleado y programa `ScheduledStart/End` |
| CU-12.5 | Técnico | Registra avance y marca trabajo completado (`done`) |
| CU-12.6 | Gestor | Verifica el cierre (`verified`) o reabre |
| CU-12.7 | Técnico/Gestor | Registra mano de obra (`LaborCost`) y repuestos (`MaintenanceParts`) |
| CU-12.8 | Lectura | Consulta costo total de una orden y costos por activo (M16) |

## Reglas de negocio

- RN-12.1: Tenant-scoped (R1); módulo sujeto a plan (R4). `Kind` ∈ {`corrective`,`preventive`}.
- RN-12.2: Una orden preventiva lleva `PreventivePlanId`; una correctiva puede llevar `IncidentId`. Ambos NULL = orden manual.
- RN-12.3: Máquina de estados: `draft`→`approved`→`scheduled`→`in_progress`→`done`→`verified`; `cancelled` desde cualquiera antes de `done`. Inválida → 409.
- RN-12.4: Solo se puede asignar empleado/equipo activo (M13); `ScheduledEnd` ≥ `ScheduledStart`.
- RN-12.5: Costo total = `LaborCost` + Σ(`MaintenanceParts.Quantity × UnitCost`); los repuestos referencian items de catálogo (M5).
- RN-12.6: Cerrar (`verified`) registra `CompletedAt` UTC (R5) y genera evento en `AssetLifecycleEvents` (intervención).
- RN-12.7: Una orden `verified` es inmutable salvo SuperAdmin.
- RN-12.8: Mutaciones auditadas (R3); permisos `maintenance.manage` / `maintenance.execute`.

## Criterios de aceptación

- CA-12.1: Given orden `draft`, When aprobar, Then estado `approved` y auditoría registrada.
- CA-12.2: Given orden `draft`, When marcar `done` directo, Then 409.
- CA-12.3: Given empleado inactivo, When asignar, Then 400 indicando empleado no disponible.
- CA-12.4: Given `ScheduledEnd` anterior a `ScheduledStart`, When PUT, Then 400.
- CA-12.5: Given orden con `LaborCost=100` y 2 repuestos de 25 (×3 unidades), When GET, Then costo total = 250.
- CA-12.6: Given repuesto con `CatalogItemId` inexistente, When POST part, Then 400.
- CA-12.7: Given orden `done`, When Gestor verifica, Then `verified`, `CompletedAt` en UTC y evento de ciclo de vida del activo creado.
- CA-12.8: Given orden `verified`, When PUT de costos, Then 409 por inmutable.
- CA-12.9: Given plan sin módulo mantenimiento, When POST orden, Then 403.
