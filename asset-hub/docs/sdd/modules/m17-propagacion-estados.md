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

---

## 4. Reacción a Eventos Externos

Para robustecer la máquina de estados, se añadieron nuevos manejadores de eventos en el backend que conectan el ciclo de vida de mantenimiento con el ciclo de vida del activo.

### Casos de uso
| CU | Actor | Descripción |
|---|---|---|
| CU-17.1 | Sistema | Cuando una incidencia es asignada a un técnico, el sistema mueve automáticamente el activo afectado al estado "En Reparación" o equivalente. |
| CU-17.2 | Sistema | Al entrar a un estado específico del ciclo de vida, se ejecutan triggers y lógica secundaria configurada en el perfil del activo (ej. notificaciones). |
| CU-17.3 | Operador | Verifica en la UI que, al asignarse la falla, las acciones del activo quedan bloqueadas hasta que se cierre la orden. |

### Reglas de negocio
- RN-17.1: `IncidentAssignedEventHandler` intenta realizar una transición suave; si la plantilla del activo no permite ir de "Operativo" a "En Reparación", la transición se cancela sin hacer rollback de la asignación.
- RN-17.2: `AssetOnEnterTriggerHandler` centraliza las acciones colaterales cada vez que un activo cambia de estado (auditorías, cálculos de riesgo, etc.).

### Criterios de aceptación
- CA-17.1: Given una incidencia "Abierta", When el administrador asigna un técnico, Then se dispara `IncidentAssignedEvent` y el activo cambia su estado al configurado para reparación.
- CA-17.2: Given un cambio de estado exitoso, When se invoca `AssetOnEnterTriggerHandler`, Then el nuevo estado se propaga a los clientes conectados para refrescar el canvas de ciclo de vida.
