# Feature: 014 - Corrección de la Máquina de Estados

## Resumen (Overview)
Se detectaron y corrigieron inconsistencias en la forma en que los activos y sistemas avanzan a través de sus ciclos de vida (Lifecycle). La implementación asegura que los eventos externos, como el reporte de una falla o la asignación de tareas, propaguen automáticamente el estado adecuado.

## Requerimientos Funcionales
- **FR-14.1**: La máquina de estados debe validar toda transición solicitada utilizando el JSON Schema del `LifecycleStates` registrado en el template del activo.
- **FR-14.2**: Cuando una incidencia pase a estado "Asignado", el sistema debe intentar mover automáticamente el activo relacionado al estado "En Mantenimiento" (si existe una transición válida).
- **FR-14.3**: Cualquier cambio de estado a nivel de dominio (`AssetOnEnterTriggerHandler`) debe quedar registrado en los logs de auditoría para su seguimiento.
- **FR-14.4**: La interfaz de usuario debe reaccionar de forma inmediata (vía propiedades propagadas) bloqueando operaciones si el activo se encuentra en un estado inoperativo.

## Casos Extremos y Reglas de Negocio
- **RN-14.1**: Si la transición automática falla por reglas del negocio (ej. el estado destino no está permitido en la plantilla), la operación principal de la incidencia/orden NO debe revertirse, sino ignorar la transición o lanzar un "Warning".
- **RN-14.2**: Las entidades vinculadas (subactivos) no heredan el estado, pero la máquina de estados notifica la propagación general si aplica a lógicas operativas.

## Casos de Uso
- **UC-14.1**: El usuario final reporta un incidente, un coordinador asigna el incidente a un técnico, y el sistema automáticamente pasa la maquinaria al estado "Bajo Mantenimiento".
- **UC-14.2**: Un usuario intenta cambiar el estado de la máquina manualmente en la UI pero el dropdown solo le permite elegir los estados definidos por las reglas de transición actuales.
