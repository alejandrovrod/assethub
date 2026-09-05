# Feature: 012 - Plantillas de Sistema Globales

## Resumen (Overview)
Cambio estructural para permitir compartir bibliotecas de forma global entre los distintos tenants dentro de la plataforma Kimi. Permite que el `TenantId` sea anulable (`null`) para las plantillas de sistema (como definiciones genéricas de bombas o motores) y tipos de entidades de negocio, de modo que puedan ser accesibles por todos los tenants sin necesidad de duplicar registros.

## Requerimientos Funcionales (Functional Requirements)
- **FR-12.1**: El Administrador del Sistema (Global Admin) puede crear plantillas de sistema y tipos de entidades de negocio globales donde el `TenantId` es `null`.
- **FR-12.2**: Los usuarios estándar (Usuarios de Mantenimiento del Tenant) pueden visualizar y seleccionar plantillas globales desde su biblioteca de plantillas.
- **FR-12.3**: Los usuarios estándar pueden instanciar activos pertenecientes a su tenant específico basándose en una plantilla global.
- **FR-12.4**: El sistema debe forzar el acceso de solo-lectura para las plantillas globales cuando sean accedidas por administradores no globales.
- **FR-12.5**: El sistema debe permitir que las plantillas globales coexistan con las plantillas específicas del tenant en los resultados de búsqueda y menús desplegables.

## Casos Extremos y Reglas de Negocio (Edge Cases & Business Rules)
- **RN-12.1**: Una plantilla con `TenantId = null` se considera "A Nivel de Sistema" o "Global".
- **RN-12.2**: Las reglas de aislamiento de tenant (Row-Level Security o filtros de consulta globales) deben permitir explícitamente condiciones OR para `TenantId == null` en tablas compartidas.
- **RN-12.3**: Cualquier intento de editar o eliminar una plantilla global por parte de un administrador de un tenant local debe retornar un error 403 Forbidden.
- **RN-12.4**: Los activos creados a partir de plantillas globales deben tener siempre un `TenantId` válido y no nulo asociado al tenant del creador.

## Criterios de Éxito (Success Criteria)
- **SC-12.1**: Las plantillas globales son visibles para todos los tenants en los endpoints de listado.
- **SC-12.2**: La creación de un activo desde una plantilla global enlaza exitosamente el activo al tenant local, reteniendo el `TemplateId` global.
- **SC-12.3**: Las peticiones PUT o DELETE a una plantilla global por parte de un administrador no global resultan en una respuesta 403.
- **SC-12.4**: El aislamiento de datos se mantiene intacto para todas las demás entidades específicas del tenant (activos, órdenes, etc.).

## Casos de Uso (Use Cases)
- **UC-12.1**: El Administrador Global crea una plantilla de Bomba Centrífuga Genérica y la hace disponible globalmente omitiendo el `TenantId`.
- **UC-12.2**: Un usuario del Tenant A crea una nueva bomba en sus instalaciones usando la plantilla global de Bomba Centrífuga como base.
- **UC-12.3**: Un usuario del Tenant B intenta modificar la plantilla global de Bomba Centrífuga pero es bloqueado por la validación de seguridad.
