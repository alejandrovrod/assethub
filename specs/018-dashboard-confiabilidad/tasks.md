# Tasks: Dashboard de Confiabilidad

## Preparación
- [x] Backend: Generar enum `CostType`.
- [x] Backend: Añadir entidad `CostEntry` al Dominio.
- [x] Backend: Modificar `TenantDbContext` (DbSet, Configuración, Filtros de Tenant).
- [x] Backend: Generar migración EF Core y script SQL de migración. (NOTA: decisión de implementación — se agregaron columnas `FailureOccurredAt`/`RepairStartedAt` a `MaintenanceOrders` para soportar DEC-001/DEC-002; ver spec.md)

## Lógica y Endpoints
- [x] Backend: Construir el handler `GetAssetReliabilityMetricsQueryHandler` aplicando coalescencia para `failure_start` y `repair_start`.
- [x] Backend: Construir el handler `GetAssetTCOQueryHandler` con lógica de anualización.
- [x] Backend: Modificar `AnalyticsController` con rutas `api/v1/analytics/assets/{id}/reliability` y `api/v1/analytics/assets/{id}/tco`. Agregar Caché (60s).
- [x] Backend: Escribir unit tests para probar la prioridad de fechas (DEC-001 y DEC-002).

## Interfaz de Usuario
- [x] Frontend: Actualizar enrutamiento en `/dashboard` para soportar react-router parametrizado (`/:assetId`).
- [x] Frontend: Implementar `analytics.service.ts` para conectar con la API.
- [x] Frontend: Diseñar y codear `ReliabilityMetricsCard.tsx`.
- [x] Frontend: Diseñar y codear `TCOBreakdownChart.tsx`.
- [x] Frontend: Asegurar que se visualiza mensaje de "Datos Insuficientes" o "Proyectado" según las validaciones de años de operación.
