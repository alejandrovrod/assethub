# Data Model: Dashboard de Confiabilidad

El modelo central introduce la tabla `cost_entries` en el esquema del Tenant, desvinculando la lógica de costos del ciclo de vida estricto de una orden de trabajo.

## `CostEntry`

Pertenece a `AssetHub.Domain.Analytics` (o equivalente).

| Campo | Tipo | Nulo | Índice/Clave |
|---|---|---|---|
| `Id` | `Guid` | No | PK |
| `TenantId` | `Guid` | No | IX (Global Query Filter) |
| `AssetId` | `Guid?` | Sí | IX, FK -> `Assets` |
| `IncidentId` | `Guid?` | Sí | FK -> `Incidents` |
| `WorkOrderId`| `Guid?` | Sí | FK -> `MaintenanceOrders`|
| `CostType` | `string` | No | Enum (labor, parts, downtime, external_services, penalty, other) |
| `Amount` | `decimal(18,4)`| No | |
| `Currency` | `string(3)` | No | |
| `OccurredAt` | `DateTime` | No | UTC Timestamp |
| `IsEstimated`| `bool` | No | |
| Auditoría | (Audit) | - | `CreatedBy`, `CreatedAt`, etc. |

## Modificaciones a tablas existentes
Ninguna tabla existente sufre mutaciones. Las métricas de MTBF y MTTR se calculan de manera derivativa a través de consultas analíticas (Queries) hacia `MaintenanceOrders`.
