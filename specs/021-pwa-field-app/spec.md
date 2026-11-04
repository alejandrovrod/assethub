# Especificación: Aplicación PWA Offline-First para Técnicos de Campo (`field-pwa`)

**Feature Branch**: `021-pwa-field-app`
**Fecha**: 2026-10-28
**Estado**: Especificado V1 — pendiente de validación de supuestos P0 (§11)
**Spec Kit**: `specs/021-pwa-field-app/`
**Plan**: `specs/021-pwa-field-app/plan.md` · **Tareas**: `specs/021-pwa-field-app/tasks.md`

**Apps / paquetes afectados**

| Elemento | Ruta real | Acción |
| :--- | :--- | :--- |
| App nueva | `asset-hub/src/frontend/apps/field-pwa` | Crear |
| Paquete nuevo | `asset-hub/src/frontend/packages/core-offline` (`@asset-hub/core-offline`) | Crear |
| Librería UI | `asset-hub/src/frontend/packages/ui` (`@asset-hub/ui`) | Extender (aditivo, sin romper `web`) |
| SPA administrativa | `asset-hub/src/frontend/apps/web` | Sin cambios funcionales |
| Backend | `asset-hub/src/backend` | Cambios requeridos (§8, bloqueantes) |

---

## 1. Resumen del requerimiento y valor de negocio

### 1.1 Problema

El técnico de campo trabaja en sótanos, plantas industriales, azoteas y zonas rurales donde la conectividad es nula o intermitente. Hoy el flujo real es: imprimir la orden de trabajo, anotar en papel, tomar fotos con el celular personal, y transcribir todo al final del turno en `apps/web`. Ese retrabajo produce:

- Pérdida de evidencia (fotos sin vínculo al activo/tarea).
- Timestamps falsos: la hora real de la intervención se reemplaza por la hora de transcripción.
- Incidencias reportadas horas después, cuando el contexto ya se perdió.
- Consumo de materiales registrado de memoria, generando descuadres de stock.

### 1.2 Propuesta

Una PWA instalable (`field-pwa`) que trate al dispositivo como **fuente de verdad operativa temporal**. El técnico inicia sesión una vez con conectividad, descarga su jornada, opera completamente offline y sincroniza en background cuando recupera red. Ninguna interacción de UI llama a la API: toda mutación se escribe localmente (Dexie/IndexedDB) y se encola en un **outbox** idempotente.

### 1.3 Valor esperado (métricas de éxito del MVP)

| Métrica | Baseline (papel/transcripción) | Objetivo MVP |
| :--- | :--- | :--- |
| Retrabajo administrativo por turno | 45–60 min | ≤ 10 min |
| Precisión del timestamp de inicio/fin | ± horas | ± 5 s (reloj local corregido por skew) |
| Evidencia fotográfica vinculada a la tarea | ~60 % | ≥ 98 % |
| Duplicados por reintento de red | n/d (manual) | **0** por diseño (idempotencia) |
| Tareas ejecutables sin señal | 0 | 100 % de la jornada descargada |

### 1.4 Alcance del MVP

| # | Módulo | Capacidad |
| :-: | :--- | :--- |
| F1 | `work-tasks` & `maintenance-orders` | Descarga y persistencia de órdenes de trabajo y tareas asignadas (al usuario o su equipo); agrupación Orden → Tareas; máquina de estados con bloqueo por estado de la orden (`maintenanceOrderState === 'in_progress'`); transiciones Iniciar/Pausar/Completar con timestamps locales + geolocalización; checklists y propiedades dinámicas propagadas |
| F2 | `incidents` | Alta, seguimiento y transiciones de estado de incidencias asignadas; máquina de estados dinámica (`workflow_templates.lifecycleStates` + `requiresFields` por transición); fotos desde cámara con compresión cliente; geolocalización automática |
| F3 | `assets` | Búsqueda por texto, escaneo QR/código de barras; ficha técnica completa **offline**: edición de campos dinámicos EAV con motor de reglas de validación (`dynamic-validation-rules`), máquina de estados del activo (`lifecycleStates` + `requiresFields` + `associatedModule`), actualización de georreferencia GPS (`geoJson`), jerarquía (`parentId`), BOM de repuestos (`asset_bom_materials`) y widgets cruzados (Tareas, Incidencias, Órdenes y Timeline del activo) |
| F4 | `inventory` & `parts` | Consumo de materiales desde stock móvil (vehículo/almacén local) y gestión completa de **Repuestos de la Orden de Trabajo** (`MaintenanceOrderParts`: `Internal`/`External`/`None`, sugeridos desde el **BOM del activo**) con reserva local |
| F5 | `dynamic-forms` & `propagation` | Motor offline de propagación de datos dinámicos (`PropagatedProperties`: fusión de schemas `Asset` + `WorkflowTemplates` de Incidencia/Orden/Tarea) y resolución local de catálogos (`catalogCode`), empleados y cuadrillas (`useResolvedSchema` offline) |
| F6 | Transversal | Autenticación con lease offline (incluyendo `employeeId` y `teamIds`), motor de sync, estado de sincronización visible, modo claro/oscuro alto contraste, UX a una mano |

---

## 2. Contexto técnico verificado (no asumido)

Hallazgos producto de inspeccionar el repositorio el 2026-10-28. Son **restricciones de diseño**, no supuestos.

| # | Hallazgo verificado | Consecuencia para esta feature |
| :-: | :--- | :--- |
| V1 | El frontend está en `asset-hub/src/frontend`; `pnpm-workspace.yaml` ya incluye `apps/*` y `packages/*` | No hace falta tocar el workspace glob; sólo agregar paquete y app |
| V2 | `apps/web` usa `@rjsf/core@^6.7.1`, `@rjsf/utils`, `@rjsf/validator-ajv8` (v6, no v5) | El motor de checklists se implementa contra la API v6 (`Validator`, `Form`, `registry`) |
| V3 | `lib/rjsf-validator.ts` ya customiza Ajv8 (`customFormats`, `strict: false`) | Se reutiliza ese validador exportándolo a `@asset-hub/ui` o replicando la config en `core-offline` (ver D9) |
| V4 | `AssetTemplate.MaintenanceChecklist` es un `string` con un **array plano** `{id,title,description,frequency}` | NO es JSON Schema. El checklist RJSF requiere un contrato nuevo (§8, B3) |
| V5 | `WorkTask` no tiene `RowVersion` ni `UpdatedAt`; sólo `CreatedAt`, `StartedAt`, `CompletedAt` | Sin token de concurrencia no hay detección de conflictos real. Requiere B2 |
| V6 | `StockBalance` sí tiene `RowVersion` (`IsRowVersion()`); `InventorySettings.AllowNegativeStock` existe | El consumo de materiales puede ser seguro con `If-Match`; el modo negativo es política de tenant |
| V7 | Access token TTL = **15 min** (`LoginResult.ExpiresIn = 900`), refresh con rotación y hash en `RefreshTokens` | Offline de 8 h es imposible sin un lease emitido por el servidor (§8, B4) |
| V8 | `TaskEvidence` existe con `Type` (`photo`, `signature`, `note`, `geocheck`) y `BlobUri` | El modelo de evidencias ya soporta el caso de uso; sólo falta el endpoint de lectura |
| V9 | `POST /api/v1/media/upload` acepta `IFormFile` y devuelve `{ url }` | La cola de media sube blobs y luego reemplaza URLs locales por remotas |
| V10 | `[Route("api/v1/[controller]")]` en `Incidents` e `Inventory` | Rutas reales: `api/v1/incidents`, `api/v1/inventory` |
| V11 | `WorkTasksController` expone `PUT /{id}/state` y `GET /{id}/history` | Las transiciones se mapean a esos endpoints, no a un PATCH inventado |
| V12 | `.specify/memory/constitution.md` es la plantilla sin completar | No hay gates de constitución; el plan se apoya en convenciones del repo (§16 del plan) |
| V13 | `WorkTaskStates` = `todo`, `rework`, `in_progress`, `done`, `cancelled`. `TaskStateTransitionValidator` sólo permite `todo→in_progress`, `rework→in_progress`, `in_progress→done` (y cancelaciones) | **No existe `paused`** y **no se puede volver a `todo`**: la "Pausa" del brief requiere B9; el estado `rework` sí debe soportarse |

---

## 3. Actores y permisos

| Actor | Descripción | Permisos requeridos |
| :--- | :--- | :--- |
| **Técnico** (primario) | Ejecuta tareas en sitio, reporta incidencias, consume materiales | `tasks:read`, `tasks:write` (propias), `assets:read`, `incidents:write`, `inventory:read`, `inventory:consume`, `media:write` |
| **Supervisor** (secundario) | Revisa conflictos de sync y evidencia desde `apps/web` | Sin cambios en esta app; recibe notificación de dead-letter |
| **Administrador** | Configura política de lease offline y stock negativo | Sin pantalla en esta app |

**Regla de aislamiento y filtrado por asignación**: la app sólo muestra y opera sobre entidades del `tenantId` de la sesión y filtra estrictamente Tareas (`work-tasks`), Órdenes de Trabajo (`maintenance-orders`) e Incidencias (`incidents`) donde `assignedEmployeeId === session.employeeId`, `assignedToId === session.userId` o `assignedTeamId ∈ session.teamIds` (además de las incidencias reportadas por el propio usuario).

---

## 4. Alcance funcional detallado

### 4.1 `work-tasks` y `maintenance-orders` — Órdenes de trabajo, tareas y propagación

- Descarga inicial ("jornada") de órdenes de mantenimiento y tareas asignadas al técnico o a sus cuadrillas (`teamIds`): ventana configurable (por defecto hoy → +7 días), incluyendo activo vinculado, orden padre, incidencia origen, `workflow_templates` asociados, catálogos dinámicos y últimos eventos.
- Agrupación jerárquica idéntica a `apps/web`: las tareas vinculadas a una `MaintenanceOrder` se agrupan bajo su orden padre (mostrando título y estado de la orden) o se listan por urgencia (`vencidas`, `hoy`, `próximas`, `sin fecha`) con indicador de estado de sync por ítem.
- **Seguimiento y máquina de estados de Órdenes de Trabajo (`maintenance-orders`)**:
  - Estados soportados: `draft`, `approved`, `scheduled`, `in_progress`, `done`, `rescheduled`, `verified`, `cancelled`.
  - El técnico asignado puede iniciar (`scheduled/approved/rescheduled → in_progress`) y completar (`in_progress → done`) la orden desde campo cuando tiene los permisos `maintenance:start` / `maintenance:complete`.
  - **Regla de bloqueo Orden → Tarea (paridad con `apps/web`)**: una tarea hija **no permite transiciones de estado** si su orden padre tiene `maintenanceOrderState !== 'in_progress'`, y **bloquea la edición de datos** si la orden está en `done`, `verified` o `cancelled`. Si el técnico inicia la orden localmente (optimista en Dexie), las tareas hijas se desbloquean de inmediato en la UI sin esperar red.
- Transiciones de tarea soportadas (contrastadas con `TaskStateTransitionValidator`, V13, y `allowedTransitions` dinámicas del servidor):

| Acción de UI | Transición | ¿Soportada hoy? |
| :--- | :--- | :--- |
| **Iniciar** | `todo → in_progress`, `rework → in_progress` | Sí |
| **Completar** | `in_progress → done` | Sí |
| **Pausar** | `in_progress → paused` | **No** — requiere B9 |
| **Reanudar** | `paused → in_progress` | **No** — requiere B9 |
| **Descartar / volver a pendiente** | `in_progress → todo` | **No** — fuera de alcance (acción de supervisor) |
| **Cancelar** | `* → cancelled` | Fuera de alcance del técnico (acción de supervisor) |

- Tarea devuelta por el supervisor (`rework`): se muestra con banner "Devuelta · requiere corrección" y motivo, ordenada primero en la jornada.
- Cada transición persiste `timestampLocal` (ISO con offset), `monotonicMs` (para ordenar sin depender del reloj), coordenadas y precisión si el permiso está concedido.
- **Propagación de datos dinámicos (`PropagatedProperties` offline)**:
  - Paridad total con `PropagatedPropertiesDisplay` de `apps/web`: en el detalle de Tarea y de Orden se fusionan los JSON Schemas de:
    1. El Activo (`asset.schemaJson`, propiedades marcadas con `_source: 'asset'`)
    2. Los `WorkflowTemplate` de la Incidencia origen (`incident.workflowTemplateId`), de la Orden (`order.workflowTemplateId`) y de la Tarea (`task.workflowTemplateId`), marcados con `_source: 'workflowTemplate'`, preservando `dependencies.oneOf`, `x-form-tabs` y `x-form-sections`.
  - Resolución offline de schemas (`useResolvedSchema` offline): los campos con `catalogCode` se resuelven contra la tabla local `catalog_items` en Dexie; los formatos `employee` y `team` se resuelven contra la tabla local `directory_entries` sin llamadas de red.
  - Al editar y guardar propiedades dinámicas en una Tarea u Orden, se actualiza `propertiesJson` localmente en Dexie y se propaga la vista actualizada a las entidades vinculadas en el dispositivo.
- Ejecución de checklist dinámico: formulario RJSF v6 renderizado desde `checklistSchema` + `uiSchema`, validación Ajv8 offline, borrador autosave cada 2 s de inactividad.
- Comentarios e historial de tarea: lectura y alta offline de comentarios (`task.comment` en outbox) y visualización del timeline local + servidor.
- Evidencias: fotos (con compresión), nota de texto y `geocheck`, mapeadas a `TaskEvidence.Type`.

### 4.2 `incidents` — Incidencias en sitio y máquina de estados dinámica

- **Consulta y seguimiento por asignación**: listado de incidencias reportadas por el técnico o asignadas a él / su cuadrilla (`assignedEmployeeId`, `assignedTeamId`), con navegación cruzada hacia sus Órdenes y Tareas derivadas (`IncidentTasksWidget`).
- **Máquina de estados dinámica por `WorkflowTemplate` (paridad con `IncidentDetailPage` de `apps/web`)**:
  - Las transiciones disponibles desde el estado actual (`incident.state`) se calculan en base a `workflowTemplate.lifecycleStates` (`transitions[state]` o `states[state].allowedTransitions`).
  - **Campos obligatorios por transición (`requiresFields`)**: si el estado destino define `requiresFields: string[]` en `lifecycleStates.states[targetState]`, al solicitar la transición se abre un Bottom Sheet con el sub-schema RJSF de esos campos. Al confirmar, se actualiza `incident.propertiesJson` + `incident.state` y se encola `incident.state` en el outbox.
- Alta de incidencia vinculada a un activo (por búsqueda o escaneo) y plantilla de workflow (`workflowTemplateId`), con severidad, descripción, propiedades dinámicas RJSF y `affectsOperation`.
- Fotos: hasta 6 por incidencia; compresión cliente obligatoria; preview con opción de eliminar antes de encolar.
- Geolocalización automática al abrir el formulario; **nunca bloqueante**: si el permiso se deniega o hay timeout (8 s), se guarda sin coordenadas y se marca `geoStatus = 'unavailable'`.
- Borrador persistente: si la app se cierra a mitad de carga, el borrador sobrevive (tabla `incidents` con `syncState = 'draft'`).
- Una incidencia creada offline se puede adjuntar a una tarea u orden en curso en el mismo dispositivo.

### 4.3 `assets` — Identificación, campos dinámicos, máquina de estados, georreferencia y BOM

- Búsqueda local por `code`, `name`, `serial`, ubicación y `searchCodes` (QR/barcode), con normalización (mayúsculas, sin acentos) y prefijo.
- Escaneo por cámara (`BarcodeDetector` cuando exista; fallback a `@zxing/browser`), con antirrebote de 1.5 s y feedback háptico.
- **Ficha completa y edición de campos dinámicos offline (paridad con `AssetDetailPage` de `apps/web`)**:
  - Visualización y edición offline (`assets:update`) de `name`, `code` y propiedades dinámicas (`propertiesJson` renderizado con `schemaJson` del template vía `useResolvedSchema` offline).
  - **Motor de reglas de validación dinámica (`dynamic-validation-rules`)**: antes de guardar `propertiesJson` se ejecutan offline las reglas configuradas en el schema (`requiredIf`, `range`, `compareField` entre fechas/números/textos, `dateConstraint` respecto a hoy y `pattern` con presets `email`, `phone`, `alphanumeric`, `rfc_mx`, `vin` o regex custom).
- **Máquina de estados dinámica del Activo (`asset.lifecycleStates`)**:
  - Calcula transiciones permitidas desde `lifecycle.transitions[asset.state]`.
  - Soporta `requiresFields` por estado destino (excluyendo booleanos de `required` estricto para permitir `false`, y preservando `dependencies`, `x-form-tabs`, `x-form-sections`).
  - Soporta `associatedModule`: si el estado destino exige delegar a una Incidencia u Orden de Mantenimiento, abre el flujo correspondiente en campo y vincula la transición.
- **Georreferencia (`geoJson`) y Jerarquía (`parentId`)**:
  - Visualización de coordenadas en mapa/ficha y botón "Actualizar ubicación GPS en sitio" que captura coordenadas del dispositivo, arma `geoJson = { type: 'Point', coordinates: [longitude, latitude] }` y encola `asset.update`.
  - Cambio de activo padre (`parentId`, permiso `assets:move`) encolado como `asset.move`.
- **BOM del Activo (`asset_bom_materials` — Lista de Materiales y Repuestos)**:
  - Consulta offline de los repuestos del activo (`catalogItemCode`, `catalogItemLabel`, `quantity`, `unitOfMeasure`, `isCritical`, `notes`).
  - Alta, edición y baja offline de ítems del BOM (`asset.material.add`, `asset.material.update`, `asset.material.delete`) cuando el usuario tiene `assets:update`.
- **Seguimiento cruzado en la ficha del Activo**:
  - Pestañas/widgets locales que listan todas las **Tareas**, **Órdenes de Trabajo** e **Incidencias** vinculadas a ese `assetId` en Dexie, además de los últimos eventos del `AssetTimeline`. (Se excluye la pestaña contable de depreciación `FinanzasTab` por ser administrativa).

### 4.4 `inventory` y `order-parts` — Consumo de materiales y Repuestos de Órdenes de Trabajo

- **Gestión de Repuestos en Órdenes de Trabajo (`MaintenanceOrderPartsEditor` offline)**:
  - En cada Orden de Trabajo se listan y gestionan sus repuestos (`order_parts`): `catalogItemId`, `catalogItemLabel`, `quantity`, `unitCost`, `sourceType` (`None` | `Internal` | `External`), `warehouseId`, `externalSupplierName`, `externalReference`.
  - **Integración directa con el BOM del Activo**: al agregar un repuesto a la orden, la app sugiere en primer lugar los materiales del **BOM del activo (`asset_bom_materials`)** vinculado a la orden, además de permitir buscar en el catálogo/almacén local.
  - Respeta `inventorySettings.operatingMode` (`internal` | `hybrid` muestran selector de origen) y bloquea cambios cuando la orden está en estado `verified` o sin permiso `maintenance-parts:manage`.
- Listado del stock del almacén móvil del técnico, con `qtyAvailable`, `qtyReservedLocal` y `qtyConsumedLocal`.
- Consumo ligado a una tarea u orden: cantidad + material; descuenta localmente y encola `material.consume` en el outbox.
- Política de stock negativo respetada desde `inventory/settings.allowNegativeStock` cacheado: si es `false`, la UI bloquea el consumo con `qtyDisponible <= 0`.
- Si el servidor rechaza por stock insuficiente, se revierte el descuento local y se ofrece stock alternativo del mismo almacén.

### 4.5 Transversal

- **Sesión**: login online → lease offline firmado; bloqueo por PIN/biometría al reabrir (dispositivo compartido).
- **Estado de sync**: chip persistente (`Sin conexión · 4 pendientes`, `Sincronizando 2/4`, `1 conflicto`, `Todo sincronizado`), con pantalla de detalle del outbox.
- **PWA**: instalable, `display: standalone`, app shell cacheado, actualización controlada (nunca recarga con outbox en vuelo).
- **UX móvil**: Bottom Tabs (máx. 5), touch targets ≥ 48 px, Bottom Sheets en lugar de modales centrados, alto contraste (≥ 7:1) en ambos temas, soporte de `safe-area-inset`, tipografía ≥ 16 px en inputs (evita zoom iOS).

---

## 5. Criterios de aceptación (Gherkin: Given-When-Then)

> Los `.feature` ejecutables usarán `# language: es` (`Dado/Cuando/Entonces`). Aquí se mantienen las palabras clave en inglés por legibilidad del estándar.

### 5.1 Instalación, app shell y arranque

```gherkin
Scenario: Instalación de la PWA en Android
  Given un técnico autenticado en Chrome Android con conectividad
  When visita field-pwa por segunda vez y acepta el prompt de instalación
  Then la app se abre en modo standalone sin barra de navegador
  And la app shell (HTML, JS, CSS, fuentes) queda precacheada
  And el indicador de sync muestra el estado actual ("Sin conexión" o "Todo sincronizado")

Scenario: Arranque en frío sin red
  Given la app fue instalada y abierta al menos una vez con red
  And el dispositivo está en modo avión
  When el técnico abre la app desde el ícono
  Then la app shell carga en menos de 3 s en un dispositivo Android de gama media
  And la lista de tareas de la jornada se muestra desde IndexedDB
  And no se muestra ningún error bloqueante de red
  And el chip de estado indica "Sin conexión"

Scenario: Control de actualización con outbox en vuelo
  Given existe una nueva versión del service worker
  And hay 3 mutaciones pendientes en el outbox
  When la app detecta la actualización
  Then NO se aplica `skipWaiting` automáticamente
  And se muestra "Actualización disponible · se aplicará al sincronizar"
  And la actualización se aplica sólo cuando el outbox queda vacío
```

### 5.2 Autenticación y sesión desconectada

```gherkin
Scenario: Login online con emisión de lease offline
  Given un técnico con credenciales válidas y un tenant con política de lease de 12 h
  When inicia sesión en la PWA con conectividad
  Then se almacenan access token, refresh token y un lease offline firmado por el servidor con expiración a 12 h
  And los tokens se guardan cifrados con una clave WebCrypto no exportable del dispositivo
  And la app descarga la jornada de tareas antes de declararse lista

Scenario: Operación offline dentro del lease
  Given un técnico con lease vigente y sin conectividad
  When completa una tarea y reporta una incidencia
  Then ambas mutaciones se persisten localmente
  And se encolan en `outbox_mutations` con estado `pending`
  And la app permanece totalmente operativa (sin modo lectura)

Scenario: Lease expirado sin conectividad
  Given un técnico sin conectividad cuyo lease offline expiró hace 2 h
  When intenta iniciar una nueva tarea
  Then la app entra en modo sólo lectura
  And se muestra "Sesión offline expirada · conéctate para continuar"
  And las mutaciones ya encoladas se preservan intactas
  And las consultas de activos y tareas siguen disponibles

Scenario: Refresh revocado durante la sincronización
  Given un outbox con 2 mutaciones pendientes
  And el refresh token fue revocado en el servidor
  When el motor de sync obtiene 401 al refrescar
  Then la sesión se congela y NO se reintenta la mutación
  And se informa "Sesión revocada · se requiere reingreso"
  And el outbox se preserva por 7 días antes de ofrecer su descarte
```

### 5.3 Ciclo de vida de tareas

```gherkin
Scenario: Descarga de la jornada
  Given un técnico autenticado con 12 tareas asignadas en los próximos 7 días
  When la app ejecuta la sincronización inicial
  Then las 12 tareas se persisten en la tabla `tasks` con sus activos y checklists
  And cada tarea tiene `syncState = 'synced'` y `cachedAt` con la hora del servidor
  And la descarga completa en menos de 15 s en 3G

Scenario: Iniciar tarea sin conectividad
  Given una tarea en estado `todo` cacheada localmente
  And el dispositivo sin conectividad
  And el permiso de geolocalización concedido con precisión de 12 m
  When el técnico pulsa "Iniciar"
  Then la tarea pasa a `in_progress` en la UI en menos de 100 ms
  And se registra `startedAtLocal` con la hora local corregida por skew
  And se registra una evidencia `geocheck` con latitud, longitud, precisión y timestamp local
  And se encola exactamente 1 mutación `PUT /api/v1/work-tasks/{id}/state` con `Idempotency-Key` UUIDv7
  And el chip de sync muestra "1 pendiente"

Scenario: Geolocalización denegada no bloquea la operación
  Given una tarea en estado `todo`
  And el técnico denegó el permiso de ubicación
  When pulsa "Iniciar"
  Then la tarea cambia a `in_progress` igualmente
  And la evidencia `geocheck` se registra con `geoStatus = 'unavailable'`
  And se muestra un aviso no bloqueante "Iniciada sin ubicación"

Scenario: Reintento rápido no genera doble transición
  Given una tarea con "Iniciar" ya pulsado y la mutación en vuelo
  When el técnico pulsa "Iniciar" nuevamente 3 veces
  Then sólo existe 1 mutación en el outbox para esa transición
  And el botón queda deshabilitado mostrando "Iniciando…"

Scenario: Transición no permitida por el servidor
  Given una tarea local en `in_progress` con 1 mutación pendiente
  And el supervisor la completó en el servidor, quedando en `done`
  When el motor de sync envía la transición y recibe 409 con el estado actual `done`
  Then la tarea local se reconcilia a `done` (server-wins)
  And la mutación se marca `discarded` con motivo `invalid_transition`
  And se muestra "Esta tarea ya fue completada en el servidor" con opción de ver historial

Scenario: Tarea devuelta por el supervisor
  Given una tarea que el técnico ve como `in_progress` en caché
  And el supervisor la movió a `rework` con el motivo "Falta medición de vibración"
  When el motor de sync hace el pull de la jornada
  Then la tarea local pasa a `rework` y aparece primera en la lista con banner de corrección
  And el motivo del rework se muestra completo
  And el técnico puede reanudarla con "Iniciar" (transición `rework → in_progress`)

Scenario: Completar sin conexión con checklist incompleto
  Given una tarea en `in_progress` con un checklist de 5 preguntas obligatorias
  And sólo 3 respondidas
  When el técnico pulsa "Completar"
  Then la acción se bloquea
  And el formulario hace scroll a la primera pregunta faltante
  And se muestra "Faltan 2 ítems obligatorios"
```

### 5.4 Checklists dinámicos (RJSF v6 + Ajv8)

```gherkin
Scenario: Render offline del checklist desde el esquema
  Given una tarea con `checklistSchema` (JSON Schema draft-07) y `checklistUiSchema` cacheados
  And sin conectividad
  When el técnico abre la tarea
  Then el formulario se renderiza con `@rjsf/core` v6 y el validador Ajv8 configurado
  And los campos condicionales (`dependencies`/`if-then`) se evalúan localmente
  And el formulario responde a interacción en menos de 100 ms

Scenario: Persistencia del borrador del checklist
  Given un checklist con 3 de 8 ítems respondidos
  When la app se cierra por falta de batería
  Then al reabrir, los 3 ítems siguen respondidos
  And el borrador no se encola en el outbox hasta el envío explícito

Scenario: Validación de esquema rechaza datos inválidos
  Given un checklist con un ítem `enum` y un ítem `number` con `minimum: 1`
  When el técnico envía valores fuera de rango
  Then Ajv8 produce errores por campo
  And los mensajes se muestran junto a cada campo en español
  And no se encola ninguna mutación
```

### 5.5 Incidencias y fotos

```gherkin
Scenario: Alta de incidencia completamente offline
  Given un técnico sin conectividad frente al activo "PUMP-01"
  When registra una incidencia con severidad "alta", 2 fotos y descripción
  Then la incidencia se persiste en `incidents` con `syncState = 'pending'` y un `id` UUIDv7 generado localmente
  And las 2 fotos se comprimen a ≤ 250 KB y ≤ 1600 px de lado mayor
  And cada foto se persiste como Blob en `media_queue` con `status = 'pending'`
  And ambas mutaciones (incidencia + media) quedan vinculadas por `dependsOn`
  And la incidencia aparece inmediatamente en la lista local con marca "pendiente de envío"

Scenario: Compresión de foto desde cámara
  Given una foto de 12 MP capturada con la cámara del dispositivo
  When la app la procesa antes de encolar
  Then el blob resultante pesa menos de 250 KB
  And conserva orientación EXIF aplicada (sin pérdida de rotación)
  And el tiempo de procesamiento es menor a 1.5 s en un dispositivo de gama media
  And se guarda un `sha256` del blob para deduplicación

Scenario: Orden de envío respeta dependencias
  Given una incidencia pendiente que referencia 2 fotos locales
  When el motor de sync drena el outbox tras recuperar conectividad
  Then primero se suben las fotos a `POST /api/v1/media/upload`
  And las URLs locales se reemplazan por las remotas en el payload de la incidencia
  And sólo entonces se envía `POST /api/v1/incidents`
  And la incidencia local se actualiza con el `id` del servidor sin perder el vínculo con sus fotos

Scenario: Cuota de almacenamiento agotada
  Given el dispositivo con menos de 10 MB libres
  When el técnico intenta adjuntar una tercera foto
  Then la captura se bloquea antes de escribir el blob
  And se muestra "Almacenamiento lleno · sincroniza o elimina fotos pendientes"
  And no se corrompe ninguna incidencia existente
```

### 5.6 Activos: escaneo y consulta

```gherkin
Scenario: Escaneo de QR offline
  Given la tabla `assets` con el activo "PUMP-01" cuyo `searchCodes` incluye "ASSET-PUMP-01"
  And sin conectividad
  When el técnico escanea el QR del activo
  Then la ficha del activo se abre en menos de 800 ms
  And se muestran código, nombre, criticidad, ubicación y estado
  And se muestra "historial en caché" con la fecha del último cacheo

Scenario: Búsqueda por código con normalización
  Given activos cacheados con códigos "PUMP-01" y "Pump-02"
  When el técnico busca "pump"
  Then se listan ambos activos
  And la búsqueda responde localmente sin llamada de red

Scenario: Escaneo de un activo no cacheado
  Given un QR cuyo código no existe en la caché local
  And el dispositivo con conectividad
  When el técnico lo escanea
  Then la app consulta `POST /api/v1/assets/search` y cachea el resultado
  And si no hay conectividad, se muestra "Activo no disponible sin conexión" con opción de crear incidencia genérica
```

### 5.7 Materiales

```gherkin
Scenario: Consumo de material offline con reserva local
  Given una tarea `in_progress` y stock local de 10 unidades del material "FILTRO-A"
  When el técnico registra el consumo de 2 unidades
  Then `qtyConsumedLocal` pasa a 2 y `qtyAvailable` visible a 8
  And se encola 1 mutación de ajuste con `Idempotency-Key` única
  And el movimiento local queda ligado a la tarea

Scenario: Rechazo del servidor por stock insuficiente
  Given un consumo local de 2 unidades encolado
  And el servidor reporta stock 0 para ese material
  When el motor recibe 409 `insufficient_stock`
  Then el descuento local se revierte a 0 consumido
  And la mutación pasa a `blocked` con acción requerida
  And se ofrece stock alternativo del mismo almacén

Scenario: Política de stock negativo deshabilitada
  Given el tenant con `allowNegativeStock = false`
  And stock local 0 del material "ACEITE-15W40"
  When el técnico intenta consumir 1 unidad
  Then el botón está deshabilitado con el motivo "Sin stock en almacén móvil"
  And no se encola ninguna mutación
```

### 5.8 Outbox, idempotencia y conflictos

```gherkin
Scenario: Drenado con reintentos exponenciales
  Given 1 mutación pendiente y el backend respondiendo 503
  When el motor de sync reintenta
  Then los intervalos son 5 s, 15 s, 45 s, 2 m, 6 m, 20 m, 1 h y 3 h con jitter de ±20 %
  And tras el 8.º intento la mutación pasa a `dead_letter`
  And se notifica al técnico con una acción "Reintentar" y "Enviar a supervisor"

Scenario: Idempotencia ante respuesta perdida
  Given una mutación `POST /api/v1/incidents` enviada con `Idempotency-Key` K
  And el servidor la procesó pero la respuesta se perdió por timeout
  When el motor reintenta con la misma key K
  Then el servidor devuelve la respuesta original (mismo `id`)
  And no se crea una segunda incidencia
  And el outbox marca la mutación como `done`

Scenario: Orden FIFO por agregado, paralelismo entre agregados
  Given 3 mutaciones sobre la tarea A y 2 sobre la tarea B
  When el motor drena el outbox
  Then las mutaciones de A se envían en orden estricto
  And las de B se envían en orden estricto
  And A y B se procesan en paralelo (máx. 3 concurrentes)

Scenario: Coalescencia de transiciones
  Given una tarea con transición pendiente `in_progress`
  When el técnico la pausa antes de que la primera se envíe
  Then el outbox contiene una sola mutación con el estado final `paused`
  And conserva el `timestampLocal` y la geolocalización de cada transición en el historial local

Scenario: Background Sync con la app cerrada
  Given un outbox con 2 mutaciones y la app cerrada en Chrome Android
  When el sistema operativo dispara el evento `sync` con tag `outbox-drain`
  Then el service worker drena las mutaciones de sólo-JSON
  And las mutaciones con blobs quedan para el próximo arranque de la app
  And al abrir la app el chip muestra "Todo sincronizado"

Scenario: Conflicto de versión en checklist
  Given un checklist con 4 ítems respondidos localmente
  And otro usuario respondió 3 ítems en el servidor
  When el envío recibe 412 con la versión actual
  Then se abre un Bottom Sheet de reconciliación campo por campo
  And los valores del servidor ganan por defecto
  And el técnico puede sobrescribir ítem por ítem antes de reenviar
```

### 5.9 Seguridad, aislamiento y purga

```gherkin
Scenario: Aislamiento multi-tenant en dispositivo compartido
  Given un dispositivo usado por técnicos de dos tenants en días distintos
  When el técnico del tenant B inicia sesión
  Then se ejecuta la purga de datos del tenant A (tareas, activos, incidencias, blobs y outbox)
  And ninguna consulta del tenant B devuelve registros del tenant A
  And si el tenant A tenía outbox pendiente, la purga se bloquea y se advierte antes de cerrar sesión

Scenario: Cierre de sesión con datos pendientes
  Given un outbox con 2 mutaciones pendientes
  When el técnico pulsa "Cerrar sesión"
  Then se le advierte que perderá 2 cambios no sincronizados
  And se ofrece "Sincronizar ahora" o "Salir y descartar"
  And la sesión no se cierra hasta una elección explícita

Scenario: Datos cifrados en reposo
  Given tokens y payloads sensibles almacenados en IndexedDB
  When se inspecciona el almacenamiento del dispositivo
  Then los tokens están cifrados con AES-GCM y una clave no exportable
  And ningún token aparece en `localStorage` ni en el payload del outbox
```

---

## 6. Requisitos no funcionales

| Categoría | Requisito | Medición |
| :--- | :--- | :--- |
| Rendimiento | Interacción local < 100 ms en listas de 200 tareas | Lighthouse/PerformanceObserver p75 |
| Rendimiento | Ficha de activo desde escaneo < 800 ms offline | E2E instrumentado |
| Rendimiento | Descarga de jornada < 15 s en 3G (12 tareas, 20 activos) | E2E con throttling |
| Rendimiento | Bundle inicial ≤ 250 KB gzip (sin RJSF, cargado lazy) | `rollup-plugin-visualizer` + budget CI |
| Confiabilidad | 0 mutaciones duplicadas en 1 000 reintentos simulados | Test de integración |
| Confiabilidad | Ninguna pérdida de datos ante cierre abrupto (kill -9 del navegador) | Test Playwright de crash |
| Almacenamiento | DB local ≤ 150 MB en régimen; aviso al 80 % de cuota | `navigator.storage.estimate()` |
| Batería | Sin timers de polling con pantalla apagada | Revisión de código + DevTools |
| Accesibilidad | Touch targets ≥ 48×48 px; contraste ≥ 7:1 (AAA) en ambos temas | jest-axe + auditoría manual |
| Accesibilidad | Navegable por teclado y lector de pantalla; `lang="es"` | axe + VoiceOver/TalkBack |
| i18n | UI en español; estructura i18next preparada para en-US | Revisión |
| Compatibilidad | Android Chrome ≥ 120 (primario), iOS Safari ≥ 17 (secundario, sin Background Sync) | Matriz de pruebas |
| Seguridad | Tokens cifrados en reposo; sin secretos en bundle; CSP estricta | Auditoría + `npm audit` |
| Privacidad | Geolocalización sólo con consentimiento explícito y finalidad operativa | Revisión de flujo |

**Matriz de capacidades por navegador (realidad, no deseo)**

| Capacidad | Android Chrome | iOS Safari |
| :--- | :--- | :--- |
| Service Worker + app shell | Sí | Sí |
| Background Sync (`sync`) | Sí | **No** |
| Periodic Background Sync | Sí (PWA instalada) | **No** |
| Persistencia de storage | Sí | Limitada (7 días sin uso) |
| `BarcodeDetector` | Sí | **No** (fallback ZXing) |
| Captura de cámara | Sí | Sí (`capture` en input) |

> Consecuencia de diseño: en iOS el drenado del outbox ocurre en foreground (`online` + `visibilitychange`), y la app debe forzar un `sync` al reabrir. Ninguna funcionalidad puede depender exclusivamente de Background Sync.

---

## 7. Decisiones técnicas obligatorias

| ID | Decisión | Rationale |
| :-- | :--- | :--- |
| **D1** | App separada `apps/field-pwa`, no una ruta de `apps/web` | Presupuestos de bundle y ciclo de release distintos; `apps/web` no debe cargar Dexie/Workbox |
| **D2** | Toda la lógica offline vive en `packages/core-offline` (sin React, sin DOM) | Permite ejecutarla también dentro del service worker; testeable con Vitest + fake-indexeddb |
| **D3** | Ningún componente importa `axios`/`fetch`; sólo repositorios de `core-offline` | Regla de lint `no-restricted-imports` (ver plan §9) |
| **D4** | Dexie.js como única fuente de verdad local (incluida la caché de API) | Evita dos cachés incoherentes (Workbox + Dexie) |
| **D5** | Outbox transaccional: la escritura de dominio y el encolado ocurren en la **misma** transacción Dexie | Sin esto aparecen estados imposibles (dato escrito sin mutación, mutación sin dato) |
| **D6** | `Idempotency-Key` = UUIDv7 generado **al encolar**, persistido en la fila y reutilizado en cada reintento | Regenerarla en el reintento anula la idempotencia |
| **D7** | Conflictos por token de versión (`ETag`/`If-Match`), nunca por `updatedAt` | Comparar timestamps con relojes distintos produce falsos positivos; requiere B2 |
| **D8** | `stock` nunca resuelve por last-write-wins | Un descuento duplicado o perdido es un error contable; el servidor es autoritativo |
| **D9** | Checklist = `checklistSchema` + `uiSchema` JSON Schema **snapshot** en la tarea | Editar la plantilla no debe reescribir checklists históricos; requiere B3 |
| **D10** | Lease offline firmado por el servidor (`offline_lease` JWT), validado con JWKS cacheado | Sin firma, el cliente podría extender su propia sesión; requiere B4 |
| **D11** | Reutilizar `@asset-hub/ui`; los primitivos móviles nuevos (`BottomSheet`, `TabBar`, `TapTarget`) se agregan **allí** | No duplicar componentes (requisito explícito del brief) |
| **D12** | `vite-plugin-pwa` en modo `injectManifest` con Workbox | Se necesita un SW propio para `sync`, `periodicsync` y mensajería con la app |
| **D13** | Blobs de foto en IndexedDB (≤ 250 KB) y no en CacheStorage | Consistencia transaccional con la cola; `CacheStorage` no participa de transacciones Dexie |
| **D14** | La app es read-write offline, pero la **creación de tareas** queda fuera de alcance | Requiere numeración/asignación server-side; evita colisiones de identidad |
| **D15** | "Pausar" se modela como estado de servidor (`paused`), no como pausa local efímera | Una pausa local es invisible para el supervisor y descuadra el Kanban; requiere B9 |

---

## 8. Dependencias bloqueantes fuera de esta app (backend / plataforma)

Estas piezas **no existen hoy** (verificado, V4–V7). Sin ellas, el MVP no puede cumplir los criterios de §5.8.

> **Dueño canónico**: la especificación, el plan, las tareas y el contrato OpenAPI de estos cambios viven en `specs/022-field-sync-backend/`. Esta tabla es el índice de dependencias que consume `021-pwa-field-app`; **no** debe duplicarse como tarea aquí (una sola fuente de verdad).

| ID | Cambio requerido | Motivo | Bloquea |
| :-- | :--- | :--- | :--- |
| **B1** | Middleware de idempotencia: persistir `Idempotency-Key` + hash de request + respuesta (TTL 72 h) y reproducir la respuesta original | Sin esto, un timeout genera duplicados | US-8 |
| **B2** | Token de concurrencia en `WorkTask`, `Incident`, `Asset`: `RowVersion` (`byte[]`) expuesto como `ETag`, validado con `If-Match` → `412` / `409` | No existe hoy (V5) | US-3, US-5, US-8 |
| **B3** | `ChecklistSchemaJson`, `ChecklistUiSchemaJson` y `ChecklistResponseJson` en `WorkTask` (snapshot al asignar) + endpoint de envío | `MaintenanceChecklist` es un array plano (V4) | US-4 |
| **B4** | `POST /api/v1/auth/offline-lease` que emita un JWT de lease (12 h, configurable por tenant) firmado con la misma clave y `jwks` público | Access token dura 15 min (V7); offline de 8 h es imposible sin lease | US-2 |
| **B5** | Endpoint de consumo de materiales con semántica de movimiento (`POST /api/v1/inventory/consumptions`) idempotente, con `If-Match` sobre `StockBalance.RowVersion` | `adjustments` no expresa consumo ligado a tarea | US-7 |
| **B6** | Endpoints delta para pull: `GET /api/v1/work-tasks?updatedSince=…`, `GET /api/v1/incidents?updatedSince=…`, `GET /api/v1/assets/changes?since=…` con cursor opaco | Sin delta, cada sync full-refresh es inviable en campo | US-1, US-3, US-6 |
| **B7** | `GET /api/v1/work-tasks/{id}/evidences` (hoy sólo existe `POST`) | El técnico debe ver la evidencia ya cargada | US-5 |
| **B8** | Rol/permisos `field-technician` con el set mínimo de §3 | Evita dar permisos administrativos al dispositivo de campo | Todos |
| **B9** | Estado `paused` en `WorkTaskStates` + transiciones `in_progress→paused` y `paused→in_progress` en `TaskStateTransitionValidator`, con impacto en el Kanban de `apps/web` y migración de datos | Hoy no existe `paused` (V13); sin esto, "Pausar" no puede persistirse en el servidor | US1 |

**Si B1–B4 no se implementan, esta app debe reducirse a "read-only offline + captura local sin sync"**, lo cual no cumple el objetivo de negocio. Se recomienda tratarlas como un spec hermano (`022-field-sync-backend`) ejecutado en paralelo.

---

## 9. Fuera de alcance (explícito)

1. **Creación o reasignación de tareas** desde la PWA (sólo ejecución de las asignadas).
2. **Creación/edición de activos** y de plantillas (`AssetTemplate`).
3. **Firma digital capturada en canvas** (el modelo `TaskEvidence` la soporta, pero no es MVP).
4. **Modo colaborativo en tiempo real** (presencia, edición concurrente con cursores).
5. **Gestión de almacenes, transferencias entre almacenes y compras** (sólo consumo desde stock móvil).
6. **Reportes, dashboards y analítica** — viven en `apps/web`.
7. **Notificaciones push** (`Notification` in-app del backend) — se evalúa en V2.
8. **Sincronización peer-to-peer / Bluetooth entre dispositivos**.
9. **MAPs offline vectoriales** y ruteo. La ubicación se muestra como coordenadas + texto, no como mapa navegable.
10. **Soporte de tablets en orientación horizontal como layout primario** (funciona, pero no se optimiza).
11. **Migración de datos de papel existentes**.
12. **App nativa (Capacitor/React Native)**. Si en V2 se requiere acceso a hardware propietario, se reevalúa.
13. **Multi-idioma completo** — sólo español de UI en V1.
14. **Cifrado de la DB completa con SQLCipher-like** — sólo cifrado selectivo de secretos (D10/§7 plan).

---

## 10. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
| :--- | :-: | :-: | :--- |
| B1–B9 no se priorizan y el MVP pierde su valor | Media | Crítico | `specs/022-field-sync-backend/` ya está especificado (86 tareas, contrato OpenAPI y ADRs); se ejecuta como Fase 0 antes de cualquier pantalla |
| `RowVersion` agregado a entidades existentes rompe `apps/web` | Media | Alto | Campo nullable + migración aditiva; `apps/web` ignora el header |
| Safari iOS purga IndexedDB tras 7 días sin uso | Media | Alto | `navigator.storage.persist()`, aviso de "sincroniza antes de 7 días", lease corto |
| Cuota de almacenamiento agotada por fotos | Alta | Medio | Compresión ≤ 250 KB, límite 6 fotos/incidencia, purga de media ya subida |
| Relojes de dispositivo desviados | Alta | Medio | Skew calculado desde headers `Date` + timestamps monotónicos; el servidor decide en conflictos |
| Complejidad del motor de sync se subestima | Alta | Alto | `core-offline` sin UI, TDD estricto, simulador de red en tests (Fase 2 antes de cualquier pantalla) |
| Duplicación de componentes UI con `apps/web` | Media | Medio | Regla de lint + code review; nuevos primitivos sólo en `@asset-hub/ui` |
| Service worker sirviendo versiones mezcladas | Media | Alto | `injectManifest` con hash de precache; actualización diferida hasta outbox vacío |

---

## 11. Supuestos y decisiones asumidas (validar)

**P0 — bloqueantes, resueltos con un default explícito para poder planificar:**

| # | Pregunta | Default asumido |
| :-: | :--- | :--- |
| P0-1 | ¿B1–B4 se implementan en este mismo alcance o en un spec hermano? | **Resuelto 2026-10-28**: spec hermano `specs/022-field-sync-backend/` (spec + plan + tasks + OpenAPI), que pasa a ser el dueño canónico de B1–B9 y se ejecuta como Fase 0 de esta feature |
| P0-2 | ¿Duración del lease offline? | 12 h, configurable por tenant (rango 4–24 h) |
| P0-3 | ¿El técnico puede operar en más de un tenant en el mismo dispositivo? | Sí, con purga obligatoria al cambiar de tenant |
| P0-4 | ¿Política ante `insufficient_stock`? | Server-wins + reversión local + sugerencia de alternativa |

**P1 — no bloqueantes para iniciar, sí para cerrar el MVP:**

| # | Pregunta | Default asumido |
| :-: | :--- | :--- |
| P1-1 | Ventana de descarga de la jornada | Hoy → +7 días, configurable |
| P1-2 | ¿Se permite modificar el checklist después de completar la tarea? | No; sólo lectura |
| P1-3 | ¿Se requiere aprobación del supervisor para cerrar incidencias? | No en V1 |
| P1-4 | Retención de media local tras subida exitosa | 7 días, luego purga del blob (metadato permanece) |

**P2 — decisiones de producto futuras:** push notifications, firma digital, mapas offline, multi-idioma.

---

## 12. Glosario

| Término | Definición |
| :--- | :--- |
| **Jornada** | Conjunto de tareas + activos + stock descargado para operar offline |
| **Outbox** | Cola local de mutaciones pendientes de envío, con idempotencia y reintentos |
| **Lease offline** | Token firmado por el servidor que autoriza operar sin red hasta una fecha |
| **Dead letter** | Mutación que agotó los reintentos y requiere intervención humana |
| **Coalescencia** | Fusión de mutaciones sucesivas sobre el mismo agregado antes de enviarlas |
| **Tombstone** | Marca local de entidad eliminada en el servidor, para purgar caché sin recrearla |
| **Skew** | Diferencia entre el reloj del dispositivo y el del servidor |
