# M2 — Tenancy & Onboarding

Ciclo de vida del tenant: signup desde la landing, validación de slug, creación en estado `Provisioning`, suscripción inicial, job de seeding, activación y wizard de onboarding. Incluye la resolución de tenant por subdominio/header y la suspensión/desactivación.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-2.1 | Invitado | Completa formulario signup (organización, slug, nombre admin, email, password, plan) |
| CU-2.2 | Sistema | Valida slug (R-ONB1), crea tenant `Provisioning`, TenantAdmin y suscripción (Stripe checkout o manual) |
| CU-2.3 | Sistema | Job de provisioning: seeding de catálogos base (unidades, prioridades, estados), rol Admin, template de ejemplo opcional |
| CU-2.4 | Sistema | Marca tenant `Active` y notifica al admin |
| CU-2.5 | TenantAdmin | Wizard paso 1: elige tipo(s) de entidad de negocio |
| CU-2.6 | TenantAdmin | Wizard paso 2: instala templates sugeridos según los tipos elegidos |
| CU-2.7 | TenantAdmin | Wizard paso 3: invita usuarios por email con rol (M3) |
| CU-2.8 | Sistema | Middleware resuelve tenant por subdominio `{slug}.assethub.app` o header `X-Tenant` (dev) y cachea connection string 5 min |
| CU-2.9 | SuperAdmin | Suspende/reactiva/desactiva un tenant desde la DB catálogo |

## Reglas de negocio

- RN-2.1: Slug único global, regex `^[a-z0-9][a-z0-9-]{2,62}$`; reservados `www`, `api`, `app`, `admin`, `support` (R-ONB1).
- RN-2.2: El signup es transaccional: si falla Stripe/validación no queda tenant huérfano (o queda `Provisioning` reintentable).
- RN-2.3: Un tenant `Suspended` no puede autenticar usuarios ni mutar datos; solo lectura de facturación (R4).
- RN-2.4: El seeding crea catálogos con `IsSystem=true` y traducciones `es`/`en` (R6).
- RN-2.5: El wizard es salvable y reanudable; su estado se persiste por tenant.
- RN-2.6: Todo el provisioning registra auditoría (R3) y fechas en UTC (R5).
- RN-2.7: IDs GUID v7; tenant accesible por slug en URL (R7).

## Criterios de aceptación

- CA-2.1: Given slug `admin`, When signup, Then responde 400 problem+json indicando slug reservado (R10).
- CA-2.2: Given slug `Mi Empresa!`, When signup, Then responde 400 por regex inválido.
- CA-2.3: Given slug ya existente, When signup, Then responde 409 conflict.
- CA-2.4: Given signup válido con plan `free`, When se confirma, Then existe tenant `Provisioning`, usuario TenantAdmin y suscripción.
- CA-2.5: Given tenant `Provisioning`, When el job termina, Then existen catálogos base con `IsSystem=true` y el tenant pasa a `Active`.
- CA-2.6: Given request a `acme.assethub.app`, When el middleware resuelve, Then `TenantId` de contexto es el de `acme` y se cachea 5 min.
- CA-2.7: Given request con `X-Tenant: acme` en dev, When el middleware resuelve, Then obtiene el mismo tenant que por subdominio.
- CA-2.8: Given tenant `Suspended`, When un usuario intenta login, Then recibe 403 problem+json.
- CA-2.9: Given TenantAdmin en wizard paso 1, When selecciona "Vial", Then el paso 2 sugiere templates de carretera/puente.
