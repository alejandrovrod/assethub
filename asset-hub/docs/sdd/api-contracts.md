# Contratos de API — AssetHub

Base: `/api/v1`. Auth: `Bearer <JWT>` salvo endpoints marcados `público`. Tenant: subdominio o header `X-Tenant` (dev). Errores: RFC 7807 (`application/problem+json`, con `code` de negocio y `errors` por campo en validaciones).

## Convenciones

- **Paginación**: `?page=1&pageSize=20` (máx 100) → `{ "items": [...], "page", "pageSize", "totalCount" }`.
- **Filtros**: query params (`?status=active&templateId=...`); búsqueda texto `?q=`.
- **Orden**: `?sort=-createdAt,name`.
- **Fechas**: UTC ISO 8601. **Geo**: GeoJSON (`{"type":"Point","coordinates":[lng,lat]}`).
- **Idempotencia**: POST de creación acepta header `Idempotency-Key`.
- **Límites de plan**: violación → `403` con `code: "plan_limit_exceeded"` y `detail` indicando el límite.

## M1 Landing (públicos)
- `GET /public/plans` — planes públicos con precios y límites.
- `GET /public/content?locale=es` — contenido CMS de landing (hero, features).

## M2 Tenancy & Onboarding
- `POST /public/tenants/check-slug` `{slug}` → `{available: bool}` (público).
- `POST /public/tenants` `{orgName, slug, adminName, email, password, planCode}` → `202` + `{tenantId, status: "Provisioning"}` (público).
- `GET /tenants/current` — datos del tenant resuelto.
- `PATCH /tenants/current` — nombre, locale, timezone (TenantAdmin).
- `GET /tenants/current/onboarding` / `POST /tenants/current/onboarding/step` — estado del wizard.

## M3 Seguridad
- `POST /auth/register` — solo vía invitación (`{invitationToken, password, fullName}`).
- `POST /auth/login` `{email, password, mfaCode?}` → `{accessToken, refreshToken, expiresIn}`.
- `POST /auth/refresh` `{refreshToken}` → nuevo par (rotación).
- `POST /auth/logout` — revoca refresh.
- `POST /auth/mfa/setup` | `POST /auth/mfa/verify` | `DELETE /auth/mfa`.
- `GET/POST /users` · `GET/PATCH/DELETE /users/{id}` · `POST /users/{id}/roles`.
- `GET/POST /roles` · `GET/PATCH/DELETE /roles/{id}` · `GET /permissions`.
- `POST /invitations` `{email, roleId}` · `DELETE /invitations/{id}`.
- `GET /audit?entityType=&userId=&from=&to=` (TenantAdmin).

## M4 Planes y suscripciones
- `GET /billing/subscription` — plan actual, uso vs límites, periodo.
- `POST /billing/checkout` `{planCode, interval: "monthly"|"yearly"}` → `{checkoutUrl}` (Stripe) o `202` en modo manual.
- `POST /billing/portal` → `{portalUrl}`.
- `POST /billing/webhooks/stripe` (endpoint firmado, sin auth de usuario).
- `POST /billing/change-plan` `{planCode}` — prorrateo.
- `GET /billing/invoices`.

## M5 Catálogos
- `GET /catalogs` · `POST /catalogs` · `GET/PATCH/DELETE /catalogs/{code}`.
- `GET /catalogs/{code}/items?locale=es` (incluye heredados globales) · `POST /catalogs/{code}/items` · `PATCH/DELETE /catalogs/{code}/items/{id}`.
- `PUT /catalogs/{code}/items/{id}/translations` `{locale, label}`.

## M6 Tipos de entidad
- `GET /entity-types` · `POST /entity-types` · `GET/PATCH/DELETE /entity-types/{id}`.

## M7 Templates de activos
- `GET /asset-templates?entityTypeId=` · `POST /asset-templates`.
- `GET/PATCH/DELETE /asset-templates/{id}` (PATCH crea nueva `Version`).
- `POST /asset-templates/{id}/validate-schema` — valida `SchemaJson`.
- `GET /asset-templates/{id}/lifecycle` — estados y transiciones.

## M8 Activos
- `GET /assets?templateId=&parentId=&state=&q=` (paginado).
- `GET /assets/tree?rootId=&depth=` — jerarquía vía closure table.
- `POST /assets` `{templateId, parentId?, name, attributes{}, geo?}` — valida EAV contra schema.
- `GET/PATCH /assets/{id}` · `DELETE /assets/{id}` (soft).
- `POST /assets/{id}/move` `{newParentId}` — recomputa `Path` y closure.
- `POST /assets/{id}/transition` `{toState, notes?}` — respeta lifecycle del template.
- `GET /assets/{id}/history` — AssetLifecycleEvents.
- `POST /assets/{id}/attachments` (multipart) · `DELETE /assets/{id}/attachments/{attId}`.

## M9 Características
- `GET /assets/{id}/attributes` · `PUT /assets/{id}/attributes` `{key: value, ...}` — validación por schema; `400` con `errors` por atributo.

## M10 Geolocalización
- `GET /assets/geo?bbox=minLng,minLat,maxLng,maxLat&templateId=` — para el mapa (cluster server-side si `zoom` bajo).
- `GET /assets/geo/nearby?lng=&lat=&radiusM=`.

## M11 Incidencias y prevención
- `GET/POST /incidents` · `GET/PATCH /incidents/{id}` · `POST /incidents/{id}/attachments`.
- `POST /incidents/{id}/triage` `{priorityItemId, typeItemId}`.
- `POST /incidents/{id}/convert-to-order` → crea MaintenanceOrder.
- `GET/POST /preventive-plans` · `GET/PATCH/DELETE /preventive-plans/{id}` · `POST /preventive-plans/{id}/run-now`.

## M12 Mantenimiento
- `GET/POST /maintenance-orders` · `GET/PATCH /maintenance-orders/{id}`.
- `POST /maintenance-orders/{id}/approve` · `/assign` `{teamId|employeeId}` · `/schedule` `{start, end}` · `/complete` `{laborCost, notes}` · `/verify`.
- `POST /maintenance-orders/{id}/parts` `{catalogItemId, quantity, unitCost}` · `DELETE .../parts/{partId}`.

## M13 Personal
- `GET/POST /employees` · `GET/PATCH/DELETE /employees/{id}` · `PUT /employees/{id}/availability`.
- `GET/POST /teams` · `GET/PATCH/DELETE /teams/{id}` · `POST/DELETE /teams/{id}/members/{employeeId}`.

## M14/M15 Tareas y seguimiento
- `GET/POST /tasks` · `GET/PATCH/DELETE /tasks/{id}`.
- `POST /tasks/{id}/assign` `{employeeId|teamId}` · `POST /tasks/{id}/status` `{toStatus, note?}` (registra historial).
- `GET /tasks/board?groupBy=status` — Kanban. `GET /tasks/calendar?from=&to=`.
- `POST /tasks/{id}/comments` · `GET /tasks/{id}/comments`.
- `POST /tasks/{id}/evidences` (multipart + `geo` + `kind`) · `GET /tasks/{id}/evidences`.
- `GET/POST /task-recurrences` · `PATCH/DELETE /task-recurrences/{id}`.

## M16 Analítica
- `GET /analytics/assets/{id}/lifecycle` — costo acumulado, intervenciones, evolución de `conditionIndex`, proyección de vida útil.
- `GET /analytics/dashboard` — agregados: activos por estado, incidencias por prioridad, cumplimiento de tareas (SLA), órdenes por mes.
- `GET /analytics/reports/assets` `?format=csv|xlsx` — exportación.
