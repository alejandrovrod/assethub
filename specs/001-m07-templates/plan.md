# Plan: M07 - Templates de Activos

## Architecture & Stack
- **Backend (.NET 10, Clean Architecture)**:
  - `AssetHub.Domain`: Entidad `AssetTemplate`, Value Objects para `SchemaJson`.
  - `AssetHub.Application`: CQRS con MediatR (Create, Update, Publish, Get, List). Validación con FluentValidation.
  - `AssetHub.Infrastructure`: EF Core Config para persistencia (JSON column para `SchemaJson`), Interceptor de RLS para tenancy.
  - `AssetHub.Api`: Endpoint `/api/v1/asset-templates`. Autenticación y Autorización (política `templates.manage`).
- **Frontend (React 19, TS, Vite)**:
  - `src/services/asset-template.service.ts`: Axios client.
  - `src/stores/asset-template-store.ts`: Zustand (si aplica) o react-query.
  - `src/pages/assets/templates.tsx`: UI de lista y formulario.
  - UI de validación de JSON Schema en cliente (RJSF o similar).

## Data Model References
- `AssetTemplate`:
  - `Id` (GUID v7)
  - `TenantId` (GUID, FK, Required)
  - `Code` (String, Unique per Tenant)
  - `Name` (String, Translatable)
  - `Version` (Int, default 1)
  - `IsPublished` (Bool)
  - `SchemaJson` (NVARCHAR(MAX) / JSON)
  - `AllowedChildTemplateIds` (JSON array of GUIDs)
  - `LifecycleStates` (JSON)
  - `MaintenanceChecklist` (JSON)
  - `IsDeleted` (Bool - Soft Delete)

## Phases
1. **Domain & Infrastructure**: Crear entidades, migraciones EF Core, validaciones de esquema de datos.
2. **Application (CQRS)**: Implementar comandos y queries con validaciones estrictas (RN-7.2, RN-7.4).
3. **API Layer**: Controladores, protección de rutas y pruebas de integración.
4. **Frontend Integration**: Conectar `asset-template.service.ts`, crear forms y views.

## Technical Constraints
- JSON-schema validación server-side. Debe soportar hasta JSON-schema Draft 7.
- Operaciones idempotentes en actualización de schema no-publicado.
- Si está publicado, `Update` falla si modifica schema destructivamente (crea nueva versión).
