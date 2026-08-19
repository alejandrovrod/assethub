# Asset → Incident Delegation State Machine

Real flow triggered when a user transitions an asset to a state whose `AssociatedModule` is `"incidents"`.

```mermaid
stateDiagram-v2
    direction TB

    %% Asset lifecycle (template-driven)
    state "Asset" as asset {
        [*] --> Activo : template initial
        Activo --> EnReparacion : incident reported
        Activo --> FueraDeServicio : incident reported (total loss)
        EnReparacion --> Activo : incident closed / order verified
        FueraDeServicio --> Activo : incident closed
    }

    %% Incident lifecycle
    state "Incident" as incident {
        [*] --> reported
        reported --> assigned
        assigned --> in_progress
        in_progress --> resolved
        resolved --> closed

        reported --> cancelled
        assigned --> cancelled
        in_progress --> cancelled
        resolved --> cancelled
    }

    %% Maintenance order lifecycle
    state "MaintenanceOrder" as order {
        [*] --> draft : incident assigned
        draft --> approved
        approved --> scheduled
        scheduled --> in_progress : start
        in_progress --> done : all tasks done
        done --> verified

        draft --> cancelled
        approved --> cancelled
        scheduled --> cancelled
        in_progress --> cancelled
    }

    %% Work task lifecycle
    state "WorkTask" as task {
        [*] --> todo
        todo --> in_progress : order started
        in_progress --> done

        todo --> cancelled
        in_progress --> cancelled
    }

    %% Asset state change from UI (delegation)
    Activo --> reported : user reports incident

    %% Cross-entity coordination
    reported --> draft : auto-creates corrective order
    in_progress --> todo : starts child tasks
    done --> done : auto-completes parent order
    verified --> closed : auto-closes incident
    closed --> Activo : releases asset

    note right of asset
        Template-driven lifecycle.
        States with AssociatedModule == "incidents"
        trigger the real incident creation flow.
    end note

    note right of incident
        resolved is no longer terminal;
        only closed and cancelled are terminal
    end note

    note right of order
        Centralized validator enforces
        all transitions
    end note
```

## Trigger condition

A transition from the asset detail page is considered an **incident delegation** when:

```ts
const nextStateConfig = lifecycle.states?.[nextState]
if (nextStateConfig.associatedModule === 'incidents') {
  // Open ReportIncidentSheet with assetId preselected
}
```

## Request contract

```http
POST /api/v1/incidents
Content-Type: application/json

{
  "assetId": "uuid",
  "title": "string",
  "incidentTemplateId": "uuid",
  "typeId": "uuid",
  "priorityId": "uuid?",
  "description": "string?",
  "targetAssetState": "string?"
}
```

- `targetAssetState` is optional. When provided, the backend attempts to transition the asset to that exact state.
- When absent, the backend chooses the first reachable state with `AssociatedModule == "incidents"`.

## Backend behavior

1. Validate the asset exists.
2. Create the incident with state from the incident template (or `"reported"`).
3. Create an `IncidentLifecycleEvent` for the initial state.
4. Call `TryLockAssetForIncidentAsync` to transition the asset to the locked state.
5. Create an `AssetLifecycleEvent` for the asset state change.
6. Return the incident id.
