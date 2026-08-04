# SDD — AssetHub: Sistema de Administración de Activos

Versión 0.1 · Estado: Aprobado (Fase 0)

## 1. Visión y alcance

AssetHub es una plataforma SaaS **multi-tenant** para administrar activos de cualquier índole (carreteras, edificios, calles, puentes, mobiliario urbano, etc.). Principio rector: **nada hardcodeado** — tipos de entidad de negocio, templates de activos, características, catálogos, estados y workflows se definen por configuración de cada tenant.

### 1.1 Actores

| Actor | Descripción |
|---|---|
| SuperAdmin | Operador de la plataforma (cross-tenant, DB catálogo) |
| TenantAdmin | Administrador de un tenant; configura catálogos, templates, usuarios, plan |
| Gestor | Crea/asigna incidencias, mantenimientos y tareas |
| Técnico | Personal de campo; ejecuta tareas, sube evidencias |
| Lectura | Consulta dashboards y reportes |
| Invitado | Usuario anónimo en landing page |

### 1.2 Decisiones arquitectónicas

| Tema | Decisión |
|---|---|
| Multi-tenancy | Híbrido: DB compartida con `TenantId` + Row-Level Security por defecto; tenant dedicado con su propia DB (resolver de connection string por tenant) |
| AuthN/AuthZ | ASP.NET Core Identity + JWT (access 15 min + refresh rotativo 30 días), RBAC por tenant, MFA TOTP opcional |
| Pagos | Stripe tras abstracción `IBillingProvider`; modo facturación manual (B2G) configurable por tenant |
| Mapas | MapLibre GL + OpenStreetMap |
| Backend | .NET 10, Aspire, Clean Architecture (Domain → Application → Infrastructure → Api) |
| Frontend | React 19 + Vite + TS, Zustand, Axios, shadcn/ui + Tailwind v4 |
| DB | SQL Server 2025 (EF Core, migraciones, RLS, `geography`); el AppHost de desarrollo usa imagen `mssql/server:2022-latest` como fallback hasta fijar la imagen 2025 |
| Monorepo | pnpm workspaces + solución .NET; Aspire AppHost orquesta |

### 1.3 Reglas transversales

- **R1**: Toda entidad de negocio lleva `TenantId`. Todo repositorio es tenant-scoped; no existe query sin filtro de tenant salvo SuperAdmin explícito.
- **R2**: RLS en SQL Server con `SESSION_CONTEXT` como segunda línea de defensa.
- **R3**: Toda mutación registra auditoría (quién, cuándo, qué cambió, IP).
- **R4**: Los límites del plan (#activos, #usuarios, módulos) se validan server-side en cada operación de creación.
- **R5**: Toda fecha en UTC (ISO 8601); el frontend renderiza en zona del tenant.
- **R6**: Todo texto de catálogo es traducible (clave + locale); mínimo `es` y `en`.
- **R7**: IDs: GUID v7 como PK; slug único por tenant para URLs.
- **R8**: Soft-delete en entidades maestras (Assets, Templates, Employees); borrado físico solo en datos transitorios.
- **R9**: API versionada por ruta `/api/v{n}/...`; contratos en `api-contracts.md`.
- **R10**: Errores en formato RFC 7807 (`application/problem+json`).

## 2. Módulos funcionales

Detalle en `modules/*.md`. Resumen:

| # | Módulo | Fase |
|---|---|---|
| M1 | Landing page pública | 1 |
| M2 | Tenancy & Onboarding | 1 |
| M3 | Seguridad (Identity, RBAC, MFA, auditoría) | 1 |
| M4 | Planes de pago y suscripciones | 2 |
| M5 | Catálogos dinámicos | 3 |
| M6 | Tipos de entidad de negocio | 3 |
| M7 | Templates de activos | 3 |
| M8 | Activos (jerarquía árbol) | 4 |
| M9 | Características de activos (EAV) | 3–4 |
| M10 | Geolocalización | 4 |
| M11 | Incidencias y prevención | 5 |
| M12 | Mantenimiento | 5 |
| M13 | Personal y equipos | 5 |
| M14 | Tareas y programación | 5 |
| M15 | Seguimiento de tareas | 5 |
| M16 | Análisis de vida del activo | 6 |

## 3. Flujo de onboarding (crítico)

1. Invitado en landing elige plan → formulario signup (org, slug, admin, password).
2. Se crea tenant en DB catálogo (estado `Provisioning`), usuario TenantAdmin, suscripción (Stripe checkout o manual según plan).
3. Job de provisioning: seeding de catálogos base (unidades, prioridades, estados), rol Admin por defecto, template de ejemplo opcional.
4. Tenant pasa a `Active`; admin completa wizard: tipo(s) de entidad de negocio → templates sugeridos → invitar usuarios.

**R-ONB1**: slug único global, regex `^[a-z0-9][a-z0-9-]{2,62}$`; reservados: `www`, `api`, `app`, `admin`, `support`.

## 4. Seguridad

- JWT con claims `sub`, `tid` (tenant), `roles`, `perms`. Firma RSA, rotación de claves.
- Refresh token rotativo con detección de reuso (invalida la cadena).
- RBAC: permisos atómicos (`assets.read`, `assets.write`, `tasks.assign`, `catalogs.manage`, `billing.manage`...); roles = conjuntos de permisos definibles por tenant.
- MFA TOTP opcional por usuario, forzable por política del tenant.
- Rate limiting por IP en endpoints públicos y por tenant en autenticados.
- CORS restringido a dominios del tenant; CSP, HSTS, headers de seguridad.
- Contraseñas vía Identity; política mínimo 12 caracteres.

## 5. Multi-tenancy híbrido

- **DB catálogo** (`AssetHubCatalog`): `Tenants`, `Plans`, `Subscriptions`, `TenantMigrations`.
- **Resolución de tenant**: middleware por subdominio `{slug}.assethub.app` o header `X-Tenant` (dev). Caché 5 min → connection string.
- **Modo compartido**: query filter global `TenantId == current` + RLS con `SESSION_CONTEXT('TenantId')` seteado al abrir la conexión.
- **Modo dedicado**: mismo DbContext, otra connection string; el filtro se mantiene por uniformidad.
- **Migración compartido→dedicado**: proceso offline (bacpac filtrado o ETL); fuera del MVP pero el diseño (R1) lo habilita.

## 6. Datos y geoespacial

Esquema completo en `data-model.md`. Geo con tipo `geography`: punto, línea y polígono (GeoJSON en API ↔ `geography` en DB), índices espaciales en `Assets.Geo`. Jerarquía de activos: `ParentId` + materialized path `/guid/guid/` + closure table `AssetHierarchy` para descendientes/profundidad.

## 7. Calidad y verificación

- Cobertura mínima 70% en Domain/Application; integration tests con Testcontainers (SQL Server).
- E2E Playwright: signup → onboarding → crear template → crear activo → asignar tarea → evidencia.
- Cada fase termina con `dotnet build`, `dotnet test`, `pnpm build` verdes.

## 8. Roadmap

- **F0 Fundaciones**: scaffold, Aspire + SQL Server. ✅
- **F1 Core**: M2, M3, M1 (paralelo backend tenancy+auth / frontend landing+auth UI).
- **F2 Suscripciones**: M4.
- **F3 Config dinámica**: M5, M6, M7, M9.
- **F4 Activos**: M8, M10.
- **F5 Operación**: M11–M15 (paralelo por módulo).
- **F6 Analítica**: M16.
- **F7 Endurecimiento**: E2E, performance, RLS verificado, docs.
