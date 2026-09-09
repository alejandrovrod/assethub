# Modelo de datos: Inventario y Almacenes V1

## Convenciones

PK `Guid`/`uniqueidentifier` v7; `TenantId` obligatorio en tablas de negocio; timestamps UTC; auditoría (`CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`) donde el modelo existente la soporte; soft delete con `IsDeleted` y `DeletedAt` para almacenes y configuración. Todas las consultas deben aplicar tenant isolation y los filtros globales existentes.

## Entidades

### TenantInventorySettings

| Campo | Tipo | Reglas |
|---|---|---|
| `Id` | Guid PK | Uno por tenant |
| `TenantId` | Guid NOT NULL UNIQUE | Aislamiento |
| `IsEnabled` | bool | Inventario opcional |
| `Mode` | nvarchar(20) | `external`, `internal`, `hybrid` |
| `CreatedAt`, `UpdatedAt` | datetime2 UTC | Auditoría |
| `UpdatedBy` | Guid? | Usuario |

Índice único `(TenantId)`.

### Warehouse

| Campo | Tipo | Reglas |
|---|---|---|
| `Id` | Guid PK | |
| `TenantId` | Guid NOT NULL | |
| `Code` | nvarchar(50) | Único activo por tenant |
| `Name` | nvarchar(200) | Obligatorio |
| `Description` | nvarchar(500)? | |
| `SuggestedLocationText` | nvarchar(200)? | Informativo, no identidad de saldo |
| `IsActive` | bit | Baja lógica/operativa |
| `IsDeleted` | bit | Soft delete |
| `CreatedAt`, `UpdatedAt` | datetime2 UTC | |
| `CreatedBy`, `UpdatedBy` | Guid? | |

Índice único filtrado `(TenantId, Code)` donde `IsDeleted = 0`; índice `(TenantId, IsActive)`.

### StockBalance

Saldo materializado por almacén y catálogo.

| Campo | Tipo | Reglas |
|---|---|---|
| `Id` | Guid PK | |
| `TenantId` | Guid NOT NULL | |
| `WarehouseId` | Guid NOT NULL | FK restrict a `Warehouse` |
| `CatalogItemId` | Guid NOT NULL | FK restrict a `CatalogItem` |
| `Quantity` | decimal(18,4) | `>= 0` |
| `AverageUnitCost` | decimal(18,4) | `>= 0` |
| `MinimumQuantity` | decimal(18,4) | `>= 0` |
| `UpdatedAt` | datetime2 UTC | |
| `RowVersion` | rowversion | Concurrencia |

Índice único `(TenantId, WarehouseId, CatalogItemId)` y búsqueda `(TenantId, CatalogItemId)`.

### InventoryTransaction

| Campo | Tipo | Reglas |
|---|---|---|
| `Id` | Guid PK | |
| `TenantId` | Guid NOT NULL | |
| `WarehouseId` | Guid? | Nulo para consumo externo |
| `CatalogItemId` | Guid NOT NULL | |
| `Type` | nvarchar(20) | `Receipt`, `Issue`, `Adjustment`, `Reversal` |
| `State` | nvarchar(20) | `Draft`, `Posted`, `Reversed` |
| `Quantity` | decimal(18,4) | Siempre positiva; signo dado por `Type`/`Direction` |
| `Direction` | nvarchar(10) | `In`, `Out` |
| `UnitCost` | decimal(18,4) | Costo aplicado |
| `TotalCost` | decimal(19,4) | `Quantity * UnitCost` redondeado |
| `SourceType` | nvarchar(20)? | `Internal`, `Adjustment`, `Receipt`, `Reversal` |
| `MaintenancePartId` | Guid? | FK restrict; consumo interno |
| `ReversesTransactionId` | Guid? | FK a transacción original |
| `Reason` | nvarchar(500)? | Obligatorio en ajuste/reversión |
| `ExternalReference` | nvarchar(200)? | Referencia operativa |
| `PostedAt` | datetime2 UTC? | Requerido en Posted |
| `PostedBy` | Guid? | Requerido en Posted |
| `CreatedAt`, `CreatedBy` | datetime2/Guid | Auditoría |

Índices `(TenantId, WarehouseId, CatalogItemId, PostedAt)`, `(TenantId, MaintenancePartId)`, `(TenantId, ReversesTransactionId)`. No se elimina una transacción publicada.

### MaintenancePart extendida

Se conserva la entidad y tabla existente. Se agregan:

| Campo | Tipo | Compatibilidad |
|---|---|---|
| `WarehouseId` | Guid? | Nulo para histórico/external |
| `InventoryTransactionId` | Guid? | Nulo para histórico/external |
| `SourceType` | nvarchar(20)? | `Internal`/`External`; null histórico |
| `ExternalSupplierName` | nvarchar(200)? | Sólo external |
| `ExternalReference` | nvarchar(200)? | Sólo external |

`Quantity` existente se conserva en su tipo actual para no romper filas ni contratos históricos. Las cantidades de stock/transacción usan `decimal(18,4)`; si el dominio futuro requiere fracciones en `MaintenancePart`, se deberá versionar el contrato y migrar explícitamente. `UnitCost` sigue siendo decimal y se redondea a 4 decimales.

## Relaciones

```text
Tenant 1--1 TenantInventorySettings
Tenant 1--* Warehouse
Warehouse 1--* StockBalance
CatalogItem 1--* StockBalance
Warehouse 1--* InventoryTransaction
CatalogItem 1--* InventoryTransaction
MaintenanceOrder 1--* MaintenancePart
MaintenancePart 0..1--1 InventoryTransaction
MaintenancePart 0..1--1 Warehouse
InventoryTransaction 0..1--1 InventoryTransaction (reversal)
```

No existe saldo por bin, estante o ubicación; `SuggestedLocationText` no participa en claves.

## Costo promedio ponderado

Para un ingreso de cantidad $q$ a costo $c$ sobre saldo $Q$ con promedio $A$:

$$A_{nuevo}=round_4\left(\frac{Q\times A+q\times c}{Q+q}\right)$$

La salida interna usa `A` vigente antes de la operación y no recalcula el promedio. El saldo nuevo es $Q-q$. Un saldo inicial cero toma el costo del primer ingreso. Se recomienda `decimal(18,4)` para cantidades y costo unitario, `decimal(19,4)` para total, con redondeo decimal explícito y sin `double`.

## Migración y compatibilidad

- Agregar tablas y columnas nullable de `MaintenancePart`.
- No backfill obligatorio: filas existentes se interpretan como históricas.
- Crear índices tenant-scoped y FKs `Restrict` para no borrar historial por cascada.
- Mantener filtros globales de `TenantDbContext` y agregar `DbSet`/configuración.
- Validar migración sobre base nueva y base con órdenes/partes existentes.
