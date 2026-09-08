# M19 — Materiales para Activos (Composición Técnica / BOM)

El módulo "Materiales para Activos" resuelve la necesidad de gestionar la **Composición Técnica (Bill of Materials - BOM)** y listar los repuestos recomendados para cada activo. Un "material de activo" representa **únicamente las partes que conforman el equipo por diseño o sus repuestos estándar instalables**, separando esta definición del inventario en sitio y del consumo histórico.

## Decisiones Arquitectónicas

- **Sin Stock**: No se gestiona stock, lotes ni ubicaciones en este módulo.
- **Sin Consumo**: El consumo real y su costo se registra a través de `MaintenancePart` (M12).
- **Sin Series**: Los motores o componentes mayores con número de serie y ciclo de vida propio siguen siendo Activos hijos en `AssetHierarchy` (M08).
- **Unidad de Medida**: Heredada del `CatalogItem` (M05) sin conversiones dinámicas complejas.
- **Planes Preventivos**: M11/M12 podrán pre-declarar estos materiales para sugerirlos en la generación de órdenes.

## Modelo de Dominio

### `AssetMaterial`
| Propiedad | Tipo | Notas |
|---|---|---|
| `Id` | Guid (v7) | PK |
| `TenantId` | Guid | FK, Multi-tenant (R1) |
| `AssetId` | Guid | FK → `Assets` |
| `CatalogItemId` | Guid | FK → `CatalogItems` |
| `Quantity` | decimal(18,4) | Cantidad requerida/instalada por diseño (> 0) |
| `UnitOfMeasure` | nvarchar(50) | Unidad denormalizada |
| `IsCritical` | bit | Indica si es crítico operativamente |
| `Notes` | nvarchar(500) | Notas de instalación (Opcional) |
| `IsDeleted` | bit | Soft delete (R8) |

**Relaciones e Índices:**
- Índice único compuesto filtrado: `(TenantId, AssetId, CatalogItemId)` donde `IsDeleted = 0`.
- Índice simple para `AssetId`.

## Reglas de Negocio

- **RN-MAT-001**: Aislamiento Multi-Tenant en cada lectura y escritura.
- **RN-MAT-002**: Unicidad. No puede existir más de un `AssetMaterial` activo con el mismo `CatalogItemId` para un mismo `AssetId`.
- **RN-MAT-003**: `Quantity` estrictamente mayor a 0.
- **RN-MAT-004**: Si el `CatalogItem` sufre soft-delete, el `AssetMaterial` histórico se preserva pero se muestra como obsoleto en la UI.
- **RN-MAT-005**: Si el `Asset` se mueve de padre, los materiales no se alteran al estar ligados a `AssetId`.

## Contratos de la API

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/v1/assets/{assetId}/materials` | `assets.bom.read` | Listado paginado de materiales, incluye label de catálogo. |
| POST | `/api/v1/assets/{assetId}/materials` | `assets.bom.write` | Crea nuevo material en el BOM. Falla con 409 si existe. |
| PUT | `/api/v1/assets/{assetId}/materials/{materialId}` | `assets.bom.write` | Actualiza quantity, isCritical o notes. |
| DELETE | `/api/v1/assets/{assetId}/materials/{materialId}` | `assets.bom.write` | Elimina (soft-delete) el material. |

## Experiencia de Usuario (UI)

1. **Navegación**: Pestaña "Composición Técnica" o "BOM" en el detalle del activo (`AssetDetail`).
2. **Listado**: Tabla con repuestos, cantidad, unidad, criticidad y acciones CRUD.
3. **Formulario**: Modal/Sheet usando componente Typeahead contra `GET /api/v1/catalogs/items` (M05).
4. **Integración M12**: El buscador de "Agregar Repuesto" en `MaintenanceOrderPartsEditor` sugiere en la parte superior los `CatalogItems` presentes en el BOM del `Asset` asignado a la orden.

## Casos de Uso y Aceptación

- **CU-19.1**: Gestor crea, edita o elimina materiales de un activo específico. (Aceptación: 201 Created, 200 OK, 204 No Content).
- **CU-19.2**: Validación de duplicidad (Aceptación: POST duplicado retorna 409 Conflict).
- **CU-19.3**: Aislamiento de tenants. (Aceptación: Tenant A no ve ni puede mutar repuestos de un Asset del Tenant B).
