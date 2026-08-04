# M7 — Templates de activos

Templates que definen la estructura de los activos: `SchemaJson` (JSON-schema de características EAV), jerarquía permitida (`AllowedChildTemplateIds`), ciclo de vida (`LifecycleStates`) y checklist de mantenimiento. Incluye versionado: cambiar un template no rompe los activos ya creados.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-7.1 | TenantAdmin | Crea template ligado a un tipo de entidad (M6) |
| CU-7.2 | TenantAdmin | Define `SchemaJson`: atributos con tipo (`text`,`number`,`date`,`bool`,`catalog`,`geo`,`json`), obligatoriedad y catálogo asociado |
| CU-7.3 | TenantAdmin | Define `AllowedChildTemplateIds` (qué templates pueden colgar de uno) |
| CU-7.4 | TenantAdmin | Define `LifecycleStates`: estados y transiciones permitidas |
| CU-7.5 | TenantAdmin | Define `MaintenanceChecklist` base para órdenes preventivas |
| CU-7.6 | TenantAdmin | Publica nueva versión de un template en uso; `Version` se incrementa |
| CU-7.7 | TenantAdmin | Clona un template o instala uno sugerido del wizard |
| CU-7.8 | Gestor | Consulta el schema vigente para crear/editar activos |

## Reglas de negocio

- RN-7.1: Tenant-scoped (R1); `Code` único por tenant; soft-delete (R8) — un template con activos nunca se borra físicamente.
- RN-7.2: `SchemaJson` debe ser JSON-schema válido; se valida al guardar y se rechaza con 400 detallado si no lo es.
- RN-7.3: Cambios en un template publicado crean nueva `Version`; los activos conservan la versión con la que se validaron y no se invalidan retroactivamente.
- RN-7.4: `AllowedChildTemplateIds` vacío = cualquier hijo permitido; si está poblado, la jerarquía se enforce en M8.
- RN-7.5: `LifecycleStates` define estado inicial obligatorio y transiciones; los cambios de estado de activos (M8) las respetan.
- RN-7.6: Los atributos tipo `catalog` deben referenciar catálogos del tenant o globales (M5).
- RN-7.7: Mutaciones auditadas (R3); permiso `templates.manage`.

## Criterios de aceptación

- CA-7.1: Given JSON-schema inválido en `SchemaJson`, When POST/PUT, Then 400 problem+json con el error de validación.
- CA-7.2: Given atributo tipo `catalog` con catálogo inexistente, When PUT schema, Then 400 con detalle por atributo.
- CA-7.3: Given template v1 con 50 activos, When TenantAdmin publica cambios, Then `Version=2` y los 50 activos siguen válidos sin migración.
- CA-7.4: Given `LifecycleStates` sin estado inicial, When PUT, Then 400.
- CA-7.5: Given `AllowedChildTemplateIds=[B]`, When se intenta crear activo de template C bajo uno de A, Then 409 (validación en M8).
- CA-7.6: Given template con activos, When DELETE, Then soft-delete; Given sin activos, Then se elimina/desactiva libremente.
- CA-7.7: Given usuario sin `templates.manage`, When POST, Then 403.
- CA-7.8: Given tenant A y tenant B con template `puente`, When A lista templates, Then no ve el de B (R1/RLS).
