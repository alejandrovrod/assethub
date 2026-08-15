# Plan: M09 - Flujo Dual & Automatización de Estados

## Architecture & Stack
- **Backend (.NET 10, Clean Architecture)**:
  - `AssetHub.Domain`: Domain Events para transiciones. Entities `Asset`, `Incident`, `AssetLifecycleEvent`, `IncidentLifecycleEvent`. Value Objects para `PropertiesJson`.
  - `AssetHub.Application`: Event Handlers (`ParentStatePropagationHandler`, `IncidentClosedHandler`, `AssetTransitionedHandler`). FluentValidation para validar transiciones contra el `SchemaJson`.
  - `AssetHub.Infrastructure`: Almacenamiento local de archivos (temporal/dev) e implementación de IFileStorageService.
  - `AssetHub.Api`: Endpoints `/api/v1/files/upload`.
- **Frontend (React 19, TS, Vite)**:
  - Consumo de `/api/v1/files/upload` desde el `FileUploadWidget` (ya implementado parcialmente).
  - Integración de RJSF para transiciones dinámicas (ya implementado parcialmente).

## Data Model References
- `FileRecord` (o manejo directo de URLs en `PropertiesJson`):
  - Las transiciones almacenan un JSON Blob con la data ingresada, incluyendo las URLs. No se guarda el binario en base de datos.
- `AssetLifecycleEvent` / `IncidentLifecycleEvent`:
  - `FromState` (String)
  - `ToState` (String)
  - `PropertiesJson` (String, JSON)
  - `TriggeredBy` (String)
  - `CreatedAt` (DateTime)

## Key Workflows
1. **Validación de Esquema en Transición**:
   Al enviar un POST a `/api/v1/assets/{id}/transitions` o `/api/v1/incidents/{id}/transitions`, el backend recupera el Template, busca la transición `FromState -> ToState`, extrae el `SchemaJson` y usa un validador (NJsonSchema) para asegurar que el payload `propertiesJson` sea válido.
2. **Delegación (Actuator Locking)**:
   Si el estado del Asset tiene `IsLockedByIncidents = true`, el endpoint de transición manual rechaza cualquier cambio, retornando 409 Conflict.
3. **Eventos y OnEnter**:
   Tras guardar la transición exitosamente, el dominio publica un `AssetTransitionedEvent`. Un handler lee el estado actual del template, verifica si tiene `OnEnter` definido, y dispara los Side Effects (Notificaciones o integraciones externas).
4. **Cierre y Liberación**:
   Cuando una Incidencia llega a un estado terminal (`IsTerminal = true`), publica un `IncidentClosedEvent`. Un handler captura este evento, busca el Asset bloqueado, y fuerza su transición a un estado libre (ej. `Instalado_Activo` u `Operativo`), ignorando la restricción de bloqueo manual.
