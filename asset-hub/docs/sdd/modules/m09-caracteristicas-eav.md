# M9 — Características de activos (EAV)

Atributos dinámicos por activo según el `SchemaJson` de su template: modelo EAV tipado (`text`, `number`, `date`, `bool`, `catalog`, `geo`, `json`) con validación server-side estricta y errores detallados por atributo.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-9.1 | Gestor | Define valores de características al crear un activo |
| CU-9.2 | Gestor | Actualiza un atributo individual o en lote |
| CU-9.3 | Sistema | Valida cada valor contra el schema: tipo, obligatoriedad, rango, catálogo, formato |
| CU-9.4 | Lectura | Consulta características de un activo con labels traducidos (M5) |
| CU-9.5 | Gestor | Búsqueda dinámica basada en atributos: filtra activos cruzando EAV (ej. filtros dinámicos que varían por negocio usando catálogos `ValueCatalogItemId`) |
| CU-9.6 | TenantAdmin | Evoluciona el schema (M7 v2); los valores existentes no se rompen |

## Reglas de negocio

- RN-9.1: Toda validación es server-side contra el `SchemaJson` del template del activo (versión aplicable); el frontend solo mejora UX.
- RN-9.2: El tipo de la columna usada depende de `ValueType`: texto→`ValueText`, número→`ValueNumber`, fecha→`ValueDate` (UTC, R5), bool→`ValueBool`, catálogo→`ValueCatalogItemId`, geo→`ValueGeo`, json→`ValueJson`.
- RN-9.3: Atributo `catalog` solo acepta items activos del catálogo declarado en el schema (del tenant o global).
- RN-9.4: Errores: 400 problem+json con lista de fallos por `AttributeKey` (uno por atributo inválido), nunca un error genérico (R10).
- RN-9.5: Atributos obligatorios del schema deben tener valor antes de poder crear el activo o marcarlo como operativo.
- RN-9.6: Tenant-scoped (R1); índice `(TenantId, AssetId, AttributeKey)` y filtrados por `ValueType` para búsqueda.
- RN-9.7: Mutaciones auditadas con old/new values (R3).

## Criterios de aceptación

- CA-9.1: Given schema con atributo `number` y valor `"abc"`, When PUT, Then 400 con error en ese `AttributeKey`.
- CA-9.2: Given atributo obligatorio sin valor, When crear activo, Then 400 listando los obligatorios faltantes.
- CA-9.3: Given atributo `catalog` del catálogo `materiales` con item de otro catálogo, When PUT, Then 400.
- CA-9.4: Given atributo `date`, When PUT con fecha con offset, Then se persiste UTC en `ValueDate`.
- CA-9.5: Given atributo `geo` con GeoJSON Point válido, When PUT, Then `ValueGeo` (geography) poblado.
- CA-9.6: Given 3 atributos inválidos de 5, When PUT lote, Then 400 con exactamente 3 errores por atributo; ninguno se persiste.
- CA-9.7: Given 200 activos con `material='hormigón'`, When GET filtro por atributo, Then devuelve solo esos, usando índice por `ValueType`.
- CA-9.8: Given template actualizado a v2 con atributo nuevo, When se consultan activos viejos, Then sus valores v1 siguen intactos y el atributo nuevo aparece vacío.
- CA-9.9: Given una búsqueda dinámica, When se envían múltiples filtros de catálogo, Then intersecta los valores usando `ValueCatalogItemId` devolviendo los activos coincidentes.
