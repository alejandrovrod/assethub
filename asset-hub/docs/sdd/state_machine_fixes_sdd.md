# Correcciones de la Máquina de Estados (State Machine)

## 1. Contexto y Problema
La propagación de estados a través del ciclo de vida de los activos presentaba inconsistencias cuando eventos de mantenimiento (creación de órdenes, incidencias) debían transicionar automáticamente el estado del activo. Era necesario estandarizar el flujo y asegurar la correcta aplicación de los estados permitidos (`LifecycleStates`) en frontend y backend.

## 2. Objetivos
- Corregir y robustecer la máquina de estados en el ciclo de vida del activo.
- Propagar los estados de forma automatizada cuando se asigne una incidencia o inicie una orden de trabajo.
- Reflejar de manera consistente los estados actuales y sus restricciones de transición en la UI.

## 3. Arquitectura y Componentes
- **Backend (Event Handlers)**:
  - `AssetOnEnterTriggerHandler`: Centraliza la lógica al entrar a un nuevo estado de vida.
  - `IncidentAssignedEventHandler`: Dispara transiciones de estado cuando un reporte o problema es tomado por un técnico.
  - Validaciones de transiciones contra la definición JSON de `LifecycleStates` de la plantilla.
- **Frontend (UI)**:
  - Reparaciones en los flujos de UI que permiten cambios de estado (propagación del estado correcto en badges y selects).
  - Vistas que deshabilitan botones si la máquina de estados no permite ciertas transiciones en ese momento.

## 4. Tareas (Work Breakdown)
- [x] Corregir validaciones de transición de estados en la capa de Aplicación.
- [x] Implementar Handlers para interceptar y reaccionar ante eventos de dominio (Incidencias, Órdenes).
- [x] Ajustar la interfaz para reflejar visualmente la validación de la máquina de estados en los detalles de los activos.

## 5. Fuera de Alcance
- Crear un diseñador de máquinas de estado visual (drag & drop) para los usuarios finales.
