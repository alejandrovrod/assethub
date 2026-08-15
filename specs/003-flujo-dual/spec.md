# Spec: Flujo Dual & Automatización de Estados

## Background
El sistema cuenta con Activos e Incidencias, cada uno con su propia máquina de estados (`LifecycleStates` y `Transitions`). El "Flujo Dual" implica que ambos ciclos de vida interactúan. Se requiere la implementación backend para:
1. Validar y almacenar información dinámica (JSON) en transiciones de estado, incluyendo la persistencia de evidencias (archivos).
2. Soportar la subida de archivos (endpoints genéricos de File Uploads).
3. Mecanismos de automatización: Bloqueos de estado (Actuators), triggers automáticos `OnEnter` en estados de activos, y liberación de activos cuando una Incidencia se cierra.

## User Stories

### Story 1: Subida de Archivos y Evidencias
**Priority:** P1
**Status:** 🟡 Parcial (Frontend UI completado)
Como sistema frontend,
Quiero poder subir múltiples archivos a un endpoint genérico y obtener sus URLs.
Para que puedan ser adjuntadas como evidencia en los formularios dinámicos (según el `SchemaJson`).

**Requerimientos específicos implementados (UI):**
- Un campo tipo `file` debe poder tener múltiples archivos (`array` de `data-url`), y cada campo funciona de manera independiente.
- Las imágenes no deben mostrarse a tamaño completo inmediatamente en los formularios (activos/incidencias) para no saturar la pantalla.
- Se debe abrir un modal tipo "carrusel" (Lightbox) para ver las imágenes a tamaño completo con botones para navegar entre ellas.
- La UI del input de subida debe ser hiper-compacta (pequeña y en disposición horizontal).
- La previsualización en el formulario debe ser una galería pequeña sin textos (solo el ícono/miniatura y un botón "X" para eliminar).
- Los archivos subidos localmente no deben trackearse en el repositorio de Git (`.gitignore`).

*Nota: La UI de carga de archivos (`FileUploadWidget`), visor de imágenes (`LightboxModal`) y validadores de RJSF ya fueron implementados en Frontend. Queda pendiente el endpoint real en el Backend.*

### Story 2: Transiciones con Información Dinámica
**Priority:** P1
Como gestor,
Quiero que al transicionar un Activo o Incidencia, el backend valide los `properties` enviados contra el `SchemaJson` de la transición y los almacene en la tabla de historial/bitácora (ej. `AssetLifecycleEvents`).
Para asegurar la trazabilidad de la justificación o evidencias requeridas.

### Story 3: Bloqueo de Activos por Incidencia (Actuator Locking)
**Priority:** P2
Como administrador del flujo,
Quiero que cuando un activo entra en un estado delegado (ej. "En Reparación" debido a una incidencia), su estado quede bloqueado para transiciones manuales.
Para evitar que un usuario manipule la operatividad del activo mientras está bajo el control del flujo burocrático de mantenimiento.

### Story 4: Triggers `OnEnter` y Notificaciones
**Priority:** P2
Como despachador,
Quiero que al entrar a un estado específico (ej. "Peligro Activo"), el sistema ejecute las acciones configuradas en `OnEnter` del template (ej. "NOTIFICAR_POLICIA").
Para automatizar avisos y respuestas a situaciones críticas sin intervención humana.

### Story 5: Liberación de Activos (Cierre de Incidencia)
**Priority:** P2
Como supervisor,
Quiero que cuando una Incidencia alcance un estado terminal (ej. "Cerrada"), el sistema evalúe y ejecute la orden de liberar o restaurar el estado del Activo relacionado.
Para que el mundo físico refleje automáticamente la resolución burocrática del problema.
