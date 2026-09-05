# Plan: 012 - Plantillas de Sistema Globales

## Arquitectura y Stack (Architecture & Stack)
- **Backend (.NET 10, Clean Architecture)**:
  - `AssetHub.Domain`: Ajustes en las restricciones para permitir que `TenantId` sea nulo en las Plantillas de Sistema (`Templates`) y Tipos de Entidad de Negocio (`BusinessEntityTypes`).
  - `AssetHub.Infrastructure`: Actualización de los filtros de consulta globales en `AssetHubDbContext`. Ejemplo: `e => e.TenantId == _currentTenantId || e.TenantId == null`.
  - `AssetHub.Api`: Ajuste de las validaciones de seguridad en los controladores y pipelines para evitar que usuarios estándar modifiquen entidades donde `TenantId == null`.

## Referencias al Modelo de Datos (Data Model References)
- `Templates`:
  - `Id` (GUID)
  - `TenantId` (GUID, Anulable - NUEVO)
  - `Code`, `Name`, etc.
- `BusinessEntityTypes`:
  - `Id` (GUID)
  - `TenantId` (GUID, Anulable - NUEVO)
  - `Name`, etc.

## Fases (Phases)
1. **Migración de Dominio e Infraestructura**: Crear una migración de EF Core alterando la columna `TenantId` para que sea anulable en `Templates` y `BusinessEntityTypes`.
2. **Filtros de Consulta de Infraestructura**: Modificar los filtros globales de consulta de EF Core para recuperar registros donde `TenantId` coincida con la sesión actual O sea `null`.
3. **Validaciones en Capa de Aplicación**: Añadir reglas en FluentValidation y chequeos de autorización para bloquear mutaciones de plantillas globales por usuarios no globales.
4. **Pruebas (Testing)**: Agregar pruebas unitarias y de integración para verificar que las plantillas globales sean visibles a través de los tenants, pero que las mutaciones sean rechazadas para usuarios estándar.

## Restricciones Técnicas (Technical Constraints)
- El patrón de `TenantId` nulo solo debe exponerse a tablas compartidas específicas, no a tablas transaccionales (como Órdenes o Incidencias).
- Se debe asegurar que las eliminaciones en cascada o restricciones de llaves foráneas no se rompan al existir una plantilla global.
