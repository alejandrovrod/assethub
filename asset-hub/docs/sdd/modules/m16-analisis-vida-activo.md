# M16 — Análisis de vida del activo

Analítica por activo y global del tenant: costo acumulado (órdenes de mantenimiento), historial de intervenciones, evolución del `conditionIndex`, proyección simple de vida útil y endpoints de dashboard (activos por estado, incidencias por prioridad, cumplimiento de tareas).

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-16.1 | Lectura | Consulta costo acumulado de un activo (TCO, sumando cost_entries) incluyendo labor, parts, downtime |
| CU-16.2 | Lectura | Consulta línea temporal de intervenciones del activo (órdenes, incidencias, eventos de ciclo de vida) |
| CU-16.3 | Lectura | Consulta evolución del `conditionIndex` a lo largo del tiempo |
| CU-16.4 | Lectura | Ve proyección simple de vida útil (regresión sobre `conditionIndex` vs. tiempo) |
| CU-16.5 | Lectura | Dashboard: métricas avanzadas de confiabilidad (MTBF, MTTR_restore, MTTR_repair) y estados |
| CU-16.6 | Lectura | Dashboard: incidencias por prioridad y estado |
| CU-16.7 | Lectura | Dashboard: cumplimiento de tareas (% a tiempo vs. vencidas SLA) |
| CU-16.8 | Gestor | Exporta reportes (CSV) de costos e intervenciones |

## Reglas de negocio

- RN-16.1: Todo es de solo lectura y tenant-scoped (R1, R2); los agregados se calculan server-side con filtro de tenant y RLS activa.
- RN-16.2: Costo acumulado (TCO) = Σ(`CostEntry.Amount`) del activo. Permite anualizar costos en base a los días de antigüedad del activo.
- RN-16.3: La evolución de `conditionIndex` se alimenta de auditoría/eventos; nunca se recalcula mutando el activo.
- RN-16.4: Proyección de vida útil = regresión lineal simple; con < 3 puntos se devuelve "datos insuficientes".
- RN-16.5: Dashboards cacheados por tenant (p.ej. 60 s) para no golpear OLTP.
- RN-16.6: Toda métrica respeta soft-delete: excluye entidades `IsDeleted`.
- RN-16.7: Permiso de lectura (`reports.read` o rol Lectura).
- RN-16.8: MTBF promedia fechas de fallas consecutivas; MTTR promedia resolución de correctivas. Priorizan fechas físicas sobre administrativas.

## Criterios de aceptación

- CA-16.1: Given activo con 2 órdenes verificadas (100+50 y 200), When GET `/assets/{id}/costs`, Then total = 350.
- CA-16.2: Given modo `includeSubtree=true` con hijo que tiene 80 en órdenes, When GET costs, Then total incluye los 80.
- CA-16.3: Given activo con 3 intervenciones, When GET timeline, Then eventos ordenados por fecha UTC con tipo y enlace.
- CA-16.4: Given 4 mediciones de conditionIndex decrecientes, When GET projection, Then fecha estimada de fin de vida y pendiente de degradación.
- CA-16.5: Given solo 2 mediciones, When GET projection, Then 200 con `projection=null` y motivo "datos insuficientes".
- CA-16.6: Given 10 activos (6 operativos, 3 en mantenimiento, 1 de baja), When GET dashboard activos-por-estado, Then esos conteos exactos.
- CA-16.7: Given incidencias de varios tenants, When GET dashboard, Then solo cuenta las del tenant actual (RLS).
- CA-16.8: Given 20 tareas (15 a tiempo, 5 vencidas), When GET cumplimiento, Then 75% de cumplimiento.
- CA-16.9: Given activo soft-deleted, When GET dashboard sin flag, Then no aparece en los conteos.
