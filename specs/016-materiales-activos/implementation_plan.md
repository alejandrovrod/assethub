# Plan de Implementación: M19 - Materiales para Activos

## Resumen Ejecutivo
Este plan detalla los pasos técnicos para implementar el módulo de "Materiales para Activos" (Composición Técnica / BOM) en AssetHub. El módulo permite definir qué repuestos conforman un activo por diseño, sin entrar en manejo de stock o inventarios, proveyendo endpoints CRUD y su integración con el módulo de mantenimiento (M12) para sugerencia de repuestos.

## Fases de Implementación

### Fase 1: Capa de Dominio y Persistencia (Backend)
1. **Entidad `AssetMaterial`**: 
   - Crear la entidad en `AssetHub.Domain/Assets/AssetMaterial.cs`.
   - Propiedades: `Id`, `TenantId`, `AssetId`, `CatalogItemId`, `Quantity`, `UnitOfMeasure`, `IsCritical`, `Notes`.
   - Auditoría y Soft Delete (`IAuditableEntity`, `ISoftDeletable`).
2. **Configuración Entity Framework Core**:
   - Crear `AssetMaterialConfiguration` en `AssetHub.Infrastructure/Persistence/Configurations/`.
   - Configurar restricciones: `Property(x => x.Quantity).HasColumnType("decimal(18,4)")`.
   - Índices: `HasIndex(x => new { x.TenantId, x.AssetId, x.CatalogItemId }).IsUnique().HasFilter("[IsDeleted] = 0")`.
   - Añadir `DbSet<AssetMaterial>` en `TenantDbContext`.
3. **Migración DB**:
   - Ejecutar comando de migración de EF Core para generar y aplicar los cambios.

### Fase 2: Capa de Aplicación (CQRS)
1. **DTOs**:
   - Crear `AssetMaterialDto` y `AssetMaterialSummaryDto` en `AssetHub.Application/Assets/Dtos/`.
2. **Queries**:
   - `GetAssetMaterialsQuery`: Lista paginada con filtrado, inyectando `TenantDbContext` y haciendo Include a `CatalogItem` para traer el `Label` traducido.
3. **Commands**:
   - `CreateAssetMaterialCommand`: Valida unicidad e inserta.
   - `UpdateAssetMaterialCommand`: Permite cambiar Quantity, IsCritical, Notes (valida existencia previa).
   - `DeleteAssetMaterialCommand`: Ejecuta el soft-delete marcando `IsDeleted = true`.
4. **Validadores (FluentValidation)**:
   - Validar `Quantity > 0` en creación y actualización.

### Fase 3: Capa de Presentación API
1. **Controlador REST**:
   - Crear `AssetMaterialsController` (o añadir en `AssetsController` bajo `/api/v1/assets/{assetId}/materials`).
   - Mapear las rutas GET, POST, PUT, DELETE a los comandos CQRS respectivos.
   - Asegurar que todos tengan la política de autorización correcta y el permiso `assets.bom.write` / `assets.bom.read`.

### Fase 4: Frontend (UI/UX)
1. **Servicio y Tipos**:
   - Agregar `asset-material.service.ts` o extender `asset.service.ts` con los nuevos endpoints y el tipo `AssetMaterialDto`.
2. **Pestaña de Materiales (Activo)**:
   - Modificar `AssetDetail` (M08) para añadir la pestaña "BOM / Materiales".
   - Crear `AssetMaterialsTable.tsx` para el listado.
3. **Formulario de Material**:
   - Crear `AssetMaterialFormSheet.tsx` (modal).
   - Integrar un combobox tipo `Typeahead` alimentado por el endpoint de catálogos (M05) para seleccionar el repuesto.
4. **Integración con M12 (Órdenes)**:
   - En `MaintenanceOrderPartsEditor.tsx`, si la orden tiene un `AssetId` asignado, hacer un fetch a los `AssetMaterials` del activo y mostrarlos en la sección superior como "Sugeridos" al momento de agregar un repuesto.

## Plan de Pruebas y Validación
- **Unit Tests**: Probar comandos para asegurar que fallen con duplicados (409) o validaciones de cantidad (400).
- **Integration Tests**: Comprobar el filtro de soft-delete en los queries y el aislamiento multi-tenant.
- **End-to-End**: Verificar el flujo completo desde que se da de alta un material en un activo hasta que es sugerido y consumido en una orden de mantenimiento.
