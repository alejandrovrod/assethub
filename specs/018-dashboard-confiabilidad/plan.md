# Plan de implementación: Dashboard de Confiabilidad V1

**Branch**: `018-dashboard-confiabilidad` | **Spec**: [spec.md](./spec.md)

## Resumen

Implementación de métricas MTBF, MTTR y TCO utilizando la arquitectura CQRS/MediatR actual, sumando un nuevo componente en la UI React (React Router) para el dashboard y la entidad `CostEntry` en el backend.

## Contexto técnico

- **Backend**: .NET 10, CQRS, EF Core. Se debe generar un Script SQL de Migración para aplicar en CI/CD.
- **Frontend**: React 19, TypeScript, React Router.
- **Precisión**: Costos usan `decimal(18,4)`.

## Estrategia técnica

1. Crear entidad `CostEntry` y enums de costos en `AssetHub.Domain`.
2. Registrar el `DbSet` en `TenantDbContext`, aplicar `OnModelCreating` (tenant isolation y Soft Delete filter si aplica) y crear migración. Exportar script SQL.
3. Crear `GetAssetReliabilityMetricsQuery` y `GetAssetTCOQuery` en `AssetHub.Application.Analytics.Queries`.
4. Modificar `AnalyticsController` para exponer las nuevas rutas GET. Usar `IMemoryCache` (60s).
5. Modificar frontend `dashboard/index.tsx` usando React Router.
6. Crear componentes `ReliabilityMetricsCard`, `TCOBreakdownChart`, y `AssetReliabilityTable`.
7. Escribir unit tests para las fórmulas y handlers.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Rendimiento (Full Subtree Scan) | En MVP, la vista global omite el árbol recursivo o usa `IncludeSubtree=false` hasta incorporar `AssetHierarchy/ClosureTable` optimizado (Fase 2). |
| División por cero en TCO Anualizado | Chequeo estricto de `age_days` > 0 y manejo especial para `< 30 días`. |
| Costos huérfanos | `TenantId` obligatorio y validación estricta al crear un `CostEntry`. |
