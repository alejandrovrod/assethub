# Matriz de Comportamiento del Service Worker (`field-pwa`)

Este documento define la matriz de comportamiento, estrategias de caché de Workbox y validación manual del Service Worker (`apps/field-pwa/src/sw.ts`) según el plan §8.1–§8.4 de `specs/021-pwa-field-app`.

---

## 1. Estrategias por Recurso

| Tipo de Recurso | Patrón / Destino | Estrategia Workbox | Caché | Regla de Negocio |
|---|---|---|---|---|
| **App Shell (HTML, JS, CSS, WebManifest)** | Precache manifest generado (`self.__WB_MANIFEST`) | `precacheAndRoute` | Caché de Workbox versionada | Arranca en frío (< 3 s) en modo avión sin conexión |
| **API Endpoints** | `/api/v1/**` | `NetworkOnly` | **Ninguna caché HTTP** | **Invariante arquitectónica**: la UI nunca lee de caché HTTP; toda lectura es de Dexie y toda escritura va por Outbox |
| **Media / Fotos / Adjuntos** | `destination === 'image' \|\| 'video'` | `StaleWhileRevalidate` | `media-cache` (max 60 entradas, TTL 30 días) | Fotos y previews visualizables offline sin saturar memoria |

---

## 2. Eventos de Sincronización en Segundo Plano

| Evento | Tag | Comportamiento |
|---|---|---|
| `sync` | `outbox-drain` | Notifica a clientes ventana activos (`SW_DRAIN_REQUESTED`) para drenar outbox cuando el navegador detecta reconexión |
| `periodicsync` | `field-periodic-sync` | Dispara sincronización periódica en segundo plano en navegadores compatibles (Android/Chrome) |

---

## 3. Matriz de Actualización y Protección del Outbox

| Escenario | Condición | Comportamiento esperado |
|---|---|---|
| **Nueva versión del SW disponible** | Outbox vacío (`pending === 0`) | Se muestra prompt *"Nueva versión disponible · Actualizar"*; al aceptar se envía `SKIP_WAITING` y recarga |
| **Nueva versión con mutaciones en vuelo** | Outbox con mutaciones (`pending > 0`) | **NO** se aplica `skipWaiting`. Se muestra *"Actualización disponible · se aplicará cuando se sincronicen los cambios pendientes"* para evitar pérdida de datos |
| **Reconexión de red** | Transición `offline -> online` | Dispara `drainNow()` y vacía el outbox; si había actualización pendiente, ahora se desbloquea |

---

## 4. Checklist de Smoke Test Manual

- [ ] **Instalación**: Chrome Android o Edge muestra el botón "Instalar aplicación" (PWA standalone).
- [ ] **Modo Avión**: Con modo avión activado, recargar la PWA; la interfaz carga inmediatamente con el banner `Sin conexión`.
- [ ] **API NetworkOnly**: Inspeccionar Network tab; llamadas a `/api/v1/**` nunca muestran `(ServiceWorker)` como fuente de caché.
- [ ] **Media Cache**: Tomar o ver una foto; en Application > Cache Storage aparece `media-cache` con el asset almacenado.
- [ ] **Lifecycle**: Actualizar una versión y verificar que no interrumpe una sesión con mutaciones pendientes.

