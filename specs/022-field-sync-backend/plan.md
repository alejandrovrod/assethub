# Plan de implementación: `field-sync-backend`

**Branch**: `022-field-sync-backend`
**Fecha**: 2026-10-28
**Spec**: `specs/022-field-sync-backend/spec.md`
**Tareas**: `specs/022-field-sync-backend/tasks.md`
**Consumidor**: `specs/021-pwa-field-app/` (bloqueante para sus fases 3–10)

---

## 1. Resumen

Nueve cambios aditivos en el backend .NET 10, todos retrocompatibles con `apps/web`:

1. Middleware HTTP de idempotencia con replay exacto y fingerprint.
2. Tokens de concurrencia (`RowVersion`) expuestos como `ETag` en 4 entidades.
3. Entidad `TaskChecklist` 1:1 (por la restricción de un solo `rowversion` por tabla).
4. Emisión y publicación de llaves para el lease offline.
5. Endpoint de consumos idempotente y ligado a tarea; se corrige el auto-generado de keys.
6. Delta sync con cursor keyset + tombstones.
7. `GET` de evidencias.
8. Rol `field-technician`.
9. Estado `paused` en la máquina de estados.

**Orden de ejecución obligatorio**: 1 → 2 → 3 → 5 → 6 → 9 → 4 → 7 → 8. La idempotencia va primero porque es la que permite reintentar todo el resto sin miedo.

---

## 2. Contexto técnico verificado

| Aspecto | Valor real |
| :--- | :--- |
| Framework | .NET 10, Clean Architecture (`Domain` / `Application` / `Infrastructure` / `Api`) |
| CQRS | MediatR (un handler por comando; validación en `DomainException` + `ExceptionHandlingMiddleware`) |
| ORM | EF Core + SQL Server (`rowversion` real, `datetime2`) |
| Multi-tenant | `HasQueryFilter` en `TenantDbContext` con `CurrentTenantId` de `TenantResolutionMiddleware` (**no** RLS de motor) |
| Pipeline | `ExceptionHandling` → `UseAuthentication` → `UseAuthorization` → `TenantResolution` → `MapControllers` (`Program.cs:301-306`) |
| Idempotencia existente | A nivel de dominio en `InventoryTransactions` y `AssetDepreciationEntries` (`(TenantId, IdempotencyKey)` único) |
| Auth | `LoginResult.ExpiresIn = 900`; refresh con rotación; `GenerateAccessToken`/`GenerateRefreshToken` en `IJwtTokenGenerator` |
| Tests | `asset-hub/tests/backend/AssetHub.Api.Tests` (integración) |
| Migraciones | `AssetHub.Infrastructure/Persistence/Migrations` (root y `Migrations/Tenant`) |

---

## 3. Idempotencia HTTP (B1)

### 3.1 Ubicación en el pipeline

```csharp
// Program.cs — insertar entre TenantResolution y MapControllers
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantResolutionMiddleware>();
app.UseMiddleware<IdempotencyMiddleware>();   // ← nuevo (necesita TenantId y UserId ya resueltos)
app.MapControllers();
```

**Por qué ahí**: necesita `TenantId` (query filter + scoping de la key) y `UserId` (fingerprint). Antes de `TenantResolution` no hay tenant; después de `MapControllers` ya no hay oportunidad de interceptar.

### 3.2 Algoritmo

```text
on request:
  if method ∉ {POST, PUT, PATCH, DELETE}  → next()
  if path startsWith /api/v1/auth|/api/v1/media|/.well-known → next()
  key = header "Idempotency-Key"
  if key is null → next()                     # compatibilidad apps/web
  if key is not a valid uuid v4/v7 (36 chars) → 400 invalid_idempotency_key

  fingerprint = sha256(method|path|tenantId|userId|canonicalJson(body))

  try INSERT (TenantId, Key, Fingerprint, Status=in_progress)
  exception on unique violation:
     record = SELECT ... WHERE TenantId AND Key
     if record.Fingerprint != fingerprint → 409 idempotency_key_reuse
     if record.Status == in_progress        → 409 request_in_progress + Retry-After: 1
     if record.Status == completed|failed   → replay: status, headers, body, + "Idempotent-Replay: true"
     return

  swap response body stream → MemoryStream (tope 64 KB)
  try:
     await next()
     if response.StatusCode < 500:
         UPDATE record SET Status=completed, StatusCode, Body, Headers, CompletedAt
     else:
         DELETE record            # 5xx libera la key para reintento
  finally:
     copy buffer al stream original
```

### 3.3 Decisiones y trampas

| Trampa | Decisión |
| :--- | :--- |
| Body no siempre rewindeable | Se lee con `EnableBuffering()` en el middleware y se re-inyecta `Request.Body`; tope 1 MB (el body de campo nunca supera eso; las fotos van por `multipart` en `/media`) |
| Respuestas grandes | Si el buffer supera 64 KB, se persiste sólo `StatusCode` + headers y se marca `body_truncated`; el replay devuelve `204` con `Idempotent-Replay: true` (nunca un body parcial) |
| Streaming / SSE | No aplica (ningún endpoint lo usa) |
| Habilitar buffering siempre es costoso | Sólo se activa cuando el request trae `Idempotency-Key` |
| Transacción entre middleware y handler | **Prohibido**: el registro se escribe fuera de la transacción del handler. La ventana de inconsistencia se cubre con el índice único de dominio (§3.4) |
| 4xx de negocio | Se persisten y se replican. Reintentar una validación fallida no debe producir un resultado distinto |
| 5xx | Se libera la key: el cliente debe poder reintentar |
| Purga | `IdempotencyCleanupWorker` (patrón `Workers/` existente) diario, borra `CompletedAt < now-72h` |

### 3.4 Doble red: middleware + índice de dominio

```text
Crash entre COMMIT del handler y UPDATE del registro
  → la fila de dominio ya existe con la misma (TenantId, IdempotencyKey)
  → el reintento vuelve a ejecutar el handler
  → INSERT en InventoryTransactions viola IX_InventoryTransactions_TenantId_IdempotencyKey
  → el handler captura DbUpdateException (código 2601/2627) y devuelve el recurso existente con 200
```

Acción concreta: en `InventoryPostingService` y en los handlers de incidencias/evidencias, envolver el `SaveChanges` y traducir la violación de unicidad a "ya procesado". Tests obligatorios en §8.

---

## 4. Concurrencia optimista (B2)

### 4.1 Modelo

```csharp
// WorkTask, Incident, Asset
public byte[] RowVersion { get; set; } = Array.Empty<byte>();

// TenantDbContext
b.Property(x => x.RowVersion).IsRowVersion();
```

SQL Server gestiona el valor; EF lo refresca tras `SaveChanges` (hay que releer la entidad o usar `ReloadAsync` para devolver el ETag nuevo).

### 4.2 Exposición

| Punto | Implementación |
| :--- | :--- |
| Lectura | `Response.Headers.ETag = ToEtag(entity.RowVersion)` (base64url entre comillas) |
| Escritura | `If-Match` requerido en endpoints marcados con `[RequireIfMatch]` (atributo de acción) |
| Comparación | Se decodifica base64url y se compara con `RowVersion` en el handler antes de mutar |
| `*` | Permitido sólo con permiso `tenant:write` |
| Ausencia | `428 precondition_required` |
| Conflicto EF | `DbUpdateConcurrencyException` capturada en `ExceptionHandlingMiddleware` → `412 version_mismatch` |

**Sin `If-Match` no hay protección real**: comparar en el handler y luego guardar tiene una ventana TOCTOU. Por eso, además de comparar, se usa el `RowVersion` original en la entidad trackeada: EF genera `WHERE RowVersion = @original` y el conflicto aparece en el `SaveChanges`. La comparación previa sólo sirve para dar un error temprano y legible.

```csharp
// patrón en el handler
var entity = await db.WorkTasks.FirstOrDefaultAsync(...)
    ?? throw new DomainException("not_found", "…");

if (!string.IsNullOrEmpty(request.IfMatch)) {
    var expected = FromBase64Url(request.IfMatch);
    if (!entity.RowVersion.SequenceEqual(expected))
        throw new ConcurrencyException("version_mismatch", entity);
}
```

### 4.3 Respuesta 412 con contexto accionable

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Version mismatch",
  "status": 412,
  "code": "version_mismatch",
  "currentState": "done",
  "currentVersion": "AQIDBAUGBwg=",
  "allowedTransitions": [],
  "traceId": "…"
}
```

El cliente móvil necesita `currentState` y `allowedTransitions` para decidir si reconcilia o descarta (spec 021, §6.6). Un `412` sin contexto obliga al cliente a un round-trip extra.

---

## 5. Checklist versionado (B3)

### 5.1 Por qué una tabla separada

SQL Server permite **una sola** columna `rowversion` por tabla. Si el checklist viviera en `WorkTask`, compartiría token con el estado: cada transición invalidaría el `If-Match` del checklist y el técnico vería conflictos fantasma (spec 021, US5). Una tabla 1:1 da tokens independientes y una migración de datos limpia.

```csharp
public class TaskChecklist
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid WorkTaskId { get; set; }
    public WorkTask? WorkTask { get; set; }

    public string SchemaJson { get; set; } = "{}";
    public string UiSchemaJson { get; set; } = "{}";
    public string? ResponseJson { get; set; }
    public string State { get; set; } = "pending";   // pending | submitted

    public DateTime CreatedAt { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public Guid? SubmittedByUserId { get; set; }
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();
}
```

Configuración EF:

```csharp
b.ToTable("TaskChecklists");
b.HasKey(x => x.Id);
b.HasIndex(x => new { x.TenantId, x.WorkTaskId }).IsUnique();
b.HasOne(x => x.WorkTask).WithOne().HasForeignKey<TaskChecklist>(x => x.WorkTaskId)
 .OnDelete(DeleteBehavior.Cascade);
b.Property(x => x.RowVersion).IsRowVersion();
b.HasQueryFilter(x => x.TenantId == CurrentTenantId);   // A4: obligatorio
```

### 5.2 Poblado y snapshot

| Momento | Acción |
| :--- | :--- |
| Alta de tarea con `AssetTemplate.MaintenanceChecklist` | `ChecklistSchemaFactory.FromLegacyChecklist(json)` genera `schemaJson` (un `boolean` por ítem) y `uiSchemaJson` con `ui:order` |
| Alta de tarea con plantilla nueva | Copia `schemaJson`/`uiSchemaJson` desde la plantilla del activo |
| Tarea sin checklist | No se crea fila; `GET /checklist` devuelve `204` |
| Edición de plantilla | **No** toca checklists existentes (snapshot) |

### 5.3 Validación server-side

Se reutiliza `NJsonSchema` (ya usado en `CreateAssetCommand` y `UpdateAssetCommand`):

```csharp
var schema = await JsonSchema.FromJsonAsync(checklist.SchemaJson);
var errors = schema.Validate(responseJson);
if (errors.Any()) throw new ValidationException(errors);   // → 422 con errores por campo
```

**Dialecto**: draft-07. El cliente valida con Ajv8 (draft-07 por defecto en `@rjsf/validator-ajv8`), así que ambos lados comparten semántica sin traducción.

---

## 6. Lease offline (B4)

### 6.1 Emisión

```csharp
var lease = _jwt.GenerateOfflineLease(user, tenant, deviceId, ttlHours);
// claims: iss, sub, tid, typ=offline_lease, scope=field:offline, device_id, iat, exp, jti
```

Se reutiliza la clave de firma vigente (misma que el access token) con `kid` en el header. La `SigningCredentials` se resuelve desde `IOptions<JwtOptions>` existente.

### 6.2 JWKS

```http
GET /.well-known/jwks.json
Cache-Control: public, max-age=86400
→ { "keys": [ { "kty":"RSA", "use":"sig", "kid":"k-2026-09", "n":"…", "e":"AQAB" },
              { "kty":"RSA", "use":"sig", "kid":"k-2026-06", "n":"…", "e":"AQAB" } ] }
```

- Publica la clave actual + la anterior (rotación con solape de 30 días para leases de 12–24 h ya emitidos).
- Es anónimo: no requiere tenant ni token.
- Se sirve desde un endpoint mínimo (`MapGet`), no desde un controlador con `[Authorize]`.

### 6.3 Política por tenant

```json
// TenantInventorySettings-style flag en el tenant
{ "fieldApp": { "enabled": true, "offlineLeaseHours": 12, "requireDeviceLock": true } }
```

`offlineLeaseHours` se acota en el handler a `[4, 24]`; fuera de rango → `422`.

### 6.4 Qué NO hace el lease

- No autoriza ningún endpoint HTTP (el middleware de auth sigue exigiendo access token).
- No se renueva sin red.
- No se puede emitir con un refresh token: sólo con access token válido y usuario activo.

---

## 7. Consumos de materiales (B5)

### 7.1 Endpoint nuevo vs. reutilizar `adjustments`

`POST /api/v1/inventory/adjustments` existe y usa `PostInventoryAdjustmentCommand` → `IInventoryPostingService`. Reutilizarlo obligaría a que el cliente enviara `Type` y `Quantity` negativa, y no liga el movimiento a una tarea. Se crea un endpoint **semántico**:

```text
POST /api/v1/inventory/consumptions
  → ConsumeStockCommand
     - valida Idempotency-Key (obligatoria)
     - resuelve Warehouse + CatalogItem
     - verifica policy allowNegativeStock
     - InventoryPostingService.PostAsync(type: Issue, quantity: -qty, reason, workTaskId, idempotencyKey)
     - devuelve { id, quantityOnHand, etag }
```

Internamente se apoya en el servicio existente: **no se reimplementa el posting**.

### 7.2 Cambios de esquema

| Cambio | Motivo |
| :--- | :--- |
| `InventoryTransaction.WorkTaskId` (nullable) + índice | Vincular consumo a tarea |
| `InventoryTransaction.SourceWarehouseId` no aplica (sin transferencias) | — |
| Índice único `(TenantId, IdempotencyKey)` ya existe | Reutilizar |

### 7.3 Corrección de A2

```csharp
// InventoryController.PostAdjustment — ELIMINAR
if (string.IsNullOrWhiteSpace(command.IdempotencyKey))
    command.IdempotencyKey = Guid.NewGuid().ToString();
```

Reemplazo:
- `POST /consumptions`: key obligatoria → `400 idempotency_key_required`.
- `POST /adjustments`: key obligatoria para clientes que la envían; si falta, se mantiene el comportamiento actual para no romper `apps/web`, **pero se registra una métrica** `inventory.adjustment.missing_key` para forzar la migración del cliente.

### 7.4 Alternativas ante stock insuficiente

```json
{
  "code": "insufficient_stock",
  "available": 1,
  "requested": 2,
  "alternatives": [
    { "warehouseId": "…", "warehouseName": "Almacén Central", "quantityOnHand": 24, "catalogItemId": "…" }
  ]
}
```

Consulta: mismo `CatalogItem` (o su padre en la jerarquía de catálogo) en almacenes donde el usuario tiene acceso. Limitada a 5 resultados.

---

## 8. Delta sync (B6)

### 8.1 Requisito previo: `UpdatedAt`

Ninguna de las tres entidades tiene `UpdatedAt` (A5). Se agrega y se mantiene automáticamente:

```csharp
public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
{
    var now = _clock.UtcNow;
    foreach (var entry in ChangeTracker.Entries<ITimestamped>())
    {
        if (entry.State == EntityState.Added)   entry.Entity.CreatedAt = now;
        if (entry.State == EntityState.Modified) entry.Entity.UpdatedAt = now;
    }
    // + rellenar TenantId en Added si está vacío
    return await base.SaveChangesAsync(ct);
}
```

Interfaz `ITimestamped { DateTime CreatedAt; DateTime? UpdatedAt; }` implementada por `WorkTask`, `Incident`, `Asset`.

**Riesgo**: `SaveChanges` se llama en muchos sitios; un interceptor mal ubicado puede inflar escrituras. Mitigación: `UpdatedAt` sólo se asigna en `Modified`, y los `ExecuteUpdate` (bulk) existentes se revisan uno por uno.

### 8.2 Cursor keyset

```text
cursor = base64url("{UpdatedAtTicks}:{Id}")

SELECT TOP (@limit) *
FROM   WorkTasks
WHERE  TenantId = @tenant
  AND  (@assignedTo IS NULL OR AssignedEmployeeId = @assignedTo OR AssignedTeamId IN (…))
  AND  ( UpdatedAt > @cursorTicks
      OR (UpdatedAt = @cursorTicks AND Id > @cursorId) )
ORDER BY UpdatedAt, Id
```

| Propiedad | Valor |
| :--- | :--- |
| Estabilidad | Orden total: no hay filas que se repitan ni se salten |
| `hasMore` | `items.Count == limit` (el cliente pide de nuevo con `nextCursor`) |
| Primera página | `since` ausente → se devuelve desde el inicio lógico (primer día del tenant) o `since=now` para "sólo cambios" |
| Índice requerido | `(TenantId, UpdatedAt, Id)` por tabla |
| `includeDeleted` | `true` por defecto para clientes con `Idempotency-Key` header presente (los clientes offline); `false` para `apps/web` |

### 8.3 Tombstones

```csharp
public class SyncTombstone
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string EntityType { get; set; } = "";   // work_task | incident
    public Guid EntityId { get; set; }
    public DateTime DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }
}
// índice único (TenantId, EntityType, EntityId); índice (TenantId, DeletedAt)
```

- Se escribe en `DeleteWorkTaskCommandHandler` (y en el de incidencias si aplica).
- Se purga a los 90 días (un cliente que no se conecta en 90 días hace un full sync).
- Para `Asset` (soft delete, A10) se usa `IsDeleted` + `DeletedAt`; no hace falta tombstone.

### 8.4 Volumen y paginación

| Recurso | Filas típicas por técnico | Páginas |
| :--- | :-: | :-: |
| `work-tasks/changes` | 12–40 | 1 |
| `assets/changes` | 200–800 | 2–8 |
| `incidents/changes` | 5–20 | 1 |
| `inventory/stock/changes` | 100–300 | 1–3 |

`limit` máx. 200. El cliente (spec 021, §5.1) descarga la jornada completa antes de declararse listo; el delta posterior es incremental.

---

## 9. Estado `paused` (B9)

### 9.1 Cambios

```csharp
public static class WorkTaskStates
{
    public const string Todo = "todo";
    public const string Rework = "rework";
    public const string InProgress = "in_progress";
    public const string Paused = "paused";          // nuevo
    public const string Done = "done";
    public const string Cancelled = "cancelled";
}
```

Matriz de transiciones (actualizada en `TaskStateTransitionValidator`):

```text
todo        → in_progress, cancelled
rework      → in_progress, cancelled
in_progress → paused, done, cancelled
paused      → in_progress, done, cancelled
```

### 9.2 Semántica de timestamps

| Transición | Efecto |
| :--- | :--- |
| `→ paused` | `PausedAt = now`; **no** toca `CompletedAt` |
| `paused → in_progress` | `ResumedAt = now`; `TotalPausedSeconds += (now - PausedAt)` |
| `→ done` | `CompletedAt = now`; `DurationSeconds = (CompletedAt - StartedAt) - TotalPausedSeconds` |

Nuevos campos: `PausedAt`, `ResumedAt`, `TotalPausedSeconds`, `ReworkReason`, `ReworkedAt`, `ReworkedByUserId`.

**Por qué `TotalPausedSeconds` en el servidor**: el dashboard de confiabilidad (M18) mide tiempo de resolución. Si el tiempo pausado no se descuenta, la métrica se degrada en cuanto los técnicos usen "Pausar".

### 9.3 Impacto en `apps/web`

| Punto | Cambio |
| :--- | :--- |
| Kanban de tareas | Nueva columna "Pausadas" |
| Filtros de estado | Agregar `paused` |
| Dashboard M18 | Excluir tiempo pausado del MTTR de tareas |
| Notificaciones de vencimiento | Una tarea pausada sigue venciendo |

---

## 10. Rol `field-technician` (B8)

Se define como un rol de catálogo (patrón `RolesController`) con permisos explícitos:

```text
tasks:read  tasks:write  assets:read  incidents:write
inventory:read  inventory:consume  media:write
```

Restricciones adicionales en handlers (no en la política, porque dependen del recurso):
- `tasks:write` sólo sobre tareas donde `AssignedEmployeeId == currentUser` o `AssignedTeamId` contiene al usuario.
- Transición a `cancelled` → `403` para este rol.
- Consumo sólo con `workTaskId` propio.

---

## 11. Compatibilidad con `apps/web`

| Superficie | Garantía |
| :--- | :--- |
| Endpoints existentes | Sin cambios de request/response cuando no se envían headers nuevos |
| `If-Match` en endpoints estrictos | **Sólo** en `PUT /work-tasks/{id}/state`, `PATCH /incidents/{id}`, `PUT /work-tasks/{id}/checklist`, `POST /inventory/consumptions`. El `PUT /work-tasks/{id}` genérico (usado por `apps/web`) queda **no estricto** para no romper la UI actual |
| Nuevas columnas | Nullable o con default; DTOs existentes no las exponen (salvo `etag` en los endpoints estrictos) |
| Kanban | Cambio visible y esperado (§9.3) |
| Migraciones | Aditivas, en una sola migración por área para reducir ventanas |
| Gate de CI | La suite de `apps/web` + tests de integración existentes deben pasar sin cambios |

**Decisión explícita**: hacer estricto todo `PUT` habría roto `apps/web` en el primer deploy. La estrictez se limita a los endpoints que el cliente offline realmente usa.

---

## 12. Estrategia de pruebas

| Nivel | Qué cubre | Herramientas |
| :--- | :--- | :--- |
| Unitario | `IdempotencyFingerprint`, `ToEtag/FromEtag`, `ChecklistSchemaFactory`, `TaskStateTransitionValidator` | xUnit |
| Integración | Middleware con `WebApplicationFactory`: replay, reuse, in-progress, aislamiento entre tenants, 5xx libera key | xUnit + `WebApplicationFactory<Program>` |
| Concurrencia | 100 requests paralelos con la misma key → 1 ejecución; 2 escrituras con el mismo ETag → 412 | xUnit + `Task.WhenAll` + SQL Server real (Testcontainers o la BD de tests existente) |
| Recuperación | Crash simulado: insertar registro de dominio y borrar el registro de idempotencia → reintento devuelve `200`, no duplica | xUnit |
| Delta | 250 filas con timestamps idénticos → paginación completa sin duplicados ni faltantes | xUnit |
| Seguridad | Lease de tenant A no valida con `tid` de B; `field-technician` no puede cancelar; fuga de datos entre tenants en cada endpoint nuevo | xUnit |
| Compatibilidad | Suite de integración existente sin modificaciones | CI |

**Test de fuga multi-tenant obligatorio por tabla nueva**: `HttpIdempotencyRecords`, `TaskChecklists`, `SyncTombstones`. Es el riesgo más alto de este spec porque el aislamiento es por query filter, no por motor (A4).

---

## 13. Despliegue

| Paso | Acción | Reversible |
| :-: | :--- | :-: |
| 1 | Migración aditiva (columnas nullable, tablas nuevas, índices) | Sí (drop) |
| 2 | Deploy API con middleware **pasivo** (sólo actúa si llega `Idempotency-Key`) | Sí |
| 3 | Backfill de `UpdatedAt` y `RowVersion` por lotes de 5 000 | Sí |
| 4 | Backfill de `TaskChecklists` desde `MaintenanceChecklist` | Sí (idempotente) |
| 5 | Activar `paused` + desplegar Kanban de `apps/web` | Sí |
| 6 | Deploy de `field-pwa` (spec 021) | Sí (flag `fieldApp.enabled`) |

**Ventana**: el paso 2 no necesita downtime. El paso 3 se ejecuta con la app en línea (UPDATE por `Id` con `TOP` y `WAITFOR DELAY` para no saturar el log).

---

## 14. Riesgos técnicos

| Riesgo | Mitigación |
| :--- | :--- |
| El middleware abre una transacción larga y bloquea | Registro fuera de la transacción del handler; sin `lock` global; `INSERT` corto con índice único |
| `rowversion` en tablas grandes bloquea la migración | Columna nullable → backfill por lotes → `NOT NULL` en migración separada |
| `UpdatedAt` con reloj de aplicación en varios pods | Usar hora del servidor de BD (`SYSUTCDATETIME()`) o un `IClock` único; documentar el desfase máximo tolerado |
| El lease se usa como bypass de auth | `scope=field:offline` y tests que verifican `401` al usar el lease contra un endpoint HTTP |
| Delta sync con `UpdatedAt` idéntico en filas | Keyset `(UpdatedAt, Id)` — probado con 250 filas del mismo tick |
| Romper `apps/web` con `428` | Estrictez limitada a 4 endpoints (§11) + gate de CI |
| Purga de idempotencia antes de 72 h por presión de disco | Worker con métrica y alerta; nunca purgar `in_progress` de menos de 1 h |

---

## 15. Definición de Done

1. Los 18 escenarios de §5 del spec pasan como tests de integración.
2. Suite de `apps/web` y la integración existente pasan sin modificaciones.
3. Test de fuga multi-tenant en las 3 tablas nuevas.
4. Replay de idempotencia verificado con 100 requests concurrentes.
5. Migración probada en copia de producción (`db32354.bak`) con datos reales.
6. OpenAPI actualizado en `contracts/openapi-field-sync.yaml` y validado contra el código.
7. Métricas `idempotency.*`, `concurrency.*`, `lease.*` visibles en el dashboard.
8. Runbook: qué hacer si el outbox de un técnico queda en `dead_letter` (reenvío manual con la misma key).
