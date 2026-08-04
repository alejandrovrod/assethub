# M8 — Activos (jerarquía árbol)

CRUD de activos organizados en árbol: `ParentId` + materialized `Path` + closure table `AssetHierarchy`. Soporta mover subárboles, código único por tenant, ciclo de vida con eventos, adjuntos y soft-delete con cascada lógica.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-8.1 | Gestor | Crea activo raíz o hijo bajo otro activo, según `AllowedChildTemplateIds` del template |
| CU-8.2 | Gestor | Edita datos básicos (nombre, estado, fechas, `ConditionIndex`) |
| CU-8.3 | Gestor | Consulta el árbol: hijos directos (`ParentId`), descendientes (closure), ruta (`Path`) |
| CU-8.4 | Gestor | Mueve un subárbol a otro padre; el sistema recomputa `Path` y `AssetHierarchy` |
| CU-8.5 | Gestor | Cambia el estado del activo respetando `LifecycleStates` del template; queda `AssetLifecycleEvents` |
| CU-8.6 | Gestor/Técnico | Sube adjuntos (foto, doc, plano) al activo |
| CU-8.7 | Gestor | Elimina (soft-delete) un activo; cascada lógica a su subárbol |
| CU-8.8 | Lectura | Busca activos por código, nombre, template, estado |

## Reglas de negocio

- RN-8.1: Tenant-scoped (R1, R2); `Code` único por tenant (p.ej. `PTE-0001`); GUID v7 (R7).
- RN-8.2: El límite `MaxAssets` del plan se valida en cada creación (R4) → 402/403 problem+json.
- RN-8.3: `Path` materialized `/guid/guid/` e índice `(TenantId, Path)`; la closure table es la fuente para descendientes/profundidad.
- RN-8.4: Mover un subárbol es transaccional: actualiza `ParentId`, recomputa `Path` de todos los descendientes y regenera filas de `AssetHierarchy`; se rechazan movimientos que crean ciclos (un activo bajo su propio descendiente).
- RN-8.5: Cambios de estado solo por transiciones de `LifecycleStates`; cada cambio genera `AssetLifecycleEvents` con `FromState`/`ToState`, usuario y UTC (R5).
- RN-8.6: Soft-delete (R8): eliminar un activo marca `IsDeleted` en todo el subárbol (cascada lógica); no se eliminan físicamente adjuntos ni historial.
- RN-8.7: `ConditionIndex` ∈ [0,100]; su cambio queda auditado y alimenta M16.
- RN-8.8: Permisos `assets.read`/`assets.write`; toda mutación auditada (R3).

## Criterios de aceptación

- CA-8.1: Given template padre que no admite hijos de tipo X, When POST hijo de tipo X, Then 409 con detalle.
- CA-8.2: Given `Code` duplicado en el tenant, When POST, Then 409.
- CA-8.3: Given plan con `MaxAssets` alcanzado, When POST, Then 402 problem+json con `limit=maxAssets`.
- CA-8.4: Given árbol A→B→C, When se mueve B bajo D, Then `Path` de B y C se recomputa y la closure refleja D como ancestro.
- CA-8.5: Given árbol A→B, When se intenta mover A bajo B, Then 409 por ciclo.
- CA-8.6: Given transición `operativo→baja` no definida en el template, When PATCH estado, Then 409; Given transición válida, Then 200 y existe `AssetLifecycleEvents`.
- CA-8.7: Given activo con 5 descendientes, When DELETE, Then los 6 quedan `IsDeleted=true` y no aparecen en listados.
- CA-8.8: Given adjunto de 2 MB tipo `photo`, When POST adjuntos, Then 201 con `BlobUri`; Given tipo no permitido, Then 400.
- CA-8.9: Given `ConditionIndex=120`, When PATCH, Then 400 por rango.
