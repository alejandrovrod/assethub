# M20 — Inventario y Almacenes V1

**Estado actual**: Especificado V1  
**Propósito**: controlar existencias opcionales por tenant y registrar consumo de materiales de mantenimiento sin mezclar stock con el BOM técnico.

## Modelo de dominio

- `TenantInventorySettings`: habilitación y modo `external`, `internal` o `hybrid`.
- `Warehouse`: almacén tenant-scoped con código, nombre y ubicación sugerida informativa.
- `StockBalance`: saldo agregado por `(TenantId, WarehouseId, CatalogItemId)`, con cantidad, mínimo y costo promedio.
- `InventoryTransaction`: ingreso, salida, ajuste o reversión; estados `Draft`, `Posted`, `Reversed`.
- `MaintenancePart`: entidad existente extendida con `WarehouseId?`, `InventoryTransactionId?`, `SourceType`, `ExternalSupplierName?` y `ExternalReference?`.

No hay saldo por bin/estante, reservas, conversiones ni entidad proveedor.

## Reglas principales

1. El inventario es opcional por tenant y sólo acepta los tres modos definidos.
2. `external` guarda consumo y costo real sin movimiento de stock.
3. `internal` consume un almacén al momento real y publica una salida.
4. `hybrid` permite líneas internas y externas en la misma orden.
5. El saldo nunca puede ser negativo; un ajuste negativo sólo procede si el resultado es `>= 0`.
6. Los ajustes no tienen aprobación V1, pero requieren permiso, razón, usuario y timestamp UTC.
7. Las transacciones publicadas son inmutables; se corrigen con reversión/compensación.
8. El costo de ingreso usa promedio ponderado; la salida congela el promedio vigente.
9. `AssetMaterial` sigue siendo composición técnica/recomendación y no origina sourcing.
10. Tenant isolation, soft delete, auditoría, UTC y problem+json son obligatorios.

## API resumida

Base `/api/v1`:

- `GET/PUT /inventory/settings`
- `GET/POST/PUT/DELETE /inventory/warehouses`
- `GET /inventory/stock`
- `GET /inventory/transactions`
- `POST /inventory/receipts`
- `POST /inventory/adjustments`
- `POST /inventory/transactions/{id}/reverse`
- Extensión de `POST /maintenance-orders/{id}/parts` y `POST /maintenance-orders/{id}/consume`.

Las mutaciones usan `Idempotency-Key`; repetición idéntica devuelve el resultado original y payload distinto devuelve `409`.

## Integraciones

- **M5 Catálogos**: aporta `CatalogItem` y su unidad base.
- **M12/Mantenimiento**: `MaintenanceOrder` y `MaintenancePart` registran consumos.
- **M19 Materiales de activos**: sólo sugiere artículos; no mueve stock.
- **Persistencia**: `TenantDbContext`, filtros globales, FKs restrict, índices tenant-scoped y migración compatible.
- **Frontend**: configuración, almacenes, stock, transacciones, ajustes y editor de materiales de órdenes.

## Resumen UI

La UI ofrece configuración de modo, listado/form-sheet de almacenes, stock con alerta de mínimo, historial inmutable de transacciones, ajustes autorizados y materiales de orden con origen interno/externo. Una orden híbrida muestra ambos tipos de línea. Los controles no autorizados no se presentan y los errores se muestran como problem details accionables.

## Fuera de alcance

Compras, entidad proveedor, lotes, vencimientos, seriales, reservas, conversión de unidades, contabilidad y operación offline.

## Criterios de aceptación

- **CA-INV-001**: No se acepta consumo o ajuste que produzca saldo negativo.
- **CA-INV-002**: La idempotencia evita transacciones duplicadas.
- **CA-INV-003**: Tenant B no puede leer ni mutar stock de Tenant A.
- **CA-INV-004**: Un tenant externo registra costo real sin alterar saldo.
- **CA-INV-005**: Una orden híbrida procesa líneas internas y externas juntas y de forma atómica.
- **CA-INV-006**: Las partes históricas sin campos de inventario siguen siendo consultables.
- **CA-INV-007**: El costo promedio, la salida congelada y la reversión son auditables.
