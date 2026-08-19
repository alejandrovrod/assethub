# 007 - State Propagation & Incident Closure Fixes

## Context & Motivation

Before the introduction of fully automated Work Tasks and Maintenance Orders, the resolution of an incident often required manual updates to the asset's state (e.g., from `Falla_Total` to `En_Reparacion`). With automation, the incident remains open until all linked maintenance tasks are completed, at which point the incident transitions automatically to a terminal state (e.g., `Resuelta`).

This rapid automated transition exposed a flaw in the `IncidentClosedEventHandler` and template logic:
1. The asset was not being re-evaluated for upward state propagation if it was already in its initial state (due to an early `return`).
2. Parent assets (e.g., `Carretera`) remained blocked in fault states if the exact template transitions (edges) did not allow a direct path from `Falla_Total` to the initial state (e.g., `Instalado_Activo`).

## Architectural Changes

### 1. `ChangeIncidentStateCommand`
- **`ForceTransition` Flag**: Added a boolean flag to bypass strict state machine transitions for automated events. This allows system-triggered actions (like closing an incident after tasks complete) to jump straight to a terminal state without manual step-by-step UI transitions.

### 2. `MaintenanceOrderCompletedEventHandler`
- **Dynamic Terminal State Resolution**: When a maintenance order is completed, the handler now scans the associated `IncidentTemplate`'s `LifecycleStates` to find a valid state where `IsTerminal == true`. It then uses `ChangeIncidentStateCommand` with `ForceTransition = true` to close the incident automatically.

### 3. `IncidentClosedEventHandler`
- **Mandatory Upward Propagation**: Removed the early return (`if (asset.State == initialState) return;`). The `AssetStateChangedEvent` is now **always published** when an incident reaches a terminal state, even if the asset itself is already in a healthy state.
- This forces the `ParentStatePropagationHandler` to re-evaluate the parent and grandparent assets (e.g., moving a parent from `Falla_Total` to `Instalado_Activo` if all children are now healthy), provided the template graph permits the transition.

## Required Configuration (Data Layer)
For the automated upward propagation to work seamlessly, the `Transitions` (edges) within the Asset Templates must support direct paths from failure states to healthy states (e.g., `Falla_Total` -> `Instalado_Activo`). If the graph restricts this (e.g., forcing a pass through `En_Reparacion`), the `ParentStatePropagationHandler` will correctly block the transition, and the hierarchy will not automatically heal.

## Out of Scope
- Altering the `ParentStatePropagationHandler` validation rules. The handler correctly enforces the strict transition graph designed by the user in the template builder.
