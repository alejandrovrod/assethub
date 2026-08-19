# Implementation Plan: Maintenance Workflow Integration

**Branch**: `006-maintenance-workflow-integration` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-maintenance-workflow-integration/spec.md`

## Summary

Coordinate the lifecycle of `Asset`, `Incident`, `MaintenanceOrder`, `WorkTask`, and `PreventivePlan` through a standard maintenance workflow. Assets and incidents keep their template-driven state machines; orders, tasks, and preventive plans use a fixed, event-coordinated flow. The implementation adds bidirectional domain relationships, a centralized order state validator, cross-entity event handlers, and guards that prevent inconsistent transitions.

## Technical Context

- **Language/Version**: .NET 10 (backend), TypeScript/React (frontend)
- **Primary Dependencies**: ASP.NET Core, MediatR, Entity Framework Core, React Query, Tailwind CSS
- **Storage**: SQL Server (tenant databases via Aspire)
- **Testing**: xUnit + WebApplicationFactory for backend integration tests
- **Target Platform**: Web application (desktop browser)
- **Project Type**: Full-stack web application with separated backend/frontend
- **Performance Goals**: Cross-entity state transitions complete synchronously within the same HTTP request; no background processing required.
- **Constraints**: Multi-tenant; event handlers must avoid recursive loops; domain events are processed synchronously via MediatR.
- **Scale/Scope**: Company-wide asset management; workflows must remain consistent with thousands of related records per tenant.

## Constitution Check

The project's `.specify/memory/constitution.md` is currently a template with no ratified principles. No explicit gates apply beyond the repository's existing conventions:

- Follow the existing backend structure: `Application/`, `Domain/`, `Infrastructure/`, `Api/`.
- Keep the frontend in `src/frontend/apps/web/src/pages/` and `services/`.
- Reuse existing MediatR command/query patterns and EF Core entities.
- Add tests for new backend commands, validators, and event handlers.

**Gate result**: PASS. No constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-maintenance-workflow-integration/
├── spec.md              # Feature specification
├── plan.md              # This implementation plan
├── data-model.md        # Entity and relationship details
├── quickstart.md        # End-to-end validation guide
├── contracts/           # API and UI contracts
│   ├── api.md
│   └── ui.md
└── tasks.md             # Generated implementation tasks
```

### Source Code (repository root)

```text
asset-hub/src/backend/
├── AssetHub.Domain/
│   ├── Assets/Asset.cs                          (add inverse navigation collections)
│   ├── Incidents/Incident.cs                    (add inverse navigation collections)
│   ├── Incidents/IncidentStates.cs              (new constants)
│   ├── Maintenance/MaintenanceOrder.cs          (add WorkTasks collection)
│   ├── Maintenance/MaintenanceOrderStates.cs    (new constants)
│   ├── Maintenance/MaintenanceOrderKinds.cs       (new constants)
│   ├── Maintenance/PreventivePlan.cs             (add inverse navigation collections)
│   └── Tasks/WorkTaskStates.cs                   (new constants)
│
├── AssetHub.Application/
│   ├── Maintenance/Helpers/
│   │   ├── MaintenanceOrderStateTransitionValidator.cs
│   │   └── PreventivePlanExecutionGuard.cs
│   ├── Incidents/Helpers/
│   │   └── IncidentClosingGuard.cs
│   ├── Maintenance/Commands/
│   │   ├── StartMaintenanceOrderCommand.cs
│   │   ├── CompleteMaintenanceOrderCommand.cs
│   │   ├── CancelMaintenanceOrderCommand.cs
│   │   ├── ApproveMaintenanceOrderCommand.cs     (use validator + publish event)
│   │   ├── ScheduleMaintenanceOrderCommand.cs   (use validator + publish event)
│   │   ├── VerifyMaintenanceOrderCommand.cs       (use validator + publish event)
│   │   └── CreateMaintenanceOrderCommand.cs       (use constants)
│   ├── Maintenance/EventHandlers/
│   │   ├── MaintenanceOrderStartedEventHandler.cs
│   │   └── MaintenanceOrderVerifiedEventHandler.cs
│   ├── Incidents/EventHandlers/
│   │   └── IncidentAssignedEventHandler.cs
│   ├── Tasks/EventHandlers/
│   │   └── WorkTaskStateChangedEventHandler.cs
│   ├── Tasks/Commands/
│   │   └── CreateWorkTaskCommand.cs              (enforce single parent)
│   └── Incidents/Commands/
│       └── ChangeIncidentStateCommand.cs          (use constants + closing guard)
│
├── AssetHub.Infrastructure/
│   └── Persistence/TenantDbContext.cs           (configure inverse navigations + FKs)
│       └── Migrations/                            (add migration)
│
└── AssetHub.Api/
    └── Controllers/MaintenanceOrdersController.cs (add start/complete/cancel endpoints)

asset-hub/src/frontend/apps/web/src/
├── pages/assets/detail.tsx                        (show related incidents/orders/tasks/plans)
├── pages/maintenance/incident-detail.tsx          (show generated order + tasks)
├── pages/maintenance/orders/components/maintenance-order-detail.tsx (show child tasks)
├── pages/maintenance/preventive-plans/index.tsx   (show generated items)
├── pages/maintenance/components/work-task-detail.tsx (show parent links)
└── services/                                      (extend existing services)

asset-hub/tests/backend/AssetHub.Api.Tests/
├── MaintenanceOrders/
│   ├── MaintenanceOrderTestHelper.cs
│   ├── MaintenanceOrderStateTransitionTests.cs
│   └── MaintenanceWorkflowIntegrationTests.cs
└── WorkTasks/WorkTaskTestHelper.cs                (add FakeMediator)
```

## Implementation Strategy

### Backend

1. **Domain model** — add inverse navigation properties and state constants. Keep asset/incident lifecycles template-driven.
2. **State machines** — introduce `MaintenanceOrderStateTransitionValidator`; complete missing order transition commands.
3. **Events** — publish `IncidentAssignedEvent`, `MaintenanceOrderStartedEvent`, `MaintenanceOrderCompletedEvent`, `MaintenanceOrderVerifiedEvent`, `WorkTaskStateChangedEvent`, `IncidentClosedEvent`.
4. **Event handlers** — implement cross-entity coordination:
   - Incident assigned → create corrective order.
   - Order started → start child tasks.
   - Task done/cancelled → complete order if all terminal and at least one done.
   - Order verified → close linked incident.
5. **Guards** — `IncidentClosingGuard` and `PreventivePlanExecutionGuard` query related entities to reject invalid transitions.
6. **EF configuration** — configure inverse navigations and missing FKs; generate migration.
7. **API** — expose new order transition endpoints.

### Frontend

1. Extend detail widgets to show related entities and their states.
2. Disable the "close incident" action when guards would reject it.
3. Add progress indicators for order child tasks.
4. Link parent/child records across detail pages.

## Testing Strategy

- Unit-like integration tests for the `MaintenanceOrderStateTransitionValidator`.
- Integration tests for each event handler in isolation.
- End-to-end workflow tests: incident → order → tasks → verified → incident closed.
- Guard tests: preventive plan skips blocked assets; incident closure rejects active work.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Recursive event loops | Handlers perform direct state changes and publish only new, distinct events; no handler listens to its own output event. |
| In-memory EF tracking conflicts | Guards query fresh entity state; handlers load collections explicitly when needed. |
| Existing tests break due to constructor changes | Update test helpers and pass required dependencies (mediator, logger). |
| Resolved no longer terminal may affect existing flows | Document the change; `resolved` now leads to `closed` after verification, which matches the maintenance cycle. |
