# Tasks: Maintenance Workflow Integration

**Input**: Design documents from `/specs/006-maintenance-workflow-integration/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, contracts/, quickstart.md

**Tests**: Integration tests are included because the success criteria require verifiable outcomes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Domain Model and State Constants

**Purpose**: Add inverse navigations and typed state constants so the workflow can be enforced.

- [x] T001 Add inverse navigation collections to `Asset` in `asset-hub/src/backend/AssetHub.Domain/Assets/Asset.cs`
- [x] T002 Add inverse navigation collections to `Incident` in `asset-hub/src/backend/AssetHub.Domain/Incidents/Incident.cs`
- [x] T003 Add `WorkTasks` collection to `MaintenanceOrder` in `asset-hub/src/backend/AssetHub.Domain/Maintenance/MaintenanceOrder.cs`
- [x] T004 Add inverse navigation collections to `PreventivePlan` in `asset-hub/src/backend/AssetHub.Domain/Maintenance/PreventivePlan.cs`
- [x] T005 Create `IncidentStates` constants in `asset-hub/src/backend/AssetHub.Domain/Incidents/IncidentStates.cs`
- [x] T006 Create `MaintenanceOrderStates` and `MaintenanceOrderKinds` constants in `asset-hub/src/backend/AssetHub.Domain/Maintenance/`
- [x] T007 Create `WorkTaskStates` constants in `asset-hub/src/backend/AssetHub.Domain/Tasks/WorkTaskStates.cs`
- [x] T008 Replace hardcoded state strings across existing handlers/queries with the new constants

**Checkpoint**: Domain model compiles; no behavior changes yet.

---

## Phase 2: Maintenance Order State Machine

**Purpose**: Centralize and complete the order state machine.

- [x] T009 Create `MaintenanceOrderStateTransitionValidator` in `asset-hub/src/backend/AssetHub.Application/Maintenance/Helpers/MaintenanceOrderStateTransitionValidator.cs`
- [x] T010 Create `StartMaintenanceOrderCommand` in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/StartMaintenanceOrderCommand.cs`
- [x] T011 Create `CompleteMaintenanceOrderCommand` in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/CompleteMaintenanceOrderCommand.cs`
- [x] T012 Create `CancelMaintenanceOrderCommand` in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/CancelMaintenanceOrderCommand.cs`
- [x] T013 Refactor `ApproveMaintenanceOrderCommand` to use the validator and publish `MaintenanceOrderApprovedEvent`
- [x] T014 Refactor `ScheduleMaintenanceOrderCommand` to use the validator and publish `MaintenanceOrderScheduledEvent`
- [x] T015 Refactor `VerifyMaintenanceOrderCommand` to use the validator and publish `MaintenanceOrderVerifiedEvent`

**Checkpoint**: All order transitions are validated by a single source of truth.

---

## Phase 3: Cross-Entity Events and Handlers

**Purpose**: Coordinate the maintenance workflow through domain events.

- [x] T016 Create `IncidentAssignedEvent` in `asset-hub/src/backend/AssetHub.Application/Incidents/Events/IncidentAssignedEvent.cs`
- [x] T017 Create `IncidentClosedEvent` in `asset-hub/src/backend/AssetHub.Application/Incidents/Events/IncidentClosedEvent.cs`
- [x] T018 Create maintenance-order lifecycle events in `asset-hub/src/backend/AssetHub.Application/Maintenance/Events/`
- [x] T019 Create `WorkTaskStateChangedEvent` in `asset-hub/src/backend/AssetHub.Application/Tasks/Events/WorkTaskStateChangedEvent.cs`
- [x] T020 Create `IncidentAssignedEventHandler` to generate a corrective order
- [x] T021 Create `MaintenanceOrderStartedEventHandler` to move child tasks to `in_progress`
- [x] T022 Create `WorkTaskStateChangedEventHandler` to complete the parent order when all tasks are terminal
- [x] T023 Create `MaintenanceOrderVerifiedEventHandler` to close the linked incident
- [x] T024 Publish events from `ChangeIncidentStateCommand`, `ChangeWorkTaskStateCommand`, and order transition commands

**Checkpoint**: Event-driven workflow is wired and compiles.

---

## Phase 4: Guards

**Purpose**: Prevent inconsistent cross-entity transitions.

- [x] T025 Create `IncidentClosingGuard` in `asset-hub/src/backend/AssetHub.Application/Incidents/Helpers/IncidentClosingGuard.cs`
- [x] T026 Integrate `IncidentClosingGuard` into `ChangeIncidentStateCommand`
- [x] T027 Create `PreventivePlanExecutionGuard` in `asset-hub/src/backend/AssetHub.Application/Maintenance/Helpers/PreventivePlanExecutionGuard.cs`
- [x] T028 Integrate `PreventivePlanExecutionGuard` into `EvaluatePreventivePlanCommand`
- [x] T029 Enforce single-parent rule in `CreateWorkTaskCommand`

**Checkpoint**: Guards block invalid transitions and plan executions.

---

## Phase 5: Persistence and Migration

**Purpose**: Materialize the relationships in the database.

- [x] T030 Configure inverse navigations in `TenantDbContext`
- [x] T031 Add missing FK configurations for `Incident.TypeId`, `Incident.PriorityId`, `PreventivePlan.DefaultAssignedEmployeeId`, `PreventivePlan.DefaultAssignedTeamId`
- [x] T032 Generate EF Core migration `LinkMaintenanceWorkflows`

**Checkpoint**: Migration is generated and reviewable.

---

## Phase 6: API Endpoints

**Purpose**: Allow clients to drive the full order lifecycle.

- [x] T033 Add `PATCH /api/v1/maintenance-orders/{id}/start` endpoint
- [x] T034 Add `PATCH /api/v1/maintenance-orders/{id}/complete` endpoint
- [x] T035 Add `PATCH /api/v1/maintenance-orders/{id}/cancel` endpoint

**Checkpoint**: All order transitions are reachable via API.

---

## Phase 7: Tests

**Purpose**: Verify the workflow and guard behavior.

- [x] T036 Add `MaintenanceOrderStateTransitionTests` covering allowed and denied transitions
- [x] T037 Add `MaintenanceWorkflowIntegrationTests` covering incident → order → tasks → closure
- [x] T038 Add preventive-plan guard test (skips asset with active incident)
- [x] T039 Update `WorkTaskTestHelper` with `FakeMediator`
- [x] T040 Update existing tests broken by constructor signature changes

**Checkpoint**: All backend integration tests pass.

---

## Phase 8: Frontend (Pending)

**Purpose**: Surface the integrated workflow in the UI.

- [ ] T041 Extend asset detail page to show active incidents, orders, tasks, and plans
- [ ] T042 Extend incident detail page to show generated corrective order and child tasks
- [ ] T043 Disable "close incident" action when guards reject it
- [ ] T044 Extend order detail page to show child tasks and progress
- [ ] T045 Enable order `Start`, `Complete`, and `Cancel` buttons with valid transition checks
- [ ] T046 Extend preventive plan detail page to show generated tasks/orders
- [ ] T047 Extend task detail page to show clickable parent link
- [ ] T048 Update Kanban to reflect parent-order completion after task drag

**Checkpoint**: Users can navigate and act across the integrated workflow from the UI.

---

## Phase 9: Documentation

**Purpose**: Keep specs aligned with implementation.

- [x] T049 Create `specs/006-maintenance-workflow-integration/spec.md`
- [x] T050 Create `specs/006-maintenance-workflow-integration/plan.md`
- [x] T051 Create `specs/006-maintenance-workflow-integration/data-model.md`
- [x] T052 Create `specs/006-maintenance-workflow-integration/contracts/api.md`
- [x] T053 Create `specs/006-maintenance-workflow-integration/contracts/ui.md`
- [x] T054 Create `specs/006-maintenance-workflow-integration/quickstart.md`
- [x] T055 Create `specs/006-maintenance-workflow-integration/diagrams/asset-incident-delegation.md`

**Checkpoint**: Feature is fully documented.

---

## Phase 10: Real Asset → Incident Delegation

**Purpose**: Replace the simulated incident creation in the asset detail page with a real report that locks the asset automatically.

- [x] T056 Add optional `TargetAssetState` to `ReportIncidentCommand` in `asset-hub/src/backend/AssetHub.Application/Incidents/Commands/ReportIncidentCommand.cs`
- [x] T057 Update `TryLockAssetForIncidentAsync` to honor `TargetAssetState` and validate reachability
- [x] T058 Add integration tests for asset-incident delegation in `asset-hub/tests/backend/AssetHub.Api.Tests/Incidents/ReportIncidentTests.cs`
- [x] T059 Extend `ReportIncidentSheet` to accept `assetId`, `hideAssetSelector`, `targetAssetState`, `title`, `description`, and `onSuccess`
- [x] T060 Update `ReportIncidentDto` in `asset-hub/src/frontend/apps/web/src/services/incident.service.ts` to include `targetAssetState`
- [x] T061 Replace the simulation placeholder in `asset-hub/src/frontend/apps/web/src/pages/assets/detail.tsx` with the real `ReportIncidentSheet`
- [ ] T062 Manually verify the full flow: asset detail → incidents state → create incident → asset locked → incident visible in widget

**Checkpoint**: Reporting an incident from the asset detail page creates a real incident, locks the asset, and refreshes the view.
