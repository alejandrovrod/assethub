# M4 — Planes de pago y suscripciones

Gestión de planes (límites y módulos), suscripciones vía Stripe tras `IBillingProvider`, modo manual B2G, enforcement server-side de límites en creación, cambio de plan con prorrateo y portal de facturación.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-4.1 | SuperAdmin | CRUD de planes: `Code`, precios, `MaxAssets`, `MaxUsers`, `MaxStorageMB`, `EnabledModules`, `IsPublic` |
| CU-4.2 | TenantAdmin | Inicia checkout Stripe para suscribirse a un plan |
| CU-4.3 | Sistema | Procesa webhooks Stripe (checkout completado, invoice pagada/fallida, cancelación) y actualiza `Subscriptions.Status` |
| CU-4.4 | TenantAdmin | Cambia de plan; Stripe aplica prorrateo |
| CU-4.5 | TenantAdmin | Abre portal de facturación (Stripe Customer Portal o vista manual) |
| CU-4.6 | SuperAdmin | Marca un tenant como facturación manual (B2G, `Provider=manual`) sin Stripe |
| CU-4.7 | Sistema | Enforce límites en creación de activos/usuarios y acceso a módulos |
| CU-4.8 | TenantAdmin | Consulta uso actual vs. límites del plan |

## Reglas de negocio

- RN-4.1: Toda integración de cobro pasa por `IBillingProvider`; Stripe es una implementación intercambiable.
- RN-4.2: Los webhooks se verifican por firma y son idempotentes (evento ya procesado = 200 sin efecto).
- RN-4.3: El límite se valida server-side en cada creación (R4); excederlo → 402 (pago requerido) o 403 (módulo no incluido) en problem+json (R10).
- RN-4.4: Cambio de plan aplica prorrateo; un downgrade que viola límites actuales se rechaza con detalle.
- RN-4.5: Suscripción `past_due` degrada el tenant a solo lectura tras período de gracia; `canceled` → `Suspended`.
- RN-4.6: Modo manual: sin cobros automáticos; los cambios de estado los hace SuperAdmin y quedan auditados (R3).
- RN-4.7: Los módulos habilitados del plan se consultan en cada request a módulo restringido, con caché corta.

## Criterios de aceptación

- CA-4.1: Given plan `pro` con `MaxUsers=10` y 10 usuarios activos, When se invita/crea el 11º, Then 402 problem+json con `limit=maxUsers`.
- CA-4.2: Given plan sin módulo `maintenance`, When POST a `/api/v1/maintenance-orders`, Then 403 problem+json con `module` requerido.
- CA-4.3: Given checkout Stripe completado, When llega webhook firmado, Then `Subscriptions.Status=active` y `ExternalSubscriptionId` poblado.
- CA-4.4: Given el mismo webhook recibido dos veces, When se procesa el duplicado, Then 200 sin doble efecto.
- CA-4.5: Given firma de webhook inválida, When POST al endpoint, Then 400.
- CA-4.6: Given upgrade `free`→`pro` a mitad de período, When se confirma, Then Stripe genera prorrateo y el tenant ve nuevos límites de inmediato.
- CA-4.7: Given downgrade con 500 activos a plan `MaxAssets=100`, When se solicita, Then 409 con detalle del conflicto.
- CA-4.8: Given tenant `manual`, When SuperAdmin cambia su plan, Then no hay llamada a Stripe y queda registro en auditoría.
- CA-4.9: Given suscripción `past_due` vencido el período de gracia, When un usuario muta datos, Then 403 solo-lectura.
