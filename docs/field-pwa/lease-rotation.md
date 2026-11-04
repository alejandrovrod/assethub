# Rotación de claves del lease offline

Documento operativo de `022-field-sync-backend` (T071). Cubre el material de firma del
lease de la PWA de campo (B4), no el del access token.

---

## 1. Qué se firma y con qué

| Documento | Algoritmo | Clave | Se valida en |
| :--- | :--- | :--- | :--- |
| Access token | HS256 (simétrico) | `JwtSettings:Secret` | El API (`JwtBearer`) |
| Lease offline | RS256 (asimétrico) | Anillo RSA `JwtSettings:OfflineLease:Keys` | El dispositivo, con el JWKS |

El lease **no** usa la clave del access token. Publicar un JWKS de una clave simétrica
sería publicar el secreto con el que se firman todas las credenciales de API. Mientras el
access token firme HS256, la única forma de cumplir `§6.2` sin filtrar ese secreto es un
par RSA dedicado. Consecuencia deseable: el lease es criptográficamente inútil contra el
API — el middleware sólo conoce la clave simétrica (ver `OfflineLeaseScopeTests`).

---

## 2. El anillo de claves

```jsonc
// appsettings.Production.json, secret store o variables de entorno
"JwtSettings": {
  "OfflineLease": {
    "Keys": [
      { "Kid": "k-2026-10", "PrivateKeyPem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" },
      { "Kid": "k-2026-07", "PrivateKeyBase64": "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t..." }
    ]
  }
}
```

- **Índice 0 firma.** El resto sólo se publica, para verificar leases ya emitidos.
- `PrivateKeyPem` admite el PEM con `\n` escapados (JSON no permite saltos crudos) o
  `PrivateKeyBase64` con el PEM codificado. PKCS#8 (`BEGIN PRIVATE KEY`) o PKCS#1
  (`BEGIN RSA PRIVATE KEY`).
- Sin configuración, el servicio genera una clave **efímera** por proceso y registra un
  warning: alcanza para desarrollo y CI, pero cada reinicio invalida los leases emitidos.
  En producción las claves son configuración obligatoria.

Generar un par nuevo:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out lease-2027-01.pem
openssl pkey -in lease-2027-01.pem -pubout          # sólo para verificar que el par sirve
```

---

## 3. Por qué se publica también la clave anterior

Un lease vive entre 4 y 24 h (`fieldApp.offlineLeaseHours`), pero un técnico puede pasar
días sin red. Si al rotar se retira la clave anterior, los leases firmados con ella dejan
de verificar y el dispositivo **falla cerrado**: no puede abrir la sesión offline y el
trabajo del día queda bloqueado hasta que recupere señal.

Por eso `GET /.well-known/jwks.json` publica la clave vigente **y la anterior**, con un
solape de 30 días: cubre de sobra el lease más largo, los reintentos y los dispositivos que
no sincronizaron.

---

## 4. Runbook de rotación

El JWKS se sirve con `Cache-Control: public, max-age=86400`, así que un dispositivo puede
tener el documento viejo cacheado hasta 24 h. De ahí que la rotación sea en **tres
despliegues** y no en uno.

### Paso 1 — publicar la clave nueva sin firmar

Agregar la clave nueva **al final** del arreglo. Se publica en el JWKS, pero el índice 0
sigue firmando con la anterior:

```jsonc
"Keys": [
  { "Kid": "k-2026-10", ... },   // firma
  { "Kid": "k-2027-01", ... }    // publicada, todavía no firma
]
```

Esperar **más de 24 h** (el TTL del cache del JWKS). Si se promueve antes, un dispositivo
con el JWKS viejo recibe un lease con un `kid` que no conoce y no puede verificarlo.

### Paso 2 — promover a clave de firma

Mover la clave nueva al índice 0 y desplegar:

```jsonc
"Keys": [
  { "Kid": "k-2027-01", ... },   // firma
  { "Kid": "k-2026-10", ... }    // sigue publicada para leases viejos
]
```

Los leases emitidos hasta ahora siguen validando con la segunda entrada.

### Paso 3 — retirar la clave vieja

Después de **30 días** desde el paso 2, eliminar la entrada vieja. Antes de borrarla,
verificar que no queden leases vigentes firmados con ella: a partir de este momento, un
dispositivo que no haya renovado lease no podrá verificar el suyo.

```jsonc
"Keys": [ { "Kid": "k-2027-01", ... } ]
```

### Validación después de cada paso

```bash
curl -s https://api.example.com/.well-known/jwks.json | jq '.keys[].kid'
```

Debe listar exactamente los `Kid` del arreglo, en el mismo orden.

---

## 5. Rollback

| Situación | Acción |
| :--- | :--- |
| Se promovió la clave nueva antes de tiempo | Volver a dejar la anterior en el índice 0. Los leases nuevos vuelven a firmarse con la clave que los dispositivos ya cachearon. |
| La clave privada se filtró | Retirarla del anillo **inmediatamente** y aceptar que los leases firmados con ella dejan de verificar. El lease no es revocable por diseño (`§4.4`): la rotación es el mecanismo de revocación. |
| El servicio arranca con claves efímeras | Faltó configuración. Revisar el warning `No offline lease signing keys configured`. |

---

## 6. Qué no cubre este documento

- **Revocación individual de un lease.** No existe: caduca por `exp` (máx. 24 h). Si se
  revoca el refresh token del usuario, el lease sigue vivo hasta su vencimiento; es un
  riesgo aceptado y documentado en `spec.md §4.4`.
- **Rotación de la clave del access token (HS256).** Es otro material y otro mecanismo:
  rotar `JwtSettings:Secret` invalida todos los access tokens en vuelo.
- **`fieldApp.enabled`.** El flag se persiste en esta fase (`TenantFieldAppSettings`) y se
  exige en el login de campo en T082.
