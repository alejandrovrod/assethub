# Especificación: Inventario y Almacenes V1

**Feature Branch**: `017-inventory-warehouses`  
**Fecha**: 2026-09-08  
**Estado**: Especificado V1

## Propósito

Agregar inventario opcional por tenant para controlar existencias de consumibles por almacén y registrar su uso en órdenes de mantenimiento, sin convertir el BOM en stock ni introducir compras o contabilidad.

## Alcance

Incluye configuración por tenant, tres modos operativos (`external`, `internal`, `hybrid`), almacenes, saldo agregado por almacén y catálogo, transacciones inmutables, ajustes autorizados, costo promedio ponderado, mínimos de stock, integración con `MaintenancePart` y pantallas React/TypeScript.

No cambia el modelo técnico `AssetMaterial` y no crea una entidad paralela de consumo.

## Actores y permisos

| Actor | Permisos mínimos |
|---|---|
| Administrador del tenant | `inventory.settings.read`, `inventory.settings.write`, `inventory.warehouses.write`, `inventory.adjustments.write` |
| Responsable de almacén | `inventory.stock.read`, `inventory.transactions.read`, `inventory.adjustments.write` |
| Técnico | `inventory.stock.read`; consume en órdenes según `maintenance.orders.write` |
| Auditor/consulta | `inventory.stock.read`, `inventory.transactions.read` |

Todos los permisos se evalúan dentro del tenant actual. El backend es la autoridad para autorización, saldo y costo.

## Decisiones de producto

- El inventario es opcional por tenant.
- Los modos válidos son exactamente `external`, `internal` y `hybrid`.
- `external`: registra consumo y costo real en `MaintenancePart`, sin movimiento de stock.
- `internal`: el consumo requiere almacén y crea una salida al momento de consumo real.
- `hybrid`: una misma orden puede mezclar líneas internas y externas.
- Nunca se acepta saldo negativo; un ajuste negativo sólo procede si el saldo resultante es mayor o igual a cero.
- No hay reservas: la disponibilidad se valida y descuenta en el consumo efectivo.
- El saldo se identifica sólo por almacén y `CatalogItem`; la ubicación sugerida es texto informativo.
- Una unidad base proviene de `CatalogItem`; no hay conversiones.
- No existe entidad proveedor; se usan `ExternalSupplierName` y `ExternalReference`.
- Las transacciones publicadas son inmutables y se corrigen mediante reversión o ajuste compensatorio.

## Requisitos funcionales

- **REQ-INV-001**: El tenant puede activar/desactivar inventario y seleccionar exactamente un modo operativo.
- **REQ-INV-002**: El sistema permite crear, editar, desactivar lógicamente y consultar almacenes del tenant.
- **REQ-INV-003**: Cada saldo activo se calcula por `(TenantId, WarehouseId, CatalogItemId)` y nunca puede ser negativo.
- **REQ-INV-004**: Un ingreso actualiza cantidad y costo promedio ponderado del saldo.
- **REQ-INV-005**: Una salida interna se registra al consumo real, congela el costo promedio vigente y reduce el saldo atómicamente.
- **REQ-INV-006**: Un consumo externo guarda costo real y no crea ni modifica stock.
- **REQ-INV-007**: Una orden híbrida puede incluir líneas internas y externas, sujetas a las validaciones de cada línea.
- **REQ-INV-008**: Un ajuste autorizado crea una transacción inmutable con usuario, razón y timestamp UTC.
- **REQ-INV-009**: Las líneas nuevas extienden `MaintenancePart`; no se crea una entidad paralela.
- **REQ-INV-010**: Las líneas externas dejan `WarehouseId` e `InventoryTransactionId` nulos.
- **REQ-INV-011**: Las líneas internas requieren almacén y referencia a la transacción de salida publicada.
- **REQ-INV-012**: Las operaciones mutantes soportan idempotencia mediante `Idempotency-Key`.
- **REQ-INV-013**: El sistema muestra alerta cuando el saldo queda por debajo de `MinimumQuantity`, sin bloquear el consumo válido.
- **REQ-INV-014**: Todas las consultas y escrituras respetan tenant, soft delete y auditoría existente.

## Reglas e invariantes

- **RULE-INV-001**: `Mode` sólo acepta `external`, `internal`, `hybrid`.
- **RULE-INV-002**: Inventario desactivado no permite operaciones internas ni ajustes; sí conserva consultas históricas autorizadas.
- **RULE-INV-003**: En `external`, toda línea de material debe ser externa.
- **RULE-INV-004**: En `internal`, toda línea de material debe ser interna.
- **RULE-INV-005**: En `hybrid`, cada línea declara `SourceType` y se valida independientemente.
- **RULE-INV-006**: `Quantity > 0`; el saldo nunca puede ser menor que cero.
- **RULE-INV-007**: Una transacción `Posted` no se actualiza ni elimina.
- **RULE-INV-008**: `Reversed` sólo se logra mediante una transacción de reversión vinculada; el historial original permanece.
- **RULE-INV-009**: El costo de ingreso usa promedio ponderado; el costo de salida es el promedio vigente antes de descontar.
- **RULE-INV-010**: `AssetMaterial` sólo recomienda materiales y jamás origina sourcing o movimiento.
- **RULE-INV-011**: Toda operación usa timestamps UTC y conserva `CreatedBy`/`UpdatedBy` o usuario equivalente de auditoría.
- **RULE-INV-012**: La unicidad de idempotencia es por tenant, operación y clave.

## Estados y transiciones

Las transacciones de inventario tienen estados exactos `Draft`, `Posted`, `Reversed`.

```text
Draft --publicar--> Posted --revertir--> Reversed
```

No hay aprobación para ajustes en V1. Sólo un usuario autorizado puede crear y publicar un ajuste en una operación atómica. Los ingresos, salidas y ajustes se publican inmediatamente; `Draft` queda reservado para flujos futuros o validación previa y no afecta saldo.

## Escenarios de aceptación

### SCN-INV-001: rechazo de stock negativo

**Given** un saldo de 2 unidades, **When** se solicita consumo interno de 3, **Then** la API responde `422`, no publica transacción y el saldo permanece en 2.

### SCN-INV-002: idempotencia duplicada

**Given** una solicitud de ajuste con `Idempotency-Key: k1` ya publicada, **When** se repite la misma solicitud con `k1`, **Then** responde el mismo resultado sin segunda transacción ni cambio adicional de saldo.

### SCN-INV-003: aislamiento de tenant

**Given** un almacén del Tenant A, **When** un usuario del Tenant B consulta o muta su ID, **Then** recibe `404` sin revelar existencia ni modificar datos.

### SCN-INV-004: tenant con consumo externo

**Given** inventario activo en modo `external`, **When** se consume un material en una orden, **Then** se guarda costo real en `MaintenancePart`, `WarehouseId` e `InventoryTransactionId` quedan nulos y no cambia ningún saldo.

### SCN-INV-005: orden híbrida

**Given** una orden en modo `hybrid`, **When** se agregan una línea interna y una externa, **Then** la interna publica una salida al almacén seleccionado y la externa sólo registra proveedor/referencia/costo real.

### SCN-INV-006: compatibilidad histórica

**Given** una `MaintenancePart` histórica sin campos de inventario, **When** se consulta la orden, **Then** se muestra correctamente como consumo histórico externo/no clasificado, sin exigir almacén ni transacción.

### SCN-INV-007: reversión inmutable

**Given** una salida `Posted`, **When** un usuario autorizado la revierte, **Then** la original queda `Reversed`, se crea la compensación correspondiente y el saldo se actualiza sin editar la fila original.

### SCN-INV-008: alerta de mínimo

**Given** un saldo cuyo mínimo es 5, **When** un consumo válido deja 4, **Then** la respuesta y el listado muestran alerta `below_minimum`, pero la operación permanece publicada.

## Fuera de alcance explícito

Compras, entidad proveedor, lotes, vencimientos, seriales, reservas, conversión de unidades, contabilidad y modo offline.

## Criterios de éxito

- Todos los saldos y transacciones quedan aislados por tenant.
- Ninguna operación válida permite saldo negativo bajo concurrencia.
- Una solicitud repetida no duplica una transacción.
- Las órdenes externas, internas e híbridas se distinguen sin romper `MaintenancePart` histórico.
- El costo promedio y el costo congelado de salida se pueden auditar desde transacciones.
