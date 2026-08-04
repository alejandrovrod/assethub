# M6 — Tipos de entidad de negocio

Definición de los tipos de entidad que gestiona el tenant (vial, edificios, mobiliario urbano...). Cada tipo declara módulos habilitados y catálogos asociados, y sirve de raíz para los templates de activos. Un tenant puede tener varios tipos.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-6.1 | TenantAdmin | Crea tipo de entidad (code, nombre, descripción, icono) |
| CU-6.2 | TenantAdmin | Configura `EnabledModules` del tipo (geo, mantenimiento, tareas...) |
| CU-6.3 | TenantAdmin | Asocia catálogos por defecto al tipo (`DefaultCatalogIds`) |
| CU-6.4 | TenantAdmin | Edita/desactiva un tipo; valida que no tenga templates con activos |
| CU-6.5 | Gestor | Lista tipos activos para filtrar activos y dashboards |
| CU-6.6 | Sistema | Sugiere templates durante el wizard (M2) según tipos elegidos |

## Reglas de negocio

- RN-6.1: Todo tipo lleva `TenantId` y es tenant-scoped (R1); no existen tipos globales obligatorios.
- RN-6.2: `Code` único por tenant; soft-delete si tiene templates asociados (R8).
- RN-6.3: `EnabledModules` solo puede incluir módulos permitidos por el plan del tenant (R4); al quitar un módulo con datos existentes se exige confirmación y los datos quedan en solo lectura.
- RN-6.4: `DefaultCatalogIds` solo puede referenciar catálogos del tenant o globales.
- RN-6.5: Un tipo no se elimina físicamente si existen `AssetTemplates` con `BusinessEntityTypeId` apuntándolo.
- RN-6.6: Mutaciones auditadas (R3); permiso `entity-types.manage`.

## Criterios de aceptación

- CA-6.1: Given TenantAdmin con permiso, When POST `/api/v1/entity-types` con datos válidos, Then 201 con GUID v7.
- CA-6.2: Given `Code` duplicado en el tenant, When POST, Then 409 problem+json.
- CA-6.3: Given `EnabledModules=["geo"]` en plan sin módulo geo, When PUT, Then 403 indicando módulo no incluido en el plan.
- CA-6.4: Given tipo con 2 templates, When DELETE, Then soft-delete (`IsDeleted`) y los templates siguen operativos.
- CA-6.5: Given tipo sin templates, When DELETE, Then queda eliminado/desactivado sin afectar nada más.
- CA-6.6: Given tenant con tipos "vial" y "edificios", When GET lista, Then devuelve ambos, solo del tenant actual (R1/RLS).
- CA-6.7: Given `DefaultCatalogIds` con un catálogo de otro tenant, When PUT, Then 400 con detalle por catálogo inválido.
