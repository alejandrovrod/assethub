# Feature: M07 - Templates de Activos

## Overview
Templates que definen la estructura de los activos: `SchemaJson` (JSON-schema de características EAV), jerarquía permitida (`AllowedChildTemplateIds`), ciclo de vida (`LifecycleStates`) y checklist de mantenimiento. Incluye versionado: cambiar un template no rompe los activos ya creados.

## Functional Requirements
- **FR-7.1**: TenantAdmin crea template ligado a un tipo de entidad (M6).
- **FR-7.2**: TenantAdmin define `SchemaJson`: atributos con tipo (`text`,`number`,`date`,`bool`,`catalog`,`geo`,`json`), obligatoriedad y catálogo asociado.
- **FR-7.3**: TenantAdmin define `AllowedChildTemplateIds` (qué templates pueden colgar de uno).
- **FR-7.4**: TenantAdmin define `LifecycleStates`: estados y transiciones permitidas.
- **FR-7.5**: TenantAdmin define `MaintenanceChecklist` base para órdenes preventivas.
- **FR-7.6**: TenantAdmin publica nueva versión de un template en uso; `Version` se incrementa.
- **FR-7.7**: TenantAdmin clona un template o instala uno sugerido del wizard.
- **FR-7.8**: Gestor consulta el schema vigente para crear/editar activos.

## Edge Cases & Business Rules
- **RN-7.1**: Tenant-scoped; `Code` único por tenant; soft-delete. Un template con activos nunca se borra físicamente.
- **RN-7.2**: `SchemaJson` debe ser JSON-schema válido. Rechazo 400 detallado si no lo es.
- **RN-7.3**: Cambios en template publicado crean nueva `Version`. Activos conservan versión original.
- **RN-7.4**: `AllowedChildTemplateIds` vacío = cualquier hijo permitido. Si poblado, enforced en M8.
- **RN-7.5**: `LifecycleStates` define estado inicial obligatorio y transiciones.
- **RN-7.6**: Atributos `catalog` referencian catálogos del tenant o globales (M5).
- **RN-7.7**: Mutaciones auditadas, permiso `templates.manage`.

## Success Criteria
- **SC-7.1**: JSON-schema inválido retorna 400 problem+json con error.
- **SC-7.2**: Catálogo inexistente en atributo tipo `catalog` retorna 400.
- **SC-7.3**: Al publicar cambios, versión incrementa (ej. v2) y activos existentes (v1) siguen válidos.
- **SC-7.4**: `LifecycleStates` sin estado inicial retorna 400.
- **SC-7.5**: Impedir crear activo bajo padre no permitido por `AllowedChildTemplateIds` (validado en API).
- **SC-7.6**: DELETE hace soft-delete si tiene activos; borrado físico si no tiene.
- **SC-7.7**: Sin `templates.manage`, API retorna 403.
- **SC-7.8**: Aislamiento por Tenant (Tenant A no ve templates del Tenant B).
