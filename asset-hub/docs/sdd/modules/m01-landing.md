# M1 — Landing page pública

Landing pública de AssetHub: punto de entrada de Invitados. Presenta hero, features, pricing (desde endpoint público), CTA de signup y footer. Multi-idioma (es/en) y SEO básico. Es el único módulo accesible sin autenticación ni tenant resuelto.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-1.1 | Invitado | Visualiza hero con propuesta de valor y CTA "Empezar" |
| CU-1.2 | Invitado | Navega a sección de features (multi-tenant, geo, templates, mantenimiento) |
| CU-1.3 | Invitado | Consulta pricing: planes públicos (`IsPublic=true`) obtenidos del endpoint público `/api/v1/public/plans` |
| CU-1.4 | Invitado | Pulsa "Elegir plan" → redirige a signup con `planCode` preseleccionado (M2) |
| CU-1.5 | Invitado | Cambia idioma es ↔ en; la elección persiste en `localStorage` |
| CU-1.6 | Invitado | Navega a login si ya tiene cuenta |
| CU-1.7 | Invitado | Lee páginas legales (términos, privacidad) |

## Reglas de negocio

- RN-1.1: La landing es cross-tenant (DB catálogo); ninguna query toca datos de negocio (R1).
- RN-1.2: El pricing nunca se hardcodea en el frontend: se consume de `Plans` con `IsPublic=true` vía endpoint público cacheado (5 min).
- RN-1.3: Toda fecha/precio mostrado respeta locale del navegador; las fechas internas se manejan UTC (R5).
- RN-1.4: Textos de UI en claves de traducción con mínimo `es` y `en` (R6).
- RN-1.5: Rate limiting por IP en endpoints públicos (seguridad, spec §4).
- RN-1.6: SEO básico: `<title>`, meta description, Open Graph, canonical, sitemap.xml y robots.txt.

## Criterios de aceptación

- CA-1.1: Given un Invitado en `/`, When carga la página, Then ve hero + features en menos de 2.5s LCP.
- CA-1.2: Given planes `free`/`pro` con `IsPublic=true` y `enterprise` con `IsPublic=false`, When GET `/api/v1/public/plans`, Then solo devuelve `free` y `pro`.
- CA-1.3: Given un Invitado en pricing, When pulsa "Elegir pro", Then navega a `/signup?plan=pro`.
- CA-1.4: Given idioma `es`, When el Invitado cambia a `en`, Then toda la UI se re-renderiza en inglés sin recarga de página.
- CA-1.5: Given una recarga, When el usuario había elegido `en`, Then la landing vuelve en `en`.
- CA-1.6: Given el HTML servido, When se inspecciona el `<head>`, Then existen title, meta description y tags OG.
- CA-1.7: Given 100 requests desde la misma IP en 1 minuto al endpoint público, When se supera el límite, Then responde 429 `application/problem+json` (R10).
