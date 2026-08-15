# Tasks: M07 - Templates de Activos

## Phase 1: Domain & Infrastructure
- `[x]` TASK-1: Create `AssetTemplate` domain entity and value objects in `AssetHub.Domain`.
- `[x]` TASK-2: Create EF Core mapping/configuration for `AssetTemplate` in `AssetHub.Infrastructure`.
- `[x]` TASK-3: Add EF Core migration for AssetTemplates and update database.

## Phase 2: Application (CQRS)
- `[x]` TASK-4: Implement `CreateAssetTemplateCommand` and validator (JSON-schema check and catalog cross-reference validation).
- `[x]` TASK-5: Implement `UpdateAssetTemplateCommand` (versioning logic).
- `[x]` TASK-6: Implement `DeleteAssetTemplateCommand` (soft-delete if assets exist).
- `[x]` TASK-7: Implement queries (`GetAssetTemplateById`, `ListAssetTemplates` with tenant filter).
- `[x]` TASK-14: Implement `CloneAssetTemplateCommand` (creates a new template from an existing one).

## Phase 3: API Layer
- `[x]` TASK-8: Create `AssetTemplatesController` endpoints (POST, PUT, DELETE, GET, POST /clone).
- `[x]` TASK-9: Add RBAC `[Authorize]` with `templates.manage` permission to endpoints.
- `[ ]` TASK-10: Write integration tests for API endpoints and JSON validation logic.

## Phase 4: Frontend Integration
- `[x]` TASK-11: Update `src/services/asset-template.service.ts` to match API contracts.
- `[x]` TASK-12: Create/Update UI components in `src/pages/assets/templates.tsx` (Table & Form).
- `[x]` TASK-13: Implement JSON-schema client-side validation logic in the editor form.
- `[x]` TASK-15: Add "Clone" button to the templates table UI and implement clone service call.

## Phase 5: Bugfixes & UI Polish
- `[x]` BUGFIX-1: Fix React state race condition in `lifecycle-canvas.tsx` by replacing `selectedNode` object with `selectedNodeId` to prevent the configuration sidebar from unmounting during edits.

## Phase 6: Tareas Menores (Prompts Últimos 2 Días)
- [x] PROMPT-1: Actualizar los nombres de los catálogos en base al JSON de tipoCatalogos (Tipos de Activos, Proyectos, Gpos, etc).
- [x] PROMPT-2: Modificar UI de catálogos para permitir la edición del campo Code solo cuando el elemento es nuevo (deshabilitarlo en edición).
