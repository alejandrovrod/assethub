---
description: "Define y refina el módulo opcional de Inventario y Almacenes de AssetHub, integrado con mantenimiento y abastecimiento externo, sin aplicar cambios automáticamente."
name: "Especificar inventario V1"
argument-hint: "Describe el contexto adicional del negocio o ejecutá la definición de Inventario V1"
---

Actuá como arquitecto de producto y especificaciones para AssetHub. Necesito definir una especificación precisa, verificable e implementable para el módulo **Inventario y Almacenes V1**.

Trabajá en modo propuesta: inspeccioná el repositorio, producí la especificación y no modifiques archivos ni afirmes que la funcionalidad fue implementada.

## Objetivo de negocio

Permitir que AssetHub controle existencias y costos cuando un tenant administra inventario propio, sin obligar a todos los negocios a utilizar almacenes. El módulo de mantenimiento debe seguir funcionando aunque Inventario esté desactivado.

## Modos operativos por tenant

El sistema debe soportar exactamente estos modos:

1. **Externo** (`external`):
   - Inventario desactivado.
   - Los materiales se registran como consumos externos.
   - No se crean movimientos ni saldos de stock.
   - Se registra cantidad, costo unitario, proveedor externo y referencia opcional.

2. **Interno** (`internal`):
   - Inventario activado.
   - Los materiales se consumen desde un almacén.
   - El consumo genera una salida de inventario.
   - El saldo se descuenta al momento real del consumo.

3. **Híbrido** (`hybrid`):
   - Inventario activado.
   - Cada línea de material puede ser interna o externa.
   - Una orden puede combinar ambos orígenes.

## Decisiones arquitectónicas cerradas para V1

- El saldo nunca puede quedar por debajo de cero.
- Se permiten ajustes positivos o negativos sin workflow previo de aprobación, siempre que el saldo resultante sea mayor o igual a cero.
- Todo ajuste genera una transacción inmutable con usuario, motivo y fecha.
- El saldo se controla únicamente a nivel de `Warehouse`.
- No existen saldos transaccionales por estante, pasillo, bin o ubicación en V1.
- La ubicación será sólo un texto informativo o ubicación sugerida; no participa en la identidad del saldo.
- No existen reservas de stock en V1.
- El stock se descuenta al consumir la pieza, no al crear ni programar la orden.
- Se utiliza una única unidad base definida en `CatalogItem`.
- No se implementan conversiones entre unidades.
- Los proveedores no son una entidad completa en V1; se almacenan `ExternalSupplierName` y `ExternalReference`.
- Se extiende `MaintenancePart` en lugar de crear una entidad paralela de consumo.
- `MaintenancePart.WarehouseId` es nullable.
- `MaintenancePart.InventoryTransactionId` es nullable.
- Ambos campos quedan vacíos para consumos externos.
- Los movimientos publicados son inmutables y se corrigen mediante reversión o ajuste compensatorio.
- El BOM de un activo sigue representando composición o recomendación técnica; no representa stock ni determina automáticamente el origen del material.

## Modelo esperado

Considerá como mínimo estas entidades:

### InventorySettings

- `Id`
- `TenantId`
- `Enabled`
- `OperatingMode`
- auditoría y fechas UTC

### Warehouse

- `Id`
- `TenantId`
- `Code`
- `Name`
- `Description`
- `SuggestedLocation?`
- `IsActive`
- soft-delete y auditoría

### StockBalance

- `Id`
- `TenantId`
- `WarehouseId`
- `CatalogItemId`
- `QuantityOnHand`
- `AverageUnitCost`
- fecha de actualización

Debe existir una restricción única por `TenantId + WarehouseId + CatalogItemId`.

### InventoryTransaction

- `Id`
- `TenantId`
- `WarehouseId`
- `CatalogItemId`
- `MaintenanceOrderId?`
- `Type`: `Receipt`, `Issue`, `Adjustment`, `Reversal`
- `Quantity`
- `UnitCost`
- `Reason`
- `CreatedBy`
- `CreatedAt`
- `PostedAt`
- `ReversalOfId?`
- `IdempotencyKey`

### MaintenancePart

Extender la entidad existente con:

- `WarehouseId?`
- `InventoryTransactionId?`
- `SourceType`: `internal` o `external`
- `ExternalSupplierName?`
- `ExternalReference?`

Preservar compatibilidad con registros históricos existentes.

## Integración con el repositorio

Inspeccioná antes de concluir:

- `docs/sdd/modules/m05-catalogos.md`
- `docs/sdd/modules/m12-mantenimiento.md`
- `docs/sdd/modules/m19-materiales-activos.md`
- `specs/006-maintenance-workflow-integration/spec.md`
- `src/backend/AssetHub.Domain/Maintenance/MaintenanceOrder.cs`
- `src/backend/AssetHub.Domain/Maintenance/MaintenancePart.cs`
- `src/backend/AssetHub.Domain/Catalogs/CatalogItem.cs`
- `src/backend/AssetHub.Infrastructure/Persistence/TenantDbContext.cs`
- políticas existentes de permisos, tenant isolation, soft-delete, auditoría y problem+json
- tests actuales de mantenimiento, materiales y multitenancy

Respetá los patrones existentes de .NET, EF Core, CQRS/MediatR, React/TypeScript, paginación, UTC y aislamiento por tenant.

## Requisitos que debe cubrir la especificación

- configuración del modo operativo por tenant
- almacenes y estado activo/inactivo
- artículos de catálogo aptos para inventario
- entradas, salidas, ajustes y reversiones
- saldos sólo a nivel almacén
- costo promedio ponderado
- prohibición de saldos negativos
- consumo interno y externo
- órdenes híbridas
- stock mínimo y alertas
- auditoría inmutable
- idempotencia
- concurrencia y transacciones atómicas
- migración de `MaintenancePart`
- compatibilidad con órdenes existentes
- permisos y aislamiento multi-tenant
- errores HTTP y problem+json
- filtros, paginación y consultas de historial
- estados vacíos y errores de frontend
- pruebas unitarias e integración

## Cálculo de costo promedio

Para entradas, documentá y verificá esta regla:

```text
NuevoCostoPromedio =
((StockAnterior * CostoPromedioAnterior) +
 (CantidadEntrada * CostoEntrada)) /
(StockAnterior + CantidadEntrada)
```

Las salidas utilizan el costo promedio vigente y congelan ese costo en `MaintenancePart` e `InventoryTransaction`. Los consumos externos conservan el costo unitario real informado y no modifican el saldo.

## API a especificar

Como mínimo, definí contratos para:

```text
GET/PUT  /api/v1/inventory/settings
GET/POST /api/v1/inventory/warehouses
PUT/DELETE /api/v1/inventory/warehouses/{id}
GET      /api/v1/inventory/stock
GET      /api/v1/inventory/stock/{catalogItemId}
GET      /api/v1/inventory/transactions
POST     /api/v1/inventory/transactions/receipts
POST     /api/v1/inventory/transactions/issues
POST     /api/v1/inventory/transactions/adjustments
POST     /api/v1/inventory/transactions/{id}/reverse
GET/POST/PUT/DELETE /api/v1/maintenance-orders/{orderId}/parts
```

Para cada contrato indicá permiso, request, response, validaciones, códigos HTTP, paginación, idempotencia y efectos transaccionales.

## Formato de salida obligatorio

### 1. Estado de refinamiento

Indicá ronda, estado (`ready`, `needs-decisions` o `blocked`), confianza y motivo.

### 2. Resumen ejecutivo

Explicá el problema, los tres modos operativos y el límite entre consumo y movimiento de inventario.

### 3. Alcance

Separá `Incluido`, `No incluido`, `Dependencias existentes` y `Compatibilidad histórica`.

### 4. Actores y permisos

Usá una tabla con actor, permiso, operación y alcance.

### 5. Requisitos

Usá identificadores estables `REQ-INV-001`, `REQ-INV-002`, etc. Clasificá cada requisito como funcional, no funcional, restricción o compatibilidad.

### 6. Reglas e invariantes

Usá identificadores `RULE-INV-001`, `RULE-INV-002`, etc. Incluí explícitamente la prohibición de saldo negativo y la inmutabilidad de transacciones.

### 7. Modelo de dominio y persistencia

Incluí campos, tipos, relaciones, índices únicos, precisión decimal, soft-delete, auditoría y migración de `MaintenancePart`.

### 8. Estados y transiciones

Describí `Draft`, `Posted` y `Reversed`, los efectos sobre saldo y el comportamiento ante reintentos.

### 9. Costo promedio

Incluí fórmula, ejemplos, redondeo, precisión y comportamiento de entradas, salidas, ajustes, reversiones y consumos externos.

### 10. Contratos API

Documentá endpoints, comandos, consultas, DTOs, permisos, errores HTTP, paginación, filtros e idempotencia.

### 11. Experiencia de usuario

Describí configuración por tenant, listado de almacenes, stock, movimientos, ajustes, consumo en órdenes, modo híbrido, alertas y estados vacíos.

### 12. Escenarios de aceptación

Usá identificadores `SCN-INV-001` y formato Given/When/Then. Incluí como mínimo:

- tenant externo sin almacenes
- consumo interno válido
- consumo externo válido
- orden híbrida
- stock insuficiente
- ajuste negativo que deja saldo cero
- ajuste negativo que dejaría saldo negativo
- entrada y costo promedio
- reversión
- duplicación por idempotencia
- concurrencia
- aislamiento de tenant
- movimiento inmutable
- alerta de stock mínimo
- compatibilidad con órdenes históricas

### 13. Pruebas y observabilidad

Definí pruebas unitarias, integración, multitenancy, concurrencia, migración, auditoría, métricas y logs relevantes.

### 14. Riesgos y decisiones pendientes

No inventes compras, proveedores completos, lotes, vencimientos, números de serie, reservas, conversiones, contabilidad u offline. Si aparece una dependencia necesaria, marcala como fuera de alcance o decisión abierta.

### 15. Criterios de aprobación

La especificación queda `ready` sólo si:

- los tres modos están definidos sin contradicciones;
- no existe ningún camino que permita saldo negativo;
- los ajustes tienen auditoría inmutable;
- el saldo se controla únicamente por almacén;
- no se introducen reservas ni conversiones;
- `MaintenancePart` mantiene compatibilidad histórica;
- los consumos internos y externos están diferenciados;
- cada requisito tiene al menos un escenario de aceptación;
- los contratos API y las reglas transaccionales son implementables;
- no quedan decisiones de alto impacto sin responsable.

No generes código ni edites archivos. La salida debe ser una especificación lista para revisión humana y posterior diseño técnico.
