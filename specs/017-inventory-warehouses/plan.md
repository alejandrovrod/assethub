# Plan de implementación: Inventario y Almacenes V1

**Branch**: `017-inventory-warehouses` | **Fecha**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

## Resumen

Implementar inventario opcional por tenant con almacenes, saldos, transacciones inmutables y consumo integrado en `MaintenancePart`. El flujo será transaccional y síncrono en CQRS/MediatR; la UI React consumirá contratos REST versionados.

## Contexto técnico

- **Backend**: .NET 10, ASP.NET Core, CQRS/MediatR, EF Core, SQL Server.
- **Frontend**: React 19, TypeScript, React Query y patrones existentes.
- **Persistencia**: `TenantDbContext`, esquema `tenant`, filtros globales por `TenantId` y soft delete.
- **Identidad**: permisos existentes y usuario autenticado para auditoría.
- **Precisión**: cantidades nuevas `decimal(18,4)`; costos unitarios `decimal(18,4)`; totales `decimal(19,4)` como mínimo. Mantener redondeo explícito a 4 decimales antes de persistir.
- **Compatibilidad**: conservar `MaintenancePart.Quantity` actual y sus filas históricas; agregar los campos V1 sin exigir migración de datos antiguos.
- **Errores**: `application/problem+json`; `422` para invariantes de dominio, `409` para conflicto de idempotencia/versión cuando aplique.

## Constitution check

No hay principios ratificados en la constitución actual según el patrón de las specs cercanas. La propuesta cumple las convenciones vigentes:

- [x] Respeta capas `Application/`, `Domain/`, `Infrastructure/`, `Api/`.
- [x] Usa comandos/queries MediatR y configuración EF Core existente.
- [x] Mantiene tenant isolation, soft delete, auditoría y UTC.
- [x] Extiende `MaintenancePart` y no duplica el concepto de consumo.
- [x] Incluye pruebas de concurrencia, autorización, idempotencia y compatibilidad.

**Resultado**: PASS.

## Decisión estructural

```text
specs/017-inventory-warehouses/
├── spec.md
├── plan.md
├── data-model.md
├── quickstart.md
├── tasks.md
└── contracts/
    ├── api.md
    └── ui.md
```

En código, el módulo se distribuirá en dominios `Inventory`, comandos/queries de inventario y extensiones de mantenimiento. La implementación debe agregar `DbSet` y configuración en `TenantDbContext`, sin alterar módulos existentes fuera de las relaciones necesarias.

## Dependencias

- `CatalogItem` para artículo y unidad base.
- `MaintenanceOrder` y `MaintenancePart` para consumo.
- `User`/permisos y `AuditLog` para autorización y trazabilidad.
- `TenantDbContext` para filtros, índices y transacciones.
- Componentes de listado, detalle, form-sheet y problem details ya existentes.

## Estrategia técnica

1. Crear entidades y constantes de estado.
2. Configurar EF Core, índices, precisión, filtros y migración compatible.
3. Implementar servicio de posting atómico con promedio ponderado, bloqueo/concurrencia y idempotencia.
4. Integrar comandos de `MaintenancePart` para modos external/internal/hybrid.
5. Exponer rutas REST y problem details.
6. Construir UI de configuración, almacenes, stock, transacciones, ajustes y materiales de orden.
7. Validar con pruebas unitarias, integración de API, SQL/migración y flujos UI.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Dos consumos simultáneos dejan saldo negativo | Transacción SQL, concurrencia optimista y relectura/validación dentro de la misma transacción. |
| Reintento HTTP duplica una salida | Tabla/registro de idempotencia por tenant y clave; misma respuesta para repetición idéntica. |
| Cambiar `MaintenancePart` rompe históricos | Campos nullable, DTO tolerante y backfill no obligatorio. |
| Promedios divergen por redondeo | Decimal explícito, redondeo único a 4 decimales y pruebas de acumulación. |
| Bypass de tenant por ID directo | Query filters más predicado explícito en handlers y pruebas cross-tenant. |
| Reversión altera auditoría | Prohibir UPDATE/DELETE de Posted; sólo compensación y vínculo de reversión. |

## Estrategia de testing

- Unitarias: fórmula promedio, transiciones, validación por modo y saldo no negativo.
- Integración backend: posting, rollback, idempotencia, autorización, tenant isolation, migración y compatibilidad histórica.
- API: rutas, payloads, status codes y `problem+json`.
- Frontend: formularios por modo, estados de carga/error, alertas de mínimo y orden híbrida.
- Regresión: órdenes existentes con `MaintenancePart` sin campos nuevos.
