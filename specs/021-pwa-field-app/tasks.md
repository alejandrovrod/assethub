# Tareas: `field-pwa` (PWA Offline-First de campo)

**Input**: `specs/021-pwa-field-app/spec.md`, `specs/021-pwa-field-app/plan.md`
**Prerrequisitos**: plan.md aprobado; respuestas a P0-1…P0-4 del spec §11
**Organización**: por fase y por historia de usuario, para que cada historia sea implementable y testeable de forma independiente

## Formato

`[ID] [P?] [Story] Descripción`

- **[P]**: paralelizable (archivos distintos, sin dependencias)
- **[Story]**: `US1` work-tasks · `US2` incidents · `US3` assets · `US4` inventory · `US5` sync/conflictos/confiabilidad
- TDD: en cada historia, las pruebas se escriben **antes** de la implementación

## Mapa de historias

| ID | Historia | Prioridad | Valor |
| :-: | :--- | :-: | :--- |
| US1 | Ejecutar tareas asignadas sin conectividad | P1 | Núcleo del negocio |
| US2 | Reportar incidencias con evidencia fotográfica offline | P1 | Calidad de datos |
| US3 | Identificar y consultar activos offline | P2 | Contexto en sitio |
| US4 | Consumir materiales desde stock móvil | P2 | Integridad de inventario |
| US5 | Confiar en la sincronización (outbox, conflictos, sesión) | P1 | Sin esto, US1–US4 no son usables |

---

## Fase 0 — Dependencia externa: `022-field-sync-backend` (bloqueante)

> **Esta fase ya no se ejecuta aquí.** Los antiguos T001–T018B se movieron a `specs/022-field-sync-backend/tasks.md` (86 tareas) para tener una sola fuente de verdad. Los IDs T001–T018B de este documento quedan **retirados**; no se reutilizan.

**Gate**: las Fases 3–10 de esta app no comienzan hasta que `specs/022-field-sync-backend/` esté completo y desplegado en el entorno de desarrollo.

| Capacidad | Dueño (spec 022) | Tareas 022 | Habilita en 021 |
| :--- | :--- | :--- | :--- |
| B1 · Idempotencia HTTP | Fase 2 | T005–T016 | US5, Fase 3 |
| B2 · Concurrencia (`ETag`/`If-Match`) | Fase 3 | T017–T026 | US1, US2, US5 |
| B3 · Checklist versionado | Fase 4 | T027–T035 | US1 (checklists) |
| B5 · Consumos de materiales | Fase 5 | T036–T044 | US4 |
| B6 · Delta sync + tombstones | Fase 6 | T045–T056 | US1, US3, US5 |
| B9 · Estado `paused` | Fase 7 | T057–T063 | US1 (pausar/reanudar) |
| B4 · Lease offline + JWKS | Fase 8 | T064–T071 | Fase 5 (auth) |
| B7 · `GET` evidencias | Fase 9 | T072–T073 | US1, US2 |
| B8 · Rol `field-technician` | Fase 9 | T074–T077 | Fase 5 |

**Checkpoint**: `022` desplegado; `contracts/openapi-field-sync.yaml` congelado; el middleware de idempotencia y el lease responden en el entorno de desarrollo.

---

## Fase 1 — Setup del monorepo

- [x] T019 Crear `asset-hub/src/frontend/apps/field-pwa/` con `package.json` (`name: "field-pwa"`), `index.html`, `tsconfig.json`, `vite.config.ts`, `tailwind` vía `@tailwindcss/vite`
- [x] T020 Agregar `dev:field`, `build:field`, `test:field`, `e2e:field` a `asset-hub/src/frontend/package.json` (`pnpm --filter field-pwa …`)
- [x] T021 [P] Crear `asset-hub/src/frontend/packages/core-offline/package.json` (`@asset-hub/core-offline`, `exports: ./src/index.ts`, `sideEffects: false`)
- [x] T022 [P] Configurar Vitest en `core-offline` (`environment: 'node'`, setup con `fake-indexeddb`, cobertura ≥ 85 %)
- [x] T023 [P] Agregar `dexie`, `dexie-react-hooks`, `vite-plugin-pwa`, `workbox-*`, `@zxing/browser` a `field-pwa` y `core-offline` según §2 del plan
- [x] T024 Configurar ESLint en `field-pwa` con `no-restricted-imports` (`axios`, `**/transport/**`) y `no-restricted-globals` (`localStorage`, `sessionStorage`) — plan §9
- [x] T025 [P] Configurar Tailwind v4 en `field-pwa` consumiendo `@asset-hub/ui/globals.css` + tokens de tema (`light`, `dark`, `high-contrast`)
- [x] T026 [P] Agregar `public/manifest.webmanifest` + iconos 192/512/maskable en `apps/field-pwa/public/icons/`
- [x] T027 Verificar que `pnpm --filter web build` sigue pasando sin cambios (no-regresión del monorepo)

**Checkpoint**: `pnpm --filter field-pwa dev` levanta un "hello world" con Tailwind y `@asset-hub/ui` importado.

---

## Fase 2 — `core-offline`: persistencia y utilidades (fundacional)

- [x] T028 Definir interfaces de registro en `packages/core-offline/src/db/schema.ts` (plan §5.3): `TaskRecord`, `AssetRecord`, `IncidentRecord`, `MaterialStockRecord`, `OutboxMutation`, `MediaQueueItem`, `SyncMetaRecord`, `AuthSessionRecord`, `GeoStamp`
- [x] T029 Implementar `FieldDatabase` en `packages/core-offline/src/db/database.ts` con `version(1).stores({...})` exactamente como el plan §5.2
- [x] T030 [P] Test `database.schema.test.ts`: crear DB en memoria, insertar una fila por tabla, verificar que cada índice declarado responde a una query (especialmente `[tenantId+assignedToId]`, `*searchCodes`, `&sha256`)
- [x] T031 [P] Test de convención: filas con `null`/`undefined` en campos indexados **no** aparecen en el índice → valida el uso de sentinelas (`0`, `''`)
- [x] T032 Implementar `uuidv7.ts` + test `uuidv7.test.ts` (orden monotónico dentro del mismo ms, 10 000 generaciones sin colisión, versión/variante correctas)
- [x] T033 [P] Implementar `monotonic.ts` (`performance.now()` wrapper con fallback) y `hashing.ts` (`sha256` con WebCrypto)
- [x] T034 [P] Implementar `clock-skew.ts` (mediana móvil de 5 muestras, `displayNow()`, guardia de skew > 10 min) + test
- [x] T035 Implementar `normalize.ts` (mayúsculas, sin acentos, trim) usado por `searchText`/`searchCodes` + test con casos "Pump-01"/"PUMP 01"/"púmp"
- [x] T036 Implementar `task.repository.ts` (queries de jornada, por id, contadores por `syncState`, purga por antigüedad)
- [x] T037 [P] Implementar `asset.repository.ts` (`findByCode`, `search` con prefijo + fallback substring, upsert con tombstones)
- [x] T038 [P] Implementar `incident.repository.ts` (borradores, pendientes, por activo)
- [x] T039 [P] Implementar `stock.repository.ts` (`availableFor = qtyAvailableServer - qtyReservedLocal`, listado por almacén)
- [x] T040 [P] Implementar `sync-meta.repository.ts` (cursores, tombstones, log de sync)
- [x] T040A [P] Extender `schema.ts` y `database.ts` con `maintenance_orders`, `workflow_templates`, `catalog_items`, `directory_entries` y campos de propagación (`maintenanceOrderId`, `maintenanceOrderState`, `incidentId`, `workflowTemplateId`, `propertiesJson`, `assignedEmployeeId`, `assignedTeamId`)
- [x] T040B [P] Implementar `maintenance-order.repository.ts` (filtrado por `assignedEmployeeId`/`assignedTeamId`, propagación local de `maintenanceOrderState` a tareas hijas en la misma transacción)
- [x] T040C [P] Implementar `workflow-template.repository.ts`, `catalog.repository.ts` y `directory.repository.ts` (resolución 100 % offline de `catalogCode`, `employee`, `team` y `lifecycleStates`)
- [x] T040D [P] Implementar motor offline de propagación y resolución de schemas (`propagation/propagated-schema.ts` + `propagation/resolve-schema.ts`: fusión de `asset.schemaJson` + `workflow_templates` de Incidencia/Orden/Tarea con `_source`, `x-form-tabs`, `x-form-sections` y `dependencies.oneOf`, paridad con `PropagatedPropertiesDisplay` y `useResolvedSchema`) + tests unitarios
- [x] T040E [P] Agregar soporte offline completo de **Activos (Campos dinámicos, Validación dinámica, Máquina de estados, Georreferencia `geoJson`, Jerarquía `parentId`), BOM (`asset_bom_materials`) y Repuestos de Órdenes (`order_parts`)** en `schema.ts`, `database.ts`, `asset.repository.ts`, `maintenance-order.repository.ts` y `validation/dynamic-validation-rules.ts` + tests unitarios

**Checkpoint**: la capa de datos funciona en tests sin navegador; cero dependencias de React.

---

## Fase 3 — `core-offline`: outbox y motor de sync (fundacional)

- [x] T041 Implementar `outbox.ts` con `enqueue(tx, mutation)`: exige que se llame **dentro** de una transacción Dexie existente; rechaza `id` no-UUIDv7
- [x] T042 [P] Test `outbox.transactionality.test.ts`: si el encolado lanza, la escritura de dominio se revierte (y viceversa) — invariante D5 del spec
- [x] T043 Implementar `backoff.ts` puro (`nextDelay(attempt, {retryAfterMs, rand})`) + test con `rand` inyectado para los 8 escalones y jitter ±20 %
- [x] T044 Implementar `coalesce.ts` (transiciones de tarea y checklist; **excluye** materiales y media) + test de los 3 casos
- [x] T045 Implementar `conflicts.ts` con la matriz del plan §6.6 (`resolveConflict(mutation, response)` → `{action, patch}`) + test de las 11 filas de la matriz
- [x] T046 Implementar `drainer.ts`: claim con lease de 60 s, recuperación de `in_flight` huérfano, pool de 3 agregados, FIFO por agregado, `dependsOn`, `attempts`, `dead` al 8.º fallo
- [x] T047 [P] Test `drainer.test.ts` con MSW: 2xx, 401→refresh→reintento, 409, 412+retry, 422, 5xx, timeout, `Retry-After`
- [x] T048 [P] Test `drainer.idempotency.test.ts`: 1 000 reintentos simulados de la misma mutación → 0 duplicados (NFR de confiabilidad)
- [x] T049 [P] Test `drainer.ordering.test.ts`: 3 mutaciones de A y 2 de B → orden intra-agregado estricto y paralelismo entre agregados
- [x] T050 Implementar `leader.ts` (BroadcastChannel + heartbeat de 5 s) + test con dos instancias simuladas
- [x] T051 Implementar `pull.ts` (delta por cursor, upsert que **no** pisa `syncState ≠ 'synced'`)
- [x] T052 [P] Test `pull.test.ts`: tarea con cambio local pendiente no se sobrescribe; se marca `conflict` si difiere
- [x] T053 Implementar `scheduler.ts` (`createSyncEngine({db, http, isOnline, now, fetch})`, triggers de §6.7, emisión de `SyncEvent`) + test de triggers
- [x] T054 Implementar `events.ts` (`SyncSnapshot` y suscripción) y `http-client.ts` (base URL, auth header, `Idempotency-Key`, `If-Match`, parseo de `ProblemDetails`, skew desde `Date`)
- [x] T055 [P] Test `http-client.test.ts`: no filtra tokens en logs, agrega headers correctos, propaga `code` de error

**Checkpoint**: motor de sync completo y probado sin UI. Es el entregable con mayor riesgo técnico y debe cerrarse antes de las historias.

---

## Fase 4 — PWA shell y Service Worker

- [x] T056 Configurar `VitePWA({ strategies: 'injectManifest', registerType: 'prompt' })` en `apps/field-pwa/vite.config.ts` según plan §8.1
- [x] T057 Implementar `apps/field-pwa/src/sw.ts`: precache, `navigateFallback`, `NetworkOnly` para `/api/v1/**`, `StaleWhileRevalidate` para media (60 entradas/30 días)
- [x] T058 Implementar handlers `sync` (`outbox-drain`) y `periodicsync` (`field-periodic-sync`) llamando `drainFromServiceWorker({ jsonOnly: true })`
- [x] T059 [P] Test manual documentado `docs/field-pwa/sw-matrix.md` + smoke E2E: app shell offline, API sin caché, media cacheada
- [x] T060 Implementar registro manual del SW en `src/app/providers.tsx`, mensajería `UPDATE_AVAILABLE` y flujo "aplicar cuando outbox esté vacío"
- [x] T061 Implementar `src/shared/components/OfflineBanner.tsx` + `SyncChip` con `SyncSnapshot`
- [x] T062 [P] Configurar Lighthouse CI con presupuestos de PWA (instalable, offline start, LCP ≤ 2.5 s)

**Checkpoint**: la app arranca en modo avión y muestra el estado de sync.

---

## Fase 5 — Autenticación y sesión offline

- [x] T063 Implementar `auth/session-store.ts` (AES-GCM con `CryptoKey` no exportable, cifrado de access/refresh, `pinHash` PBKDF2 210k) + test
- [x] T064 [P] Test `session-store.test.ts`: el token no queda en claro en IndexedDB; descifrar con clave incorrecta falla
- [x] T065 Implementar `auth/offline-lease.ts` (validación de firma con JWKS cacheado, verificación de `exp`/`tid`/`device`) + test con JWKS fixture
- [x] T066 Implementar máquina de estados de sesión de plan §7.3 (`ACTIVE`/`OFFLINE_LEASE`/`OFFLINE_READONLY`/`FROZEN`/`LOCKED`/`WIPED`) + test de transiciones
- [x] T067 Implementar login/logout en `features/auth/hooks/useSession.ts` + pantalla `routes/login.tsx` (online) con descarga inicial de jornada
- [x] T068 Implementar `LockScreen` con PIN/WebAuthn y `requireDeviceLock` por tenant
- [x] T069 Implementar `logout` con purga transaccional de las 8 tablas + borrado de caches del SW + advertencia si hay pendientes (spec §5.9) + test
- [x] T070 [P] Test `tenant-isolation.test.ts`: tras purga, ninguna query devuelve filas del tenant anterior

**Checkpoint**: sesión operativa online y offline, con lease y bloqueo de dispositivo.

---

## Fase 6 — US1: Ejecutar tareas sin conectividad (P1) 🎯 MVP

**Goal**: descargar la jornada, iniciar/pausar/completar tareas con timestamps y geolocalización, ejecutar checklists.

**Test independiente**: descargar 3 tareas con red, activar modo avión, iniciar y completar una, reconectar, verificar 2 mutaciones y timestamps locales preservados.

### Pruebas (escribir primero)

- [x] T071 [P] [US1] `commands.start-task.test.ts`: crea transición + evidencia `geocheck` + 1 mutación, todo en una transacción
- [x] T072 [P] [US1] `commands.start-task.geo.test.ts`: permiso denegado → `geoStatus='unavailable'` y no bloquea
- [x] T073 [P] [US1] `commands.complete-task.test.ts`: checklist incompleto bloquea; completo encola 2 mutaciones (checklist + estado)
- [x] T074 [P] [US1] `commands.coalesce.test.ts`: iniciar→pausar antes de enviar deja 1 mutación con estado final `paused`
- [x] T075 [P] [US1] E2E `e2e/tasks-offline.spec.ts`: escenario "Iniciar tarea sin conectividad" del spec §5.3

### Implementación

- [x] T076 [US1] Implementar `commands/start-task.ts`, `pause-task.ts`, `complete-task.ts` (transacción única: task + historial local + outbox + evidencia)
- [x] T077 [US1] Implementar `network/geolocation.ts` en `apps/field-pwa/src/shared/lib/geo.ts` (`getCurrentPosition` con timeout 8 s, `maximumAge: 0`, mapeo a `GeoStamp`)
- [x] T078 [US1] Implementar `hooks/useTasks.ts` (`useLiveQuery` sobre `[tenantId+assignedToId]`) y `hooks/useTaskActions.ts`
- [x] T079 [US1] Construir `routes/index.tsx` ("Mi jornada"): grupos vencidas/hoy/próximas, badge de sync por ítem, pull-to-refresh
- [x] T080 [US1] Construir `routes/tasks.$taskId.tsx`: cabecera de activo, vínculos a Orden de Trabajo (`maintenanceOrderId`) e Incidencia (`incidentId`), pestañas Detalles / Historial / Comentarios, acciones fijas al pie (56 px), historial local de transiciones con hora local
- [x] T080A [US1] Renderizar transiciones desde `allowedTransitions` del servidor (`022`/T061), aplicar regla de bloqueo por estado de la Orden (`maintenanceOrderState !== 'in_progress'` bloquea cambio de estado; `done`/`verified`/`cancelled` bloquea edición) y manejar el estado `rework` con banner de devolución + motivo
- [x] T080B [US1] Construir `routes/orders.index.tsx` y `routes/orders.$orderId.tsx`: seguimiento de Órdenes de Trabajo asignadas al usuario/cuadrilla, máquina de estados (`ALLOWED_TRANSITIONS`), widget de tareas de la orden (`MaintenanceOrderTasksWidget` offline), repuestos y propagación de propiedades dinámicas (`PropagatedPropertiesDisplay` offline)
- [x] T080C [US1] Integrar `PropagatedPropertiesDisplay` offline en el detalle de Tarea y Orden, propagando cambios de `propertiesJson` entre Activo ↔ Incidencia ↔ Orden ↔ Tarea y encolando `task.properties` / `order.properties` en el outbox
- [x] T081 [US1] Implementar `TaskTransitionSheet` (Bottom Sheet) con confirmación y deshabilitado durante `in_flight`
- [x] T082 [US1] Implementar render RJSF v6 del checklist: `ChecklistForm.tsx` con `customValidator` compartido, autosave de borrador (debounce 2 s), scroll al primer error
- [x] T083 [US1] Implementar `commands/save-checklist.ts` + `task.checklist` en outbox con `If-Match: checklistVersion`
- [x] T084 [US1] Implementar captura de evidencias fotográficas de tarea (`media_queue` con `ownerType='task_evidence'`) y `evidence.create`
- [x] T085 [US1] Implementar `ConflictReconciliationSheet` para 412 de checklist (diff por campo, server-wins por defecto) — compartido con US5

**Checkpoint**: US1 usable de punta a punta en modo avión y sincroniza al reconectar.

---

## Fase 7 — US2: Incidencias con evidencia (P1)

**Test independiente**: offline, crear 1 incidencia con 2 fotos, reconectar, verificar orden upload→create y URLs remotas aplicadas.

- [ ] T086 [P] [US2] `media.compressor.test.ts`: 12 MP → ≤ 250 KB, lado mayor ≤ 1600 px, orientación aplicada
- [ ] T087 [P] [US2] `commands.report-incident.test.ts`: borrador no encola; "Enviar" encola create + media con `dependsOn`
- [ ] T088 [P] [US2] `media.uploader.test.ts`: deduplicación por `sha256`, 413 → recompresión única, `remoteUrl` escrito y propagado al payload
- [ ] T089 [P] [US2] E2E `e2e/incidents-offline.spec.ts`: escenario §5.5 completo + cuota agotada
- [ ] T090 [US2] Implementar `media/compressor.ts` (worker + `OffscreenCanvas`, EXIF orientation, target ≤ 250 KB)
- [ ] T091 [US2] Implementar `media/uploader.ts` + `commands/attach-media.ts` (guarda blob, encola upload, vincula `outboxId`)
- [ ] T092 [US2] Implementar `commands/report-incident.ts` (uuidv7 local, `syncState='pending'`, `photoIds`, `dependsOn` al upload)
- [ ] T093 [US2] Construir `routes/incidents.new.tsx` con `CameraCapture` (`<input type="file" accept="image/*" capture="environment">` + preview, eliminar, contador 6)
- [ ] T094 [US2] Implementar bloqueo por cuota antes de capturar (`navigator.storage.estimate()` + reserva de 400 KB)
- [ ] T095 [US2] Construir `routes/incidents.index.tsx` (lista local filtrada por reportante o asignación `assignedEmployeeId`/`assignedTeamId` con estado de sync) y detalle `routes/incidents.$incidentId.tsx` con fotos, propiedades dinámicas RJSF (`workflowTemplateId`), timeline y widget de tareas vinculadas
- [ ] T095A [US2] Implementar máquina de estados dinámica de Incidencias en `commands/transition-incident.ts` y `IncidentTransitionSheet`: lee `lifecycleStates` del `WorkflowTemplate`, valida `requiresFields` obligatorios en el estado destino con RJSF, actualiza `incident.state` + `propertiesJson` y encola `incident.state` en el outbox
- [ ] T096 [US2] Implementar asociación incidencia ↔ tarea u orden en curso (`taskId` / `maintenanceOrderId` en el borrador)

**Checkpoint**: US2 completo; las fotos nunca quedan huérfanas ni se suben dos veces.

---

## Fase 8 — US3: Activos y escaneo (P2)

**Test independiente**: precachear 20 activos, cortar red, escanear QR → ficha en < 800 ms con historial cacheado.

- [ ] T097 [P] [US3] `assets.search.test.ts`: prefijo, normalización de acentos, `searchCodes`, activo no cacheado
- [ ] T098 [P] [US3] E2E `e2e/asset-scan-offline.spec.ts` con cámara simulada (`--use-fake-device-for-media-stream`) o stub de `BarcodeDetector`
- [ ] T099 [US3] Implementar `scanner/` con `BarcodeDetector` cuando exista y fallback `@zxing/browser` (iOS), antirrebote 1.5 s, linterna si `torch` está disponible
- [ ] T100 [US3] Construir `routes/assets.index.tsx` (búsqueda local con `startsWithIgnoreCase`, resultado vacío con acción "Escanear")
- [ ] T101 [US3] Construir `routes/assets.$assetId.tsx`: ficha completa con edición offline de `propertiesJson` + validación dinámica (`validateDynamicRules`), máquina de estados del activo (`lifecycleStates` + `requiresFields` + `associatedModule`), actualización de georreferencia GPS (`geoJson`), jerarquía (`parentId`), y widgets locales de Tareas, Órdenes, Incidencias y Timeline del activo
- [ ] T102 [US3] Construir `routes/scan.tsx` y puente escaneo → ficha (o → nueva incidencia si no se encuentra)
- [ ] T103 [US3] Implementar gestión offline del **BOM del activo (`AssetMaterialsTable` offline sobre `asset_bom_materials`)** y vincularlo al selector de repuestos de Órdenes de Trabajo (`MaintenanceOrderPartsEditor` offline sobre `order_parts`)
- [ ] T104 [US3] Implementar purga de activos `isStale` no vinculados a la jornada (14 días)

**Checkpoint**: US3 operativo sin red para el conjunto de la jornada.

---

## Fase 9 — US4: Consumo de materiales (P2)

**Test independiente**: offline, consumir 2 unidades, verificar reserva local; simular 409 y verificar reversión.

- [ ] T105 [P] [US4] `stock.reserve.test.ts`: disponible derivado, bloqueo con `allowNegativeStock=false`, no coalescencia de consumos
- [ ] T106 [P] [US4] `stock.conflict.test.ts`: 409 `insufficient_stock` revierte reserva y `blocked`; 412 reintenta con nuevo ETag
- [ ] T107 [P] [US4] E2E `e2e/stock-consume.spec.ts`
- [ ] T108 [US4] Implementar `commands/consume-material.ts` (tx: incrementa `qtyReservedLocal` + encola `material.consume` con `If-Match: rowVersion`)
- [ ] T109 [US4] Construir `routes/stock.tsx`: buscador por SKU/nombre, disponible, unidad, acción "Consumir" con stepper táctil (48 px)
- [ ] T110 [US4] Implementar `StockConflictBanner` con stock alternativo del mismo almacén
- [ ] T111 [US4] Integrar consumo desde el detalle de tarea (`ConsumeMaterialSheet`)

**Checkpoint**: US4 completo; el stock nunca se corrompe silenciosamente.

---

## Fase 10 — US5: Confianza en la sincronización

- [ ] T112 [P] [US5] E2E `e2e/sync-resilience.spec.ts` cubriendo E1–E6 y E11–E12 del plan §12.1
- [ ] T113 [US5] Construir `routes/sync.tsx`: outbox agrupado, último error, skew, cuota, versión de app y de SW, acciones "Sincronizar ahora" / "Reintentar" / "Descartar"
- [ ] T114 [US5] Implementar `DeadLetterSheet` con explicación en lenguaje de campo + "Enviar a supervisor" (nota + captura)
- [ ] T115 [US5] Implementar `useSync()` (zustand + `SyncEvent`) y contadores en el `SyncChip`
- [ ] T116 [US5] Implementar ejecución única entre pestañas (leader election en UI) y aviso "Sincronizando en otra pestaña"
- [ ] T117 [US5] Implementar telemetría local (`sync:log`, 500 eventos) y pantalla de diagnóstico ampliada
- [ ] T118 [US5] Implementar flujo de actualización del SW condicionado a outbox vacío (con tests E12)

**Checkpoint**: el técnico entiende qué está pendiente y por qué; ningún conflicto es silencioso.

---

## Fase 11 — UX móvil, accesibilidad y temas

- [ ] T119 Agregar `BottomSheet`, `TabBar`, `TapTarget`, `SyncBadge`, `HighContrastToggle` a `asset-hub/src/frontend/packages/ui/src/` y exportarlos en `index.ts`
- [ ] T120 [P] Test de regresión: `pnpm --filter web build` y suite de `web` siguen pasando con los nuevos exports
- [ ] T121 Implementar `__root.tsx` con `TabBar` (4 tabs), `SyncChip` en header y `env(safe-area-inset-*)`
- [ ] T122 [P] Auditar y corregir touch targets ≥ 48×48 px en todas las pantallas (checklist en `docs/field-pwa/touch-audit.md`)
- [ ] T123 [P] Implementar tokens de alto contraste (≥ 7:1) en ambos temas y selector persistido
- [ ] T124 [P] Pasar `jest-axe` en las 6 pantallas principales sin violaciones `critical`/`serious`
- [ ] T125 Implementar estados `loading`/`empty`/`error`/`stale` en cada pantalla (skeletons, no spinners de pantalla completa)
- [ ] T126 [P] Implementar hápticos opcionales y `prefers-reduced-motion`

**Checkpoint**: cumple los NFR de accesibilidad y ergonomía del spec §6.

---

## Fase 12 — E2E, rendimiento y calidad

- [ ] T127 Completar la matriz E2E E1–E12 en Chromium (Playwright con `setOffline`, `page.clock`)
- [ ] T128 [P] Ejecutar E1–E10 en WebKit y documentar diferencias (sin Background Sync)
- [ ] T129 [P] Test de crash: cerrar el contexto a mitad de transacción y verificar integridad de Dexie
- [ ] T130 [P] Lighthouse CI: PWA instalable, offline start, LCP, bundle budget
- [ ] T131 [P] Contract tests: fixtures de respuesta del backend validadas con esquemas Zod de `core-offline`
- [ ] T132 Verificar cobertura ≥ 85 % en `core-offline` y 100 % de la matriz de conflictos

**Checkpoint**: criterios de Done 1–5 del plan §16 cumplidos.

---

## Fase 13 — Despliegue, documentación y soporte

- [ ] T133 Crear `asset-hub/src/frontend/Dockerfile.field` (nginx, SPA fallback, `no-cache` para `sw.js`, `immutable` para `/assets/*`)
- [ ] T134 Configurar pipeline de build/deploy de `field-pwa` en `.github/workflows/` (incluye `VITE_API_BASE_URL` y `APP_VERSION`)
- [ ] T135 Implementar feature flag `fieldApp.enabled` por tenant (lectura en login + mensaje de rechazo)
- [ ] T136 Implementar kill switch del SW (desregistro + limpieza de caches preservando IndexedDB) y documentarlo
- [ ] T137 [P] Escribir `specs/021-pwa-field-app/quickstart.md` (levantar, simular offline, correr E2E)
- [ ] T138 [P] Escribir `docs/field-pwa/technician-guide.md` (1 página: instalar, operar, qué hacer si no sincroniza)
- [ ] T139 [P] Escribir `docs/field-pwa/support-runbook.md` (leer `/sync`, forzar pull, descartar dead letter, kill switch)
- [ ] T140 Ejecutar piloto con 2 técnicos / 1 semana y registrar métricas de §1.3 del spec

**Checkpoint**: release 1.0 con runbook y piloto iniciado.

---

## Dependencias entre fases

```text
022-field-sync-backend (86 tareas) ──► Fase 3 (motor de sync) ──► Fase 6..9 (historias)
        │                                      ▲
        └──► Fase 1 ──► Fase 2 ────────────────┘
                         │
                         └──► Fase 4 (SW) ──► Fase 5 (auth) ──► Fase 11..13
```

- **Nada de UI** (Fases 6–10) antes de cerrar Fase 3. Construir pantallas contra un motor de sync inestable es el error clásico de este tipo de proyecto.
- Fase 4 y Fase 5 pueden ejecutarse en paralelo con Fase 3 (T034–T035 y T063–T065 sólo dependen de Fase 2).

## Ejemplos de paralelización

```text
Sprint A: 022/T005-T026 (idempotencia + concurrencia, ver spec hermano) ∥ T019-T027 (setup)
Sprint B: T028-T040 (Dexie) ∥ T056-T062 (SW shell)
Sprint C: T041-T055 (outbox) — serial, es el núcleo
Sprint D: T063-T070 (auth) ∥ T071-T075 (tests US1)
Sprint E: T076-T085 (US1) ∥ T086-T089 (tests US2)
```

---

## Resumen

| Fase | Tareas | Cantidad |
| :--- | :--- | :-: |
| 0 · Backend (movida a `022`) | — | 0 (86 en `specs/022-field-sync-backend/`) |
| 1 · Setup monorepo | T019–T027 | 9 |
| 2 · Persistencia | T028–T040 | 13 |
| 3 · Outbox y sync | T041–T055 | 15 |
| 4 · PWA shell | T056–T062 | 7 |
| 5 · Auth offline | T063–T070 | 8 |
| 6 · US1 tareas | T071–T085 | 16 |
| 7 · US2 incidencias | T086–T096 | 11 |
| 8 · US3 activos | T097–T104 | 8 |
| 9 · US4 materiales | T105–T111 | 7 |
| 10 · US5 sync UX | T112–T118 | 7 |
| 11 · UX/a11y | T119–T126 | 8 |
| 12 · Calidad | T127–T132 | 6 |
| 13 · Release | T133–T140 | 8 |
| **Total** | | **123** (+86 en `022`) |
