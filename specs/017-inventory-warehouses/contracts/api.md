# Contrato API: Inventario y Almacenes V1

Base: `/api/v1`. Respuestas de error `application/problem+json`. Todos los endpoints mutantes aceptan `Idempotency-Key` y devuelven el mismo resultado ante reintento idéntico dentro del período de retención configurado. Un conflicto con la misma clave y payload distinto devuelve `409`.

## Configuración

### `GET /inventory/settings`

Permiso: `inventory.settings.read`. Responde `200`:

```json
{"isEnabled":true,"mode":"hybrid"}
```

### `PUT /inventory/settings`

Permiso: `inventory.settings.write`. Payload:

```json
{"isEnabled":true,"mode":"internal"}
```

Responde `200` con la configuración. `422` si `mode` no es uno de los tres valores o si se desactiva con una operación incompatible en curso. Desactivar no borra historial.

## Almacenes

### `GET /inventory/warehouses?includeInactive=false`

Permiso: `inventory.stock.read`. Responde `200` con `items` (`id`, `code`, `name`, `description`, `suggestedLocationText`, `isActive`).

### `POST /inventory/warehouses`

Permiso: `inventory.warehouses.write`. Payload:

```json
{"code":"ALM-01","name":"Central","description":null,"suggestedLocationText":"Sector A"}
```

Responde `201` con `Location`. `409` por código activo duplicado; `422` por datos inválidos.

### `PUT /inventory/warehouses/{warehouseId}`

Permiso: `inventory.warehouses.write`. Responde `200`. `404` si no pertenece al tenant; `409` por código duplicado.

### `DELETE /inventory/warehouses/{warehouseId}`

Permiso: `inventory.warehouses.write`. Soft delete. Responde `204`; `422` si tiene saldo positivo o transacciones que impiden baja según política de retención.

## Stock y transacciones

### `GET /inventory/stock?warehouseId=&catalogItemId=&belowMinimum=`

Permiso: `inventory.stock.read`. Responde `200` paginado:

```json
{"items":[{"warehouseId":"...","catalogItemId":"...","quantity":4.0000,"averageUnitCost":12.5000,"minimumQuantity":5.0000,"belowMinimum":true}],"totalCount":1}
```

### `GET /inventory/transactions?warehouseId=&catalogItemId=&type=&state=&from=&to=`

Permiso: `inventory.transactions.read`. Devuelve sólo transacciones del tenant, con usuario, timestamps, origen y vínculos a parte/orden.

### `POST /inventory/receipts`

Permiso: `inventory.adjustments.write` (o permiso futuro de recepción). Payload:

```json
{"warehouseId":"...","catalogItemId":"...","quantity":10,"unitCost":8.25,"externalReference":"OC-100"}
```

Publica `Receipt` atómicamente, actualiza promedio y responde `201` con transacción y saldo. `422` por cantidad/costo inválidos.

### `POST /inventory/adjustments`

Permiso: `inventory.adjustments.write`. Payload:

```json
{"warehouseId":"...","catalogItemId":"...","quantity":2,"direction":"Out","reason":"Conteo físico","externalReference":"ACT-7"}
```

Publica inmediatamente sin aprobación. Responde `201`; `422` si el saldo resultante sería negativo; `403` sin permiso.

### `POST /inventory/transactions/{transactionId}/reverse`

Permiso: `inventory.adjustments.write`. Payload `{ "reason": "Corrección de conteo" }`. Responde `201` con la transacción compensatoria y deja la original en `Reversed`. `409` si ya fue revertida; `422` si no es reversible.

## Materiales de órdenes

### `POST /maintenance-orders/{orderId}/parts`

El contrato existente se extiende:

```json
{
  "catalogItemId":"...",
  "quantity":2,
  "unitCost":12.5,
  "sourceType":"Internal",
  "warehouseId":"...",
  "externalSupplierName":null,
  "externalReference":null
}
```

`sourceType` es `Internal` o `External` cuando el cliente lo envía; null conserva compatibilidad histórica. La operación valida el modo del tenant. En `Internal`, publica salida y llena `InventoryTransactionId`; en `External`, no toca stock y exige `unitCost` real, permitiendo proveedor/referencia opcionales. Responde `201` con `MaintenancePartDto`.

### `POST /maintenance-orders/{orderId}/consume`

Permiso: `maintenance.orders.write`. Permite registrar el consumo efectivo de líneas preparadas. Payload `{ "partIds": ["..."] }`. Una sola transacción de base aplica todas las líneas: si alguna falla, ninguna se publica. Responde `200` con partes, transacciones y alertas de mínimo.

Errores comunes: `404` orden/parte fuera del tenant, `409` consumo ya aplicado, `422` modo incompatible, almacén inactivo o saldo insuficiente.

## Códigos de error

- `400`: payload o ruta sintácticamente inválidos.
- `401/403`: autenticación o permiso insuficiente.
- `404`: recurso no visible en el tenant actual.
- `409`: idempotencia conflictiva, duplicidad o versión/transacción ya procesada.
- `422`: regla de dominio, saldo negativo, modo inválido o transición no permitida.
- `500`: error no controlado; no se publica transacción si falla la atomicidad.
