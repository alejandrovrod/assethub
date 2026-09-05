# Feature: 015 - Gestión de Órdenes y Tareas de Mantenimiento

## Resumen (Overview)
Introducción de un ciclo de vida completo respaldado por "Maintenance Orders" (Órdenes de Trabajo) y "Work Tasks" (Subtareas asignables). Esto cierra la brecha entre el reporte de una incidencia y la planificación de su resolución por el equipo de terreno, agregando un sistema de notificaciones automáticas por correo electrónico.

## Requerimientos Funcionales
- **FR-15.1**: Posibilidad de agrupar y delegar el mantenimiento mediante Órdenes formales (`MaintenanceOrder`), cada una conformada por una o más `WorkTask`.
- **FR-15.2**: Cada tarea puede tener un técnico asignado independiente.
- **FR-15.3**: Envío automatizado de correos electrónicos (notificaciones) al personal técnico cuando una nueva Orden/Tarea sea creada o se asigne a su nombre (vía `SmtpEmailService`).
- **FR-15.4**: Vistas de Listado y Formulario (`form-sheets`) en Frontend.

## Casos Extremos y Reglas de Negocio
- **RN-15.1**: Una incidencia no se considera resuelta hasta que las Órdenes conectadas a ella hayan sido completadas.
- **RN-15.2**: Las notificaciones por correo electrónico deben fallar de manera segura y no bloquear el flujo principal si el servidor SMTP está temporalmente caído.

## Casos de Uso
- **UC-15.1**: El Jefe de Planta revisa un Incidente grave y genera una "Orden de Reparación Urgente", delegando 3 subtareas a distintos técnicos en terreno.
- **UC-15.2**: Los técnicos reciben un correo electrónico avisando que se les asignó una tarea de mantenimiento con el link para revisar los detalles desde su dispositivo móvil.
- **UC-15.3**: El estado general de la Orden de Mantenimiento se actualiza a medida que se marcan las subtareas como terminadas.
