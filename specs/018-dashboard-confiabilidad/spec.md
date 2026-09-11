# Especificación: Dashboard de Confiabilidad V1 (MVP)

**Feature Branch**: `018-dashboard-confiabilidad`  
**Estado**: Especificado V1

## Propósito

Agregar métricas gerenciales de confiabilidad (MTBF, MTTR_restore, MTTR_repair) y Costo Total de Propiedad (TCO) en un dashboard unificado por tenant, reemplazando el placeholder actual. Incluye un registro universal de costos (`CostEntries`) para desacoplar el origen del costo y permitir un cálculo flexible.

## Alcance

Incluye la vista global de dashboard (métricas de Nivel 0 de tenant) y la vista por activo. Cálculos de MTBF y MTTR ejecutados en tiempo real (Fase 1) basados en reglas de coalescencia de fechas. Inclusión de `CostEntry` para mano de obra, partes e inactividad.

No incluye cálculo recursivo masivo de subárboles profundos en tiempo real, ni snapshots históricos cronometrados (estos se delegan a la Fase 2).

## Actores y permisos

| Actor | Permisos mínimos |
|---|---|
| Administrador del tenant | `analytics.dashboard.read`, `costentries.read` |
| Gestor / Mantenimiento | `analytics.dashboard.read` |

## Decisiones de producto

- **MTBF**: Promedio entre `failure_start` consecutivos de órdenes correctivas. `CompletedAt` se usa como último recurso (fallback de baja confianza). Excluye preventivas.
- **MTTR**: Desdoblado en `MTTR_restore` (tiempo de negocio: de falla a completado) y `MTTR_repair` (tiempo de reparación: de inicio de trabajo a completado).
- **TCO**: Centralizado en `cost_entries`. Si un activo tiene menos de 30 días, el TCO Anualizado no se calcula (Datos Insuficientes). De 30 a 364 días, se proyecta.
- **Dashboard inicial**: Muestra el tenant entero (sin seleccionar un ID de activo específico) usando agregados directos para evitar cuellos de botella de performance.

## Requisitos funcionales

- **REQ-R-001**: La API `/api/v1/analytics/assets/{id}/reliability` calcula MTBF y MTTR(s). Si `id` es `global`, calcula a nivel tenant.
- **REQ-R-002**: La API `/api/v1/analytics/assets/{id}/tco` suma todos los costos asociados (CostEntries) y anualiza el valor.
- **REQ-R-003**: El Frontend inyecta componentes React (con React Router para la ruta `/:assetId`) que leen de la API.
- **REQ-R-004**: Toda fecha se unifica en UTC.

## Escenarios de aceptación

### SCN-R-001: MTBF correcto con fechas reales
**Given** un activo con 2 órdenes correctivas cuyas fechas `FailureOccurredAt` están separadas por 50 horas, **When** se consulta el endpoint de reliability, **Then** el MTBF retorna 50.

### SCN-R-002: Aislamiento Tenant
**Given** el tenant A, **When** intenta consultar los costos de un activo del tenant B, **Then** recibe `404 Not Found` (garantizado por el EF Core Query Filter).
