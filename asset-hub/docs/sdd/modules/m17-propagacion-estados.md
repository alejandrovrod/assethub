# M17: Propagación Automática de Estados y Resolución de Incidencias

## Resumen

Con la introducción de la automatización completa (Incidencias -> Órdenes de Mantenimiento -> Tareas), el ciclo de vida de una incidencia puede completarse de manera automática cuando los técnicos terminan sus tareas. Este documento detalla los ajustes arquitectónicos que garantizan que el árbol de activos se actualice correctamente de "abajo hacia arriba" cuando una incidencia se resuelve automáticamente.

## Problema Original

En flujos manuales, los usuarios pasaban los activos por estados intermedios (ej. `En_Reparacion`). Con la automatización, el sistema resolvía la incidencia instantáneamente desde estados críticos (ej. `Falla_Total`), provocando dos efectos:
1. Si el activo hoja (ej. Vehículo) ya estaba en su estado inicial (`Activo`), el sistema cancelaba silenciosamente la propagación hacia el padre.
2. Si el padre (ej. Luminaria) intentaba sanar a `Instalado_Activo`, pero su plantilla solo le permitía transicionar hacia `En_Reparacion`, el sistema bloqueaba el movimiento y el abuelo (ej. Carretera) se quedaba atascado en falla.

## Cambios Arquitectónicos

### 1. Transiciones Forzadas (`ChangeIncidentStateCommand.cs`)
Se añadió la propiedad `ForceTransition`. Esto permite a los EventHandlers del sistema realizar saltos de estado (ej. `En_Reparacion` -> `Resuelta`) que ignoran las restricciones manuales del UI, crucial para cuando las órdenes de mantenimiento desencadenan el cierre automático.

### 2. Resolución Dinámica de Estado Terminal (`MaintenanceOrderCompletedEventHandler.cs`)
Al completar una orden de mantenimiento, el handler consulta la configuración JSON de la plantilla de incidencia (`IncidentTemplate.LifecycleStates`). Localiza dinámicamente un estado que posea `IsTerminal == true` (ej. `Resuelta` o `Cerrada`) y transiciona la incidencia utilizando `ForceTransition = true`.

### 3. Garantía de Propagación hacia Arriba (`IncidentClosedEventHandler.cs`)
Se eliminó la cláusula de salida temprana (`if (asset.State == initialState) return;`). Ahora, al cerrar cualquier incidencia, el sistema siempre dispara el evento `AssetStateChangedEvent`. 
* **Impacto:** Esto obliga al `ParentStatePropagationHandler` a reevaluar siempre el estado del nodo padre basado en la regla de `ChildStateDependencies`, sanando al Abuelo incluso si el Nieto original nunca cambió de estado.

## Requisito Crítico de Configuración (Frontend/Plantillas)
Dado que el `ParentStatePropagationHandler` respeta estrictamente el diagrama de estados (Transitions) creado por el usuario en la plantilla del activo, **es obligatorio que exista una transición directa** desde los estados de falla (ej. `Falla_Total`) hacia los estados de recuperación (ej. `Instalado_Activo`) para que la curación automática en cascada se ejecute con éxito. Si falta esta flecha en el UI, la propagación se detendrá en el nodo que carezca de la transición.
