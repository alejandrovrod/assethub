# M3 — Seguridad (Identity, RBAC, MFA, auditoría)

Autenticación y autorización de usuarios por tenant sobre ASP.NET Core Identity: login con JWT, refresh rotativo, RBAC por permisos atómicos, invitaciones, MFA TOTP, política de contraseñas y auditoría de accesos.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-3.1 | Usuario | Login con email/password → access token JWT (15 min) + refresh token (30 días) |
| CU-3.2 | Usuario | Renueva access token con refresh token; el refresh rota en cada uso |
| CU-3.3 | Sistema | Detecta reuso de refresh token → revoca toda la cadena (`FamilyId`) |
| CU-3.4 | Usuario | Logout: revoca refresh token activo |
| CU-3.5 | TenantAdmin | Gestiona roles como conjuntos de permisos atómicos (`assets.read`, `tasks.assign`...) |
| CU-3.6 | TenantAdmin | Invita usuario por email con rol; el invitado acepta y define su password |
| CU-3.7 | Usuario | Activa MFA TOTP (QR + códigos de recuperación); valida TOTP en login |
| CU-3.8 | TenantAdmin | Fuerza MFA por política del tenant |
| CU-3.9 | SuperAdmin | Consulta `AuditLog` de accesos y mutaciones |

## Reglas de negocio

- RN-3.1: JWT con claims `sub`, `tid`, `roles`, `perms`; firma RSA con rotación de claves.
- RN-3.2: Refresh token rotativo con hash en DB, `ReplacedByTokenId`, `RevokedAt`, `FamilyId`; reuso = revocación total.
- RN-3.3: Política de password: mínimo 12 caracteres, validada server-side vía Identity.
- RN-3.4: Autorización exclusivamente por permisos, nunca por nombre de rol; roles definibles por tenant.
- RN-3.5: MFA TOTP opcional por usuario, forzable por política del tenant; sin MFA válido no hay token.
- RN-3.6: Todo login (éxito/fallo), logout, invitación y cambio de rol registra auditoría con IP (R3).
- RN-3.7: Rate limiting por IP en login/signup y por tenant en endpoints autenticados.
- RN-3.8: Invitaciones con token de un solo uso y expiración (72 h).

## Criterios de aceptación

- CA-3.1: Given credenciales válidas, When POST `/api/v1/auth/login`, Then devuelve access JWT con exp ≤ 15 min y cookie/body con refresh de 30 días.
- CA-3.2: Given password de 8 caracteres, When signup/cambio, Then 400 problem+json con detalle de política.
- CA-3.3: Given un refresh token usado dos veces, When se detecta reuso, Then toda la familia `FamilyId` queda revocada.
- CA-3.4: Given logout, When se reintenta usar el refresh, Then 401.
- CA-3.5: Given usuario sin permiso `assets.write`, When POST de activo, Then 403 problem+json.
- CA-3.6: Given invitación válida, When el invitado acepta con password ≥ 12, Then queda usuario activo con el rol asignado y la invitación marcada `AcceptedAt`.
- CA-3.7: Given usuario con MFA activo, When login sin código TOTP, Then 401 con `mfa_required`; con TOTP válido, Then 200.
- CA-3.8: Given política de MFA forzado, When usuario sin MFA hace login, Then se le exige enrolamiento antes de continuar.
- CA-3.9: Given 5 logins fallidos desde una IP, When un intento más, Then 429.
- CA-3.10: Given cualquier mutación, When se completa, Then existe fila en `AuditLog` con usuario, acción, entidad, valores e IP.
