# Tasks: M08/M09 - Asset Search & Dynamic Filtering

## Phase 1: Application (CQRS)
- `[x]` TASK-1: Modificar `SearchAssetsQuery` para incluir propiedades `Dictionary<string, Guid> CatalogFilters` y `Guid? AncestorId`.
- `[x]` TASK-2: Actualizar `SearchAssetsQueryHandler` para incluir el filtrado jerárquico cruzando con la tabla `AssetHierarchy` si se envía `AncestorId`.
- `[x]` TASK-3: Actualizar `SearchAssetsQueryHandler` para incluir el filtrado dinámico cruzando con la tabla `AssetAttributeValue` usando los `CatalogFilters` y `ValueCatalogItemId`.
- `[x]` TASK-4: Crear `GetActiveSearchFiltersQuery` y su manejador para listar los catálogos y valores dinámicos que se están usando actualmente en los activos.

## Phase 2: API Layer
- `[x]` TASK-5: Agregar el endpoint `POST /api/v1/assets/search` en `AssetsController.cs` para recibir payloads JSON con filtros avanzados.
- `[x]` TASK-6: Agregar el endpoint `GET /api/v1/assets/search-filters` en `AssetsController.cs` para alimentar la UI.

## Phase 3: Frontend Integration
- `[x]` TASK-7: Actualizar `asset.service.ts` agregando los métodos y tipos para consumir la nueva búsqueda y los filtros activos.
- `[x]` TASK-8: Crear y cablear la barra lateral (Sidebar) de filtros dinámicos en la vista principal de activos (`assets/index.tsx`).
- `[x]` TASK-9: Actualizar la grilla/lista de activos para reflejar la ruta jerárquica (Breadcrumbs o columna de Padre) de los resultados obtenidos.
