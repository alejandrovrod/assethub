# Plan: 015 - Gestión de Órdenes y Tareas de Mantenimiento

## Arquitectura y Stack
- **Dominio**:
  - Nuevas entidades `MaintenanceOrder` y `WorkTask` (con FK a técnico asignado, activo e incidencia relacionada).
- **Backend (.NET 10)**:
  - Manejo transaccional en `CreateMaintenanceOrderCommand` para incluir la creación de las tareas.
  - Interfaz `IEmailService` e implementación base `SmtpEmailService` para el despacho de notificaciones (Event Handlers `MaintenanceOrderCreatedEventHandler` y `WorkTaskCreatedEventHandler`).
- **Frontend (React 19)**:
  - Estructura de "accordion" para desglose visual de Tareas dentro de una Orden.
  - Vistas `maintenance-order-form-sheet`, `maintenance-order-detail`.

## Fases
1. **Modelos y API**: Construcción de las tablas SQL y los controladores REST para órdenes y tareas.
2. **Servicio de Notificaciones**: Desarrollar un inyector SMTP y su clase correspondiente para el despacho asíncrono desde los handlers.
3. **Frontend Forms**: Implementar el Form Sheet que permita rellenar de forma amigable los campos complejos.
4. **Despliegue UI**: Inserción de un nuevo widget (`asset-maintenance-orders-widget`) en el perfil del activo.
