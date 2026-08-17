# M5 — Catálogos dinámicos

CRUD genérico de catálogos e items que alimenta a todos los módulos (prioridades, tipos de incidencia, oficios, repuestos...). Soporta catálogos globales heredables (`TenantId NULL`), override por tenant, traducciones y soft-delete con chequeo de uso.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-5.1 | TenantAdmin | Lista catálogos: globales heredados + propios del tenant |
| CU-5.2 | TenantAdmin | Crea catálogo propio con `Code` único por tenant |
| CU-5.3 | TenantAdmin | CRUD de items (code, label, orden, metadata, sub-items vía `ParentItemId`) |
| CU-5.4 | TenantAdmin | Gestiona traducciones es/en de cada item (`CatalogItemTranslations`) |
| CU-5.5 | TenantAdmin | Hace override de un item global: crea versión del tenant que lo sustituye |
| CU-5.6 | SuperAdmin | CRUD de catálogos globales (`TenantId NULL`, `IsSystem=true`) |
| CU-5.7 | TenantAdmin | Desactiva (soft-delete) un item; el sistema valida que no esté en uso |
| CU-5.8 | Cualquier usuario | Consume items de un catálogo filtrados por locale en formularios |

## Reglas de negocio

- RN-5.1: Catálogos globales (`TenantId NULL`) son de solo lectura para tenants; la excepción de R1 se resuelve en repositorio, nunca con query sin filtro para datos propios.
- RN-5.2: `Code` de catálogo único por tenant; un catálogo propio con el mismo `Code` que uno global actúa como override.
- RN-5.3: Todo item es traducible: clave + locale, mínimo `es` y `en`; si falta traducción, fallback al `Label` base (R6).
- RN-5.4: Soft-delete (R8): no se borra físicamente un item referenciado por activos, incidencias, órdenes o tareas; se devuelve 409 con conteo de usos.
- RN-5.5: Catálogos `IsSystem=true` no se eliminan ni renombran en `Code`; solo se pueden extender con items.
- RN-5.6: Toda mutación auditada (R3); permisos `catalogs.manage` requeridos.

## Criterios de aceptación

- CA-5.1: Given un catálogo global `priorities` con items, When TenantAdmin lista catálogos, Then lo ve marcado como "global".
- CA-5.2: Given `Code` duplicado en el tenant, When POST catálogo, Then 409 problem+json.
- CA-5.3: Given item global "Alta", When TenantAdmin crea item propio con mismo `Code`, Then las consultas del tenant devuelven el override.
- CA-5.4: Given item con traducción `es` pero sin `en`, When se consulta con locale `en`, Then devuelve el `Label` base como fallback.
- CA-5.5: Given item usado por 3 incidencias, When DELETE, Then 409 con `usages: 3` y el item no se elimina.
- CA-5.6: Given item sin uso, When DELETE, Then `IsDeleted=true` y deja de aparecer en listados (soft-delete).
- CA-5.7: Given usuario sin `catalogs.manage`, When POST item, Then 403.
- CA-5.8: Given catálogo `IsSystem`, When TenantAdmin intenta eliminarlo, Then 403/409 indicando catálogo de sistema.

## Módulos disponibles para asociación

La propiedad `TargetModulesJson` de `Catalog` almacena un array JSON con los módulos donde el catálogo está disponible. Los módulos soportados son:

| Módulo | Clave | Descripción |
|---|---|---|
| Activos | `assets` | Catálogos para clasificación de activos (tipos, marcas, estados) |
| Incidencias | `incidents` | Catálogos para incidencias (tipos, prioridades, severidades) |
| Tareas | `tasks` | Catálogos para tareas de trabajo (tipos de tarea, prioridades) |
| Mantenimiento | `maintenance` | Catálogos para órdenes de mantenimiento (repuestos, tipos) |
| Personal | `staff` | Catálogos para empleados (oficios, habilidades, roles) |

> **Nota**: Los catálogos de Prioridad y Tipo de Tarea se crean manualmente desde la UI de catálogos, no por seed automático. El usuario debe asociarlos al módulo **Tareas** para que aparezcan en los formularios de edición de tareas.
