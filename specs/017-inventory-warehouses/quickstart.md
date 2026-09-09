# Quickstart: Inventario y Almacenes V1

## Validación backend

Desde `asset-hub`:

```bash
dotnet build src/backend/AssetHub.Api/AssetHub.Api.csproj
dotnet test tests/backend/AssetHub.Api.Tests/AssetHub.Api.Tests.csproj
```

La migración se valida opcionalmente contra una base real:

```bash
dotnet ef database update --startup-project src/backend/AssetHub.Api/AssetHub.Api.csproj --project src/backend/AssetHub.Infrastructure/AssetHub.Infrastructure.csproj --context TenantDbContext
```

## Flujo manual API

Usar un tenant y usuario con permisos de inventario. Las rutas usan `/api/v1`.

1. Activar modo `hybrid` con `PUT /inventory/settings`.
2. Crear un almacén con `POST /inventory/warehouses`.
3. Registrar un ingreso con `POST /inventory/receipts` y guardar `transactionId`.
4. Consultar `GET /inventory/stock?warehouseId=...`; comprobar cantidad y promedio.
5. Crear una orden y agregar una línea interna con `POST /maintenance-orders/{id}/parts`.
6. Consumirla con `POST /maintenance-orders/{id}/consume`; comprobar salida y costo promedio congelado.
7. Agregar una línea externa con proveedor/referencia; comprobar que no cambia stock.
8. Intentar consumir más que el saldo; esperar `422` y ningún cambio.
9. Repetir el ingreso con el mismo `Idempotency-Key`; comprobar una sola transacción.
10. Crear ajuste negativo que deje saldo negativo; esperar `422`.
11. Crear ajuste que deje saldo bajo el mínimo; esperar `201` y `below_minimum: true`.
12. Revertir una transacción; comprobar estado original `Reversed` y compensación nueva.

## Validaciones de aceptación

- **CA-INV-001**: Build y tests backend existentes pasan sin exigir campos nuevos a datos históricos.
- **CA-INV-002**: No se publica salida si el saldo resultante sería negativo.
- **CA-INV-003**: Repetir una solicitud idéntica no duplica la transacción.
- **CA-INV-004**: Un tenant B no puede leer ni mutar recursos de tenant A.
- **CA-INV-005**: En modo externo, consumo y costo real quedan en `MaintenancePart` sin movimiento de stock.
- **CA-INV-006**: Una orden híbrida muestra y procesa líneas internas/externas en una misma orden.
- **CA-INV-007**: Una parte histórica con campos nuevos nulos se consulta sin error.

## Verificación UI

1. Abrir configuración y cambiar entre los tres modos válidos.
2. Crear almacén y consultar stock vacío.
3. Registrar ingreso y observar saldo/costo.
4. Registrar ajuste y revisar auditoría.
5. Abrir una orden en modo híbrido y agregar ambos tipos de línea.
6. Intentar una salida insuficiente y confirmar error sin mutación.
7. Revisar alerta cuando el saldo cae por debajo del mínimo.
8. Verificar que no aparecen controles de compras, lotes, reservas o conversiones.
