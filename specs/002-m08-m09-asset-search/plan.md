# Implementation Plan: Asset Search & Dynamic Filtering

## Execution Phases

1. **Application (CQRS)**: 
   - Modificar `SearchAssetsQuery` para incluir `Dictionary<string, Guid> CatalogFilters` y `Guid? AncestorId`.
   - Actualizar `SearchAssetsQueryHandler` agregando los `Join` a `AssetHierarchy` (si hay `AncestorId`) y a `AssetAttributeValue` (para filtrar por los catálogos enviados cruzando `ValueCatalogItemId`).
   - Crear query `GetActiveSearchFiltersQuery` para extraer la metadata de los filtros a usar en UI.
2. **API Layer**: 
   - Agregar el endpoint `POST /api/v1/assets/search` para recibir payload JSON con búsquedas complejas.
   - Agregar endpoint `GET /api/v1/assets/search-filters`.
3. **Frontend Integration**: 
   - Crear componentes de UI en la página de listado de activos (`Sidebar` de filtros).
   - Adaptar `asset.service.ts` para consumir el endpoint de búsqueda y filtros.
   - Mostrar la jerarquía en los resultados de búsqueda para dar contexto de a qué activo padre pertenecen.

## Technical Constraints
- Performance: Asegurarse de que el join con la tabla EAV (`AssetAttributeValue`) sea eficiente.
- Closure Table: Validar que la consulta a `AssetHierarchy` limite correctamente la profundidad si es necesario.
