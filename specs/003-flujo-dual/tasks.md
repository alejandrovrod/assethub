# Tasks: Flujo Dual & AutomatizaciÃ³n de Estados

## Phase 0: UI de Evidencias (Completado)
- [x] 0.1 Frontend: Crear `FileUploadWidget` con soporte para arrastrar y soltar, subida simulada de mÃºltiples archivos (`data-url`).
- [x] 0.2 Frontend: Integrar `LightboxModal` para previsualizaciÃ³n a pantalla completa de imÃ¡genes.
- [x] 0.3 Frontend: Crear `customValidator` en RJSF para permitir formatos HTTP URL en esquemas `data-url`.
- [x] 0.4 Frontend: DiseÃ±ar galerÃ­a compacta (48x48px) para renderizar fotos anexadas sin ocupar espacio en pantalla.
- [x] 0.5 Frontend: Reemplazar el validador en formularios dinÃ¡micos (`report-incident`, `incident-detail`, `asset-form`, etc.).
- [x] 0.6 Repo: Ignorar directorio `wwwroot/uploads` en `.gitignore` para omitir cargas temporales.

## Phase 1: Setup & Data Model
- [ ] 1.1 `AssetHub.Domain`: Crear `ValueObject` para `PropertiesJson` (si no existe) y validar tamaÃ±o/formato.
- [ ] 1.2 `AssetHub.Domain`: Definir Domain Events `AssetTransitionedEvent` y `IncidentClosedEvent`.
- [ ] 1.3 `AssetHub.Infrastructure`: Configurar tabla/columna para almacenar el `PropertiesJson` en `AssetLifecycleEvent` y `IncidentLifecycleEvent`.
- [ ] 1.4 `AssetHub.Infrastructure`: Crear `IFileStorageService` para persistir archivos subidos (implementaciÃ³n en disco local y/o S3/BlobStorage).

## Phase 2: File Uploads Endpoint (Story 1)
- [ ] 2.1 `AssetHub.Api`: Crear controlador `FilesController` con endpoint genÃ©rico `POST /api/v1/files/upload`.
- [ ] 2.2 `AssetHub.Application`: Crear comando `UploadFileCommand` y su handler, inyectando `IFileStorageService`.
- [ ] 2.3 `AssetHub.Api`: Configurar soporte para Multipart/form-data. Retornar DTO con las URLs de los archivos subidos.
- [ ] 2.4 Escribir pruebas unitarias e integraciÃ³n (subida simulada).

## Phase 3: Transiciones con InformaciÃ³n DinÃ¡mica (Story 2)
- [ ] 3.1 `AssetHub.Application`: Modificar `TransitionAssetCommand` y `TransitionIncidentCommand` para recibir `PropertiesJson`.
- [ ] 3.2 `AssetHub.Application`: Implementar validaciÃ³n en los handlers de transiciÃ³n contra el `SchemaJson` del template correspondiente (usando `NJsonSchema`).
- [ ] 3.3 `AssetHub.Domain`: Guardar el payload validado en `AssetLifecycleEvent` o `IncidentLifecycleEvent`.
- [ ] 3.4 Escribir pruebas unitarias (casos vÃ¡lidos e invÃ¡lidos contra schemas definidos).

## Phase 4: Actuator Locking y Delegación (Story 3) (Completado)
- [x] 4.1 `AssetHub.Domain`: Agregar `AssociatedModule` a `StateConfig` en `LifecycleConfig.cs` para persistir delegación.
- [x] 4.2 `Frontend`: Integrar selector de `AssociatedModule` en `lifecycle-canvas.tsx` para estados.
- [x] 4.3 `Frontend`: Implementar interceptor en `detail.tsx` para mostrar modal de creación delegada.
- [x] 4.4 `Frontend`: Ocultar botones de transición y mostrar banner de candado cuando el estado actual está delegado a un módulo.

## Phase 5: Triggers `OnEnter` y Notificaciones (Story 4) (Completado)
- [x] 5.1 `AssetHub.Application`: Crear EventHandler `AssetTransitionedEventHandler` (suscrito al Domain Event).
- [x] 5.2 `AssetHub.Application`: Al procesar el evento, cargar la transición, recuperar la lista de comandos/acciones definidas en `OnEnter`.
- [x] 5.3 Implementar dispatcher simple (ej. si OnEnter = `NOTIFICAR_POLICIA`, llamar a un servicio de Notificación falso o log).
- [x] 5.4 Asegurar que si el Trigger falla, NO afecte la transacción original (Outbox pattern o simple Background dispatch).

## Phase 6: Liberación de Activos (Story 5) (Completado)
- [x] 6.1 `AssetHub.Domain`: Identificar si una transición de incidente es a estado terminal (`IsTerminal = true`) y disparar `IncidentClosedEvent`.
- [x] 6.2 `AssetHub.Application`: Crear EventHandler `IncidentClosedEventHandler`.
- [x] 6.3 `AssetHub.Application`: El handler busca el Asset bloqueado por esta incidencia. Fuerza su transición al estado configurado de vuelta (ej. `Instalado_Activo`), saltando el check de validación manual.
- [x] 6.4 Pruebas de integración E2E del Flujo Dual completo.

## Phase 7: Compartir Aplicación (Port Forwarding)
- [ ] 7.1 Configurar un túnel o port forwarding para exponer el servidor de desarrollo (localhost:5173) a Internet.
- [ ] 7.2 Actualizar variables de entorno para asegurar que las peticiones CORS en el Backend acepten el host expuesto a internet.

## Phase 8: Bugfixes & UI Polish (Completado hoy)
- [x] BUGFIX-1: Solucionar error de "Ghost Fields" en transiciones de estado, permitiendo visualizar y eliminar campos requeridos que ya no existen en el esquema JSON en `lifecycle-canvas.tsx`.
- [x] BUGFIX-2: Agregar `ILogger` detallado en `ChangeAssetEnvironmentStateCommandHandler` para diagnosticar errores de validación de campos requeridos.
- [x] CONFIG-1: Configurar correctamente el JSON de plantillas para propagación al padre (`ParentStatePropagationHandler`).
- [x] CONFIG-2: Proveer y configurar el JSON de la Plantilla de Incidencias para soportar correctamente el flujo de máquina de estados.
