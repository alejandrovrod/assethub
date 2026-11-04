# Especificación: Contratos de sincronización para clientes offline (`field-sync-backend`)

**Feature Branch**: `022-field-sync-backend`
**Fecha**: 2026-10-28
**Estado**: Especificado V1
**Spec hermano de**: `specs/021-pwa-field-app/` (PWA offline-first de campo)
**Plan**: `specs/022-field-sync-backend/plan.md` · **Tareas**: `specs/022-field-sync-backend/tasks.md` · **Contratos**: `specs/022-field-sync-backend/contracts/openapi-field-sync.yaml`

---

## 1. Propósito

Habilitar en el backend las capacidades que un cliente **offline-first** necesita para no perder ni duplicar datos: idempotencia HTTP, control de concurrencia optimista, sesión offline firmada, checklists versionados, consumo de materiales idempotente y sincronización incremental.

Sin este spec, `021-pwa-field-app` no puede cumplir sus criterios de aceptación de sincronización (spec 021, §5.8) y quedaría reducido a un formulario local sin valor operativo.

**Principio rector**: todos los cambios son **aditivos y retrocompatibles**. `apps/web` debe seguir funcionando sin modificaciones (salvo el Kanban, que gana una columna).

---

## 2. Estado actual verificado (2026-10-28)

Evidencia directa del repositorio. No son supuestos.

| # | Hallazgo | Evidencia | Consecuencia |
| :-: | :--- | :--- | :--- |
| A1 | Existe idempotencia **a nivel de dominio** para inventario y finanzas, vía índice único `(TenantId, IdempotencyKey)` | `TenantDbContext.cs:390` y `:573`; `InventoryTransaction.IdempotencyKey`; `AssetDepreciationEntry.IdempotencyKey` | El patrón no hay que inventarlo: hay que **generalizarlo a HTTP** |
| A2 | `InventoryController` **genera la key si el cliente no la envía** | `InventoryController.cs:73-78` — comentario literal "Enforce idempotency client-side, but if missing generate one" | Un reintento del cliente sin key obtiene una key nueva → **duplica el movimiento**. Es el bug que este spec corrige |
| A3 | No hay middleware de idempotencia HTTP | `AssetHub.Api/Middleware/` sólo contiene `ExceptionHandlingMiddleware.cs` | Los endpoints `POST` que no son de inventario (incidencias, evidencias, media) no son reintentables |
| A4 | El aislamiento multi-tenant es por **`HasQueryFilter` de EF Core**, no por RLS de motor | `TenantDbContext.cs:90` y siguientes (`b.HasQueryFilter(...)`); no hay `SECURITY POLICY` en el repo | Cualquier tabla nueva **debe** llevar `TenantId` + query filter explícito, o filtra datos entre tenants |
| A5 | `WorkTask` no tiene `RowVersion` ni `UpdatedAt` (sólo `CreatedAt`/`StartedAt`/`CompletedAt`) | `AssetHub.Domain/Tasks/WorkTask.cs` | Sin token de concurrencia ni marca de actualización: no hay `If-Match` ni delta sync |
| A6 | `StockBalance` sí tiene `RowVersion` y `UpdatedAt` | `AssetHub.Domain/Inventory/StockBalance.cs` | El consumo de materiales puede resolverse con `If-Match` desde el día uno |
| A7 | `WorkTaskStates` = `todo`, `rework`, `in_progress`, `done`, `cancelled`; no existe `paused` | `WorkTaskStates.cs`; `TaskStateTransitionValidator.cs` sólo permite `todo→in_progress`, `rework→in_progress`, `in_progress→done` | "Pausar" no se puede persistir hoy |
| A8 | Access token TTL = 900 s y refresh con rotación | `LoginCommand.cs` → `LoginResult(..., 15 * 60, ...)`; `RefreshCommand.cs` | Un turno de 8 h sin red es imposible sin un lease firmado |
| A9 | `TaskEvidencesController` sólo expone `POST` | `TaskEvidencesController.cs` | El técnico no puede ver la evidencia ya cargada |
| A10 | `Asset` usa soft delete (`IsDeleted` en el query filter) | `TenantDbContext.cs:163` | El delta de activos puede llevarse por tombstone lógico; las tareas, al borrarse en duro, necesitan tombstone explícito |
| A11 | SQL Server (`rowversion` en migraciones) | `20260908221103_InventoryV1.cs` → `type: "rowversion"` | **Una sola columna `rowversion` por tabla**: el checklist no puede tener la suya en `WorkTask` |
| A12 | Orden del pipeline: `ExceptionHandling` → `UseAuthentication` → `UseAuthorization` → `TenantResolution` → `MapControllers` | `Program.cs:301-306` | La idempotencia debe insertarse **después** de auth y de resolución de tenant |

---

## 3. Alcance

### 3.1 Capacidades a construir

| ID (spec 021) | Capacidad | Superficie |
| :--- | :--- | :--- |
| **B1** | Idempotencia HTTP con replay exacto | Middleware + tabla `HttpIdempotencyRecords` |
| **B2** | Control de concurrencia optimista en `WorkTask`, `MaintenanceOrder`, `Incident`, `Asset` | Columna `RowVersion` + `ETag`/`If-Match` + mapeo a `412` |
| **B3** | Checklist versionado por tarea | Entidad `TaskChecklist` 1:1 (por A11) + endpoints |
| **B4** | Lease offline firmado (incluye `employeeId` y `teamIds` del técnico) | `POST /auth/offline-lease` + `GET /.well-known/jwks.json` |
| **B5** | Consumo de materiales idempotente y ligado a tarea/orden | `POST /inventory/consumptions` + corrección de A2 |
| **B6** | Sincronización incremental (delta) de tareas, órdenes, incidencias, activos, plantillas de workflow, catálogos y directorio | `updatedSince` con cursor keyset + tombstones |
| **B7** | Lectura de evidencias de tarea | `GET /work-tasks/{id}/evidences` |
| **B8** | Rol y permisos de técnico de campo | `field-technician` + políticas (`tasks:*`, `maintenance:start/complete`, `incidents:*`, `inventory:consume`) |
| **B9** | Estado `paused` en la máquina de estados | `WorkTaskStates` + validador + Kanban de `apps/web` |

### 3.2 Fuera de alcance

1. UI de cualquiera de estas capacidades (vive en `021-pwa-field-app` y `apps/web`).
2. Replicación bidireccional genérica tipo CouchDB/PowerSync: el delta es de sólo lectura (pull); las escrituras van por los endpoints existentes.
3. Cambios en el esquema de autenticación de `apps/web`.
4. Firma digital de evidencias y almacenamiento con retención legal.
5. Push notifications.
6. Migración de datos históricos de inventario.
7. RLS a nivel de motor de base de datos (se mantiene el aislamiento por query filters, ver A4).

---

## 4. Contratos

### 4.1 Idempotencia HTTP (B1)

```http
POST /api/v1/incidents
Idempotency-Key: 0192f3a1-7c4e-7b21-9a3f-2b1c7d5e9f10
Content-Type: application/json
```

**Alcance**: todos los endpoints `POST`, `PUT`, `PATCH` y `DELETE` que mutan estado, excepto `auth/*` (que tiene su propia semántica con el refresh token) y `media/upload` (se rige por `sha256`, ver 4.5).

**Reglas**

| Regla | Comportamiento |
| :--- | :--- |
| Key ausente | Se procesa normalmente (compatibilidad con `apps/web`), pero **no** se garantiza idempotencia |
| Key presente y nueva | Se reserva la key, se ejecuta el handler, se persiste la respuesta |
| Key repetida, mismo fingerprint de request | Se devuelve la respuesta original **byte a byte** con header `Idempotent-Replay: true` |
| Key repetida, contenido distinto | `409` `idempotency_key_reuse` |
| Key repetida mientras la primera ejecución sigue en curso | `409` `request_in_progress` + `Retry-After: 1` |
| Ejecución falló con 5xx | Se libera la reserva (la key puede reutilizarse) |
| Ejecución devolvió 4xx de negocio (409/412/422) | Se persiste la respuesta: el reintento debe recibir el mismo error, no una ejecución nueva |
| Retención | 72 h; job diario purga lo expirado |

**Fingerprint**: `sha256(method + path + userId + tenantId + body)` sobre el body normalizado (JSON canónico, sin whitespace). Detecta reutilización de key con otro payload.

**Storage**

```sql
CREATE TABLE HttpIdempotencyRecords (
  Id                uniqueidentifier NOT NULL PRIMARY KEY,
  TenantId          uniqueidentifier NOT NULL,      -- obligatorio (A4)
  UserId            uniqueidentifier NULL,
  IdempotencyKey    nvarchar(64)     NOT NULL,
  Fingerprint       char(64)         NOT NULL,      -- sha256 hex
  Method            nvarchar(8)      NOT NULL,
  Path              nvarchar(512)    NOT NULL,
  Status            nvarchar(24)     NOT NULL,      -- in_progress | completed | failed
  StatusCode        int              NULL,
  ResponseBody      nvarchar(max)    NULL,          -- sólo JSON, tope 64 KB
  ResponseHeaders   nvarchar(max)    NULL,
  CreatedAt         datetime2        NOT NULL,
  CompletedAt       datetime2        NULL
);
CREATE UNIQUE INDEX IX_HttpIdempotency_Tenant_Key
  ON HttpIdempotencyRecords (TenantId, IdempotencyKey);
CREATE INDEX IX_HttpIdempotency_CreatedAt ON HttpIdempotencyRecords (CreatedAt);
```

**Interacción con el dominio (A1/A2)**: se mantiene el índice único de `InventoryTransactions` como defensa en profundidad. Si la reserva HTTP venció (crash entre commit y registro), el índice de dominio evita el duplicado; el handler debe capturar `DbUpdateException` con violación de unicidad y responder con el recurso ya existente (`200`) en lugar de `500`.

### 4.2 Concurrencia optimista (B2)

Cada recurso versionado expone un `ETag` fuerte:

```http
GET /api/v1/work-tasks/8f2c.../ 
ETag: "AQIDBAUGBwg="

PUT /api/v1/work-tasks/8f2c.../state
If-Match: "AQIDBAUGBwg="
→ 200 (nuevo ETag) | 412 | 428
```

| Caso | Respuesta |
| :--- | :--- |
| Sin `If-Match` en un endpoint versionado | `428 Precondition Required` con `code=precondition_required` |
| `If-Match: *` | Se acepta (escritura forzada, sólo para roles administrativos) |
| Token obsoleto | `412` `code=version_mismatch` + cuerpo con `currentVersion`, `currentState` y `allowedTransitions` |
| Transición no permitida (independiente de la versión) | `409` `code=invalid_transition` + `allowedTransitions` |
| Colisión detectada por EF (`DbUpdateConcurrencyException`) | Se traduce a `412` en `ExceptionHandlingMiddleware`, nunca a `500` |

**Formato del ETag**: `"` + base64url(`RowVersion`) + `"`. Se elige base64url (sin `+`, `/`, `=`) para evitar escapes y comparaciones frágiles en clientes móviles.

**Entidades versionadas**: `WorkTask`, `Incident`, `Asset`, `TaskChecklist`, `StockBalance`.

### 4.3 Checklist versionado (B3)

**Decisión**: entidad separada `TaskChecklist` (1:1 con `WorkTask`), no columnas en `WorkTask`. Motivo: SQL Server admite **una sola** columna `rowversion` por tabla (A11). Con el checklist en su propia tabla, cada uno tiene su token y una transición de estado no invalida el `If-Match` del checklist.

```http
GET  /api/v1/work-tasks/{id}/checklist
→ 200 { taskId, schemaJson, uiSchemaJson, responseJson, version, etag }

PUT  /api/v1/work-tasks/{id}/checklist
If-Match: "<etag>"
Idempotency-Key: <uuidv7>
{ "responseJson": "{\"vibracion_mm_s\":4.2,\"estado_rodamiento\":\"ok\"}" }
→ 200 { responseJson, version, etag }
```

- `schemaJson` es un JSON Schema **draft-07** (el mismo dialecto que valida Ajv8 en el cliente) con `type: object`, `properties`, `required` y `additionalProperties: false`.
- `uiSchemaJson` sigue el formato `UiSchema` de RJSF v6 (`ui:order`, `ui:widget`, `ui:help`).
- **Snapshot**: al asignar la tarea, se copian `schemaJson`/`uiSchemaJson` desde la plantilla del activo. Editar la plantilla después **no** altera checklists históricos.
- Validación server-side: el `responseJson` se valida contra `schemaJson` con `NJsonSchema` (ya en uso en `CreateAssetCommand`). Si falla → `422` con errores por campo.
- `TaskChecklist.State` (`pending` | `submitted`) permite distinguir borrador de envío, pero el cliente puede guardar sólo al enviar (el borrador es local).
- **Migración de datos**: para tareas existentes con `MaintenanceChecklist` (array plano, A3 del spec 021), se genera un `schemaJson` de compatibilidad:

```json
{
  "type": "object",
  "properties": {
    "item_<id>": { "type": "boolean", "title": "<title>", "description": "<description>" }
  },
  "required": ["item_<id>", "..."]
}
```

Esto preserva el significado operativo ("marcar hecho") sin exigir re-trabajo de las plantillas.

### 4.4 Lease offline (B4)

```http
POST /api/v1/auth/offline-lease
Authorization: Bearer <access_token>
→ 200
{
  "leaseJwt": "eyJhbGciOiJSUzI1NiIs...",
  "expiresIn": 43200,
  "issuedAt": "2026-10-28T12:00:00Z"
}
```

Claims obligatorios:

```json
{
  "iss": "assethub",
  "sub": "<userId>",
  "tid": "<tenantId>",
  "typ": "offline_lease",
  "scope": "field:offline",
  "device_id": "<uuid provisto por el cliente>",
  "iat": 1761652800,
  "exp": 1761696000,
  "jti": "<uuidv7>"
}
```

| Regla | Valor |
| :--- | :--- |
| TTL por defecto | 12 h (configurable por tenant, rango 4–24 h) |
| Firma | La misma clave que firma el access token (RS256/ES256 según configuración vigente) |
| Validación offline | El cliente valida firma con `GET /.well-known/jwks.json` (cacheado 24 h) + `exp` + `tid` |
| Rotación de claves | JWKS publica clave actual y anterior durante 30 días; `kid` en el header del JWT |
| Uso del lease | **No** autoriza llamadas HTTP. Sólo habilita operación local en el cliente |
| Revocación | Si el refresh token se revoca, el lease caduca por `exp` (máx. 24 h). Riesgo aceptado y documentado |
| Renovación | Se reemite en cada `POST /auth/refresh` exitoso |

`GET /.well-known/jwks.json` es **anónimo** (clave pública) y cacheable (`Cache-Control: public, max-age=86400`).

### 4.5 Consumo de materiales (B5)

```http
POST /api/v1/inventory/consumptions
Idempotency-Key: <uuidv7>
If-Match: "<etag de StockBalance>"
{
  "warehouseId": "...",
  "catalogItemId": "...",
  "quantity": 2,
  "workTaskId": "...",
  "reason": "Reemplazo de filtro"
}
→ 201 { "id": "...", "quantityOnHand": 8, "etag": "..." }
```

Reglas:
1. `Idempotency-Key` es **obligatorio** (corrige A2). Si falta → `400 idempotency_key_required`. No se genera ninguna key en el servidor.
2. Crea un `InventoryTransaction` con `Type=Issue`, `State=Posted`, `Reason`, `WorkTaskId` (nuevo campo nullable) y el `IdempotencyKey` recibido.
3. Aplica el descuento sobre `StockBalance` con `If-Match`. Si la versión no coincide → `412` (el cliente reintenta con el ETag nuevo).
4. Si `quantityOnHand < quantity` y `AllowNegativeStock = false` → `409 insufficient_stock` con `available`, `requested` y `alternatives[]` (mismo almacén, mismo `CatalogItem` padre si aplica).
5. Si `allowNegativeStock = true`, se permite y se registra `negativeStockWarning: true` en la respuesta.
6. Replay con la misma key → devuelve el `InventoryTransaction` original (`200`), nunca un segundo movimiento.

### 4.6 Sincronización incremental (B6)

```http
GET /api/v1/work-tasks/changes?since=<cursor>&limit=100
→ 200
{
  "items": [ { "id": "...", "updatedAt": "...", "deleted": false, "etag": "..." } ],
  "nextCursor": "eyJ0Ijo2Mzg2...",
  "hasMore": true
}
```

| Regla | Decisión |
| :--- | :--- |
| Cursor | Opaco: base64url de `{ticks}:{id}` (**keyset pagination**) |
| Por qué keyset y no `OFFSET` | Con `OFFSET`, una fila actualizada entre páginas se duplica o se pierde. Con `(UpdatedAt, Id)` el orden es total y estable |
| `limit` | Máx. 200, default 100 |
| Deleted | Tombstone explícito: `{"id": "...", "deleted": true, "deletedAt": "..."}` |
| Alcance del delta | `work-tasks/changes`, `incidents/changes`, `assets/changes`, `inventory/stock/changes` |
| Filtro de seguridad | Tareas: sólo asignadas al usuario o a su equipo. Activos: sólo si el usuario tiene `assets:read` |
| Recursos eliminados en duro (`WorkTask`) | Se escribe en tabla `SyncTombstones (TenantId, EntityType, EntityId, DeletedAt)` desde el handler de borrado |
| Recursos con soft delete (`Asset`) | Se usa `IsDeleted` + `DeletedAt` (agregar `DeletedAt` si no existe) |

### 4.7 Evidencias de tarea (B7)

```http
GET /api/v1/work-tasks/{taskId}/evidences
→ 200 [ { "id", "type", "blobUri", "note", "latitude", "longitude", "capturedByUserId", "capturedAt" } ]
```

Sólo lectura. Filtra por tenant (A4) y verifica que la tarea sea visible para el usuario.

### 4.8 Rol de campo (B8)

| Permiso | Alcance |
| :--- | :--- |
| `tasks:read` | Sólo tareas propias o de su equipo |
| `tasks:write` | Sólo transiciones sobre tareas propias (nunca `cancelled`, nunca reasignar) |
| `assets:read` | Lectura de activos del tenant |
| `incidents:write` | Alta y edición de incidencias propias |
| `inventory:read` | Stock de su almacén |
| `inventory:consume` | Consumos ligados a sus tareas |
| `media:write` | Subida de media |
| **Denegado** | `tasks:delete`, `assets:write`, `inventory:adjust`, `users:*`, `billing:*` |

### 4.9 Estado `paused` (B9)

```text
todo        → in_progress | cancelled
rework      → in_progress | cancelled
in_progress → paused | done | cancelled
paused      → in_progress | done | cancelled
done        → (terminal)
cancelled   → (terminal)
```

- Nuevo campo `WorkTask.ReworkReason` (nullable) y `ReworkedAt`, `ReworkedByUserId`, para que la PWA explique la devolución.
- `GET /work-tasks/{id}` incluye `allowedTransitions: string[]` calculado por `TaskStateTransitionValidator`, para que ningún cliente hardcodee la máquina de estados.
- **Impacto en `apps/web`**: el Kanban gana la columna `paused`; las tareas `paused` no deben contarse como "en progreso" en el dashboard de confiabilidad (revisar `018-dashboard-confiabilidad`).

---

## 5. Criterios de aceptación (Gherkin)

```gherkin
Feature: Contratos de sincronización para clientes offline

  Scenario: Reintento idempotente de creación de incidencia
    Given un cliente envía POST /api/v1/incidents con Idempotency-Key K
    And el servidor crea la incidencia y responde 201 con id I
    When el cliente reintenta el mismo request con la misma key K y el mismo body
    Then el servidor responde 201 con el mismo id I
    And la respuesta incluye el header "Idempotent-Replay: true"
    And existe exactamente 1 incidencia en la base de datos

  Scenario: Reutilización de key con payload distinto
    Given una key K ya utilizada para crear una incidencia
    When el cliente envía la key K con un body diferente
    Then el servidor responde 409 con code "idempotency_key_reuse"
    And no se modifica ninguna entidad

  Scenario: Replay concurrente mientras la primera ejecución está en curso
    Given una key K reservada y en ejecución
    When llega un segundo request con la misma key K
    Then el servidor responde 409 con code "request_in_progress"
    And incluye el header "Retry-After: 1"

  Scenario: Aislamiento de idempotencia entre tenants
    Given el tenant A usó la key K
    When el tenant B envía la key K
    Then el request se procesa como nuevo
    And nunca se devuelve la respuesta almacenada del tenant A

  Scenario: Escritura sin If-Match en recurso versionado
    Given una tarea existente
    When un cliente envía PUT /api/v1/work-tasks/{id}/state sin header If-Match
    Then el servidor responde 428 con code "precondition_required"
    And no se modifica la tarea

  Scenario: Conflicto de versión por escritura concurrente
    Given dos supervisores leen la misma tarea con ETag "v1"
    When ambos envían una transición con If-Match "v1"
    Then el primero recibe 200 con un ETag nuevo
    And el segundo recibe 412 con code "version_mismatch"
    And el cuerpo del 412 incluye currentState y allowedTransitions

  Scenario: Colisión de EF Core no se filtra como error 500
    Given dos transacciones concurrentes sobre la misma tarea
    When EF Core lanza DbUpdateConcurrencyException
    Then el servidor responde 412 con code "version_mismatch"
    And el log registra el conflicto sin stack trace de error crítico

  Scenario: Checklist con esquema inválido
    Given una tarea con checklistSchema que exige el campo "vibracion_mm_s" numérico >= 1
    When el cliente envía un responseJson sin ese campo
    Then el servidor responde 422 con los errores por campo
    And el checklist no cambia de versión

  Scenario: Checklist independiente de la transición de estado
    Given un checklist con ETag "c1" y una tarea con ETag "t1"
    When se completa la tarea (nueva versión t2)
    Then el checklist conserva el ETag "c1"
    And el cliente puede guardar el checklist con If-Match "c1" sin conflicto

  Scenario: Emisión y validación del lease offline
    Given un técnico autenticado con política de lease de 12 h
    When solicita POST /api/v1/auth/offline-lease
    Then recibe un JWT con typ "offline_lease", tid de su tenant y exp a 12 h
    And el JWT es verificable con la clave publicada en /.well-known/jwks.json
    And el lease de un tenant distinto no valida contra el tid esperado

  Scenario: Consumo de material sin Idempotency-Key
    Given un técnico con permiso inventory:consume
    When envía POST /api/v1/inventory/consumptions sin header Idempotency-Key
    Then el servidor responde 400 con code "idempotency_key_required"
    And no se crea ningún InventoryTransaction

  Scenario: Consumo idempotente bajo reintento
    Given un consumo aceptado con key K y 2 unidades
    When el cliente reintenta con la misma key K
    Then el servidor responde 200 con el movimiento original
    And el stock sigue descontado en 2 unidades (no 4)

  Scenario: Stock insuficiente con política estricta
    Given allowNegativeStock = false y 1 unidad disponible
    When el cliente consume 2 unidades con el ETag correcto
    Then el servidor responde 409 con code "insufficient_stock"
    And el cuerpo incluye available = 1 y requested = 2
    And el stock no cambia

  Scenario: Delta de tareas sin perder ni duplicar filas
    Given 250 tareas con UpdatedAt idéntico en 3 de ellas
    When el cliente pagina con limit 100 usando el cursor devuelto
    Then recibe exactamente 250 tareas sin duplicados ni faltantes

  Scenario: Delta incluye borrados
    Given una tarea eliminada después del cursor del cliente
    When el cliente solicita /work-tasks/changes con ese cursor
    Then la respuesta incluye un elemento con deleted = true e id de la tarea

  Scenario: Técnico no puede cancelar tareas
    Given un usuario con rol field-technician
    When envía una transición a "cancelled"
    Then el servidor responde 403
    And la tarea conserva su estado

  Scenario: Pausa de tarea
    Given una tarea en "in_progress"
    When el técnico la pasa a "paused" con If-Match válido
    Then el servidor responde 200 y la tarea queda en "paused"
    And allowedTransitions incluye "in_progress", "done" y "cancelled"

  Scenario: apps/web sigue funcionando sin headers nuevos
    Given un usuario administrativo usando apps/web
    When realiza operaciones de lectura y escritura sin enviar Idempotency-Key ni If-Match
    Then todas las operaciones existentes mantienen su comportamiento previo
    And sólo los endpoints marcados como estrictos devuelven 428
```

---

## 6. Requisitos no funcionales

| Categoría | Requisito |
| :--- | :--- |
| Latencia | El middleware de idempotencia agrega ≤ 5 ms p95 en requests sin key y ≤ 10 ms con key (incluye escritura del registro) |
| Almacenamiento | `HttpIdempotencyRecords` ≤ 500 MB por tenant en régimen; purga a 72 h |
| Escrituras | El registro de idempotencia no debe abrir una transacción que englobe el handler (evita locks largos) |
| Concurrencia | 100 requests concurrentes con la misma key → exactamente 1 ejecución y 99 replays/conflictos |
| Seguridad | El lease no otorga permisos HTTP; JWKS sin datos sensibles; `kid` obligatorio |
| Compatibilidad | Cero cambios de contrato en endpoints existentes cuando el cliente no envía los headers nuevos |
| Multi-tenant | Toda tabla nueva lleva `TenantId` + query filter; test explícito de fuga entre tenants |
| Observabilidad | Métricas: `idempotency.replay`, `idempotency.conflict`, `concurrency.precondition_failed`, `lease.issued` |
| Migración | Todas las columnas nuevas nullable o con default; migración reversible; sin downtime prolongado |

---

## 7. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
| :--- | :-: | :-: | :--- |
| El middleware buferiza respuestas grandes y presiona memoria | Media | Medio | Sólo JSON, tope 64 KB, streaming passthrough si se excede |
| Añadir `rowversion` bloquea tablas grandes durante la migración | Media | Alto | Columna nullable primero, backfill por lotes, luego `NOT NULL` |
| `paused` rompe métricas del dashboard (M18) | Alta | Medio | Revisar consultas que agrupan por estado antes del deploy |
| El lease se convierte en un segundo sistema de auth | Media | Alto | Scope `field:offline` y validación de que **no** autoriza HTTP |
| Claves de idempotencia recicladas por clientes mal implementados | Baja | Alto | Fingerprint + `409 idempotency_key_reuse` |
| Cambios de contrato rompen `apps/web` | Media | Alto | Headers opcionales; suite de `apps/web` como gate de CI |

---

## 8. Glosario

| Término | Definición |
| :--- | :--- |
| Fingerprint | Hash del request normalizado que vincula una key a un payload concreto |
| Lease offline | JWT firmado que autoriza operación local sin red |
| Keyset pagination | Paginación por `(UpdatedAt, Id)` en lugar de `OFFSET` |
| Tombstone | Registro de borrado que permite al cliente purgar su caché |
| `precondition_required` | `428`: falta `If-Match` en un endpoint versionado |
