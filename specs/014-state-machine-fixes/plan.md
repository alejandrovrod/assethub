# Plan: 014 - Corrección de la Máquina de Estados

## Arquitectura y Stack
- **Backend (.NET 10, Clean Architecture)**:
  - `AssetHub.Application`: Inclusión de los Event Handlers (`AssetOnEnterTriggerHandler`, `IncidentAssignedEventHandler`) con suscripción a mediatR.
  - Extensión del sistema de dominio para emitir eventos cada vez que ocurren cambios críticos en incidentes y tareas.
- **Frontend (React 19, TS, Vite)**:
  - Uso de react-query para re-fetchear la información de perfil y canvas de ciclo de vida (`lifecycle-canvas.tsx`, `propagated-properties-display.tsx`) cuando cambian los estados.

## Fases
1. **Lógica de BackEnd (Handlers)**: Redactar los interceptores para las transiciones. Validar esquemas y procesar el resultado de la transición de estado.
2. **Infraestructura de Eventos**: Disparar los eventos `IncidentAssignedEvent` u equivalentes desde los endpoints de incidencias.
3. **UI Updates**: Reparar la pantalla de detalle para habilitar/deshabilitar componentes según el valor de `CurrentState`.
