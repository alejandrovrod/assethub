# Gestión de Tareas y Órdenes de Mantenimiento

## 1. Contexto y Problema
Hasta ahora, la gestión de incidencias no contaba con un ciclo de vida completo respaldado por órdenes de trabajo ejecutables y formales. Los equipos de terreno requieren un módulo para crear, rastrear y gestionar órdenes de trabajo (Maintenance Orders) y subtareas con notificaciones integradas.

## 2. Objetivos
- Proveer un módulo completo de gestión de tareas de mantenimiento.
- Implementar vistas de lista y detalle con seguimiento de estado (Status Tracking).
- Implementar la arquitectura de creación y administración de tareas de trabajo con notificaciones automáticas por correo electrónico para los asignados.

## 3. Arquitectura y Componentes
- **Dominio y Base de Datos**:
  - Modelos `MaintenanceOrder` y `WorkTask` (o equivalentes) con soporte para seguimiento de ciclos de vida (estados: Pendiente, En Progreso, Completada, Cancelada).
- **Backend (API)**:
  - Comandos (Commands) y Consultas (Queries) bajo el patrón CQRS para gestionar las órdenes.
  - Implementación de notificaciones de correo mediante integración con proveedor de emails.
- **Frontend (UI)**:
  - Form sheets y modales para creación ágil de nuevas órdenes y tareas.
  - Vistas detalladas para visualizar progreso e historial de estados.

## 4. Tareas (Work Breakdown)
- [x] Desarrollo de endpoints API para CRUD de Órdenes y Tareas.
- [x] Vistas de listado, detalle y DataTables en el frontend.
- [x] Lógica de envío de correos electrónicos en cambios de estado o asignación.
- [x] Gestión de ciclos de vida (Status tracking).

## 5. Fuera de Alcance
- Sincronización offline en la aplicación móvil de técnicos (se contempla para fases futuras).
