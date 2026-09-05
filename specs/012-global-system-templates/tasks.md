# Tasks: 012 - Plantillas de Sistema Globales

- [x] Modificar las Configuraciones de Entidad de EF Core para permitir que `TenantId` sea anulable para `Templates` y `BusinessEntityTypes`.
- [x] Generar y aplicar migraciones de base de datos de EF Core.
- [x] Actualizar los filtros de consulta globales de `AssetHubDbContext` para incluir la condición `|| e.TenantId == null`.
- [x] Actualizar los pipelines de validación de la Aplicación (FluentValidation) para forzar el estado de solo-lectura para administradores no globales en plantillas donde `TenantId == null`.
- [x] Asegurar que los activos creados desde plantillas globales persistan correctamente el `TenantId` del usuario para mantener el aislamiento.
- [x] Escribir pruebas Unitarias y de Integración que cubran el aislamiento de tenant y la visibilidad de plantillas globales.
