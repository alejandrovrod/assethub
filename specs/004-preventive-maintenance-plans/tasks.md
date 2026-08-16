# Tasks: Preventive Maintenance Plans

**Input**: Design documents from `/specs/004-preventive-maintenance-plans/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Integration and validation tests are included because the success criteria require verifiable outcomes. They can be skipped if the team chooses an untested MVP.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add minimal configuration and directory scaffolding needed before any user story work begins.

- [x] T001 Add scheduler API key configuration in `asset-hub/src/backend/AssetHub.Api/appsettings.Development.json` and `appsettings.json`
- [x] T002 [P] Create empty frontend directories `asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/` and `asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/components/`
- [x] T003 [P] Create empty backend test directory `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data model, domain relocation, persistence, and shared commands that MUST be complete before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Move and extend `PreventivePlan` entity from `asset-hub/src/backend/AssetHub.Domain/Incidents/PreventivePlan.cs` to `asset-hub/src/backend/AssetHub.Domain/Maintenance/PreventivePlan.cs`
- [x] T005 [P] Create `PreventivePlanExecutionLog` entity in `asset-hub/src/backend/AssetHub.Domain/Maintenance/PreventivePlanExecutionLog.cs`
- [x] T006 [P] Create `Notification` entity in `asset-hub/src/backend/AssetHub.Domain/Notifications/Notification.cs`
- [x] T007 Add `PreventivePlanId` property to `WorkTask` in `asset-hub/src/backend/AssetHub.Domain/Tasks/WorkTask.cs`
- [x] T008 [P] Update `ITenantDbContext` in `asset-hub/src/backend/AssetHub.Application/Interfaces/ITenantDbContext.cs` to expose new `DbSet` properties
- [x] T009 [P] Update `TenantDbContext` in `asset-hub/src/backend/AssetHub.Infrastructure/Persistence/TenantDbContext.cs` with entity configuration and relationships
- [x] T010 Create EF Core migration for `PreventivePlan` extension, `PreventivePlanExecutionLog`, `Notification`, and `WorkTask.PreventivePlanId`
- [x] T011 Add shared constants/enums for `GeneratedEntityType` and execution statuses in `asset-hub/src/backend/AssetHub.Domain/Maintenance/PreventivePlanConstants.cs`

**Checkpoint**: Foundation ready - database schema supports all planned entities; user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Create and Execute a Preventive Plan (Priority: P1) 🎯 MVP

**Goal**: Users can create a recurring preventive plan for one asset or for all assets of a template, and the system automatically generates the configured work item(s) when the scheduled time arrives.

**Independent Test**: Follow quickstart Scenario 1 and Scenario 2: create a plan, set a near-future cron, trigger evaluation, and verify work items are created with correct due dates.

### Tests for User Story 1

- [x] T012 [P] [US1] Add integration test `CreatePreventivePlan_Returns201AndNextRunAt` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/CreatePreventivePlanTests.cs`
- [x] T013 [P] [US1] Add integration test `EvaluatePlan_ForSingleAsset_GeneratesWorkTask` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`
- [x] T014 [P] [US1] Add integration test `EvaluatePlan_ForTemplate_GeneratesOneWorkTaskPerAsset` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`

### Implementation for User Story 1

- [x] T015 [P] [US1] Implement `CreatePreventivePlanCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/CreatePreventivePlanCommand.cs`
- [x] T016 [P] [US1] Implement `UpdatePreventivePlanCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/UpdatePreventivePlanCommand.cs`
- [x] T017 [P] [US1] Implement `DeletePreventivePlanCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/DeletePreventivePlanCommand.cs`
- [x] T018 [P] [US1] Implement `GetPreventivePlansQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Queries/GetPreventivePlansQuery.cs`
- [x] T019 [P] [US1] Implement `GetPreventivePlanByIdQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Queries/GetPreventivePlanByIdQuery.cs`
- [x] T020 [US1] Implement `EvaluatePreventivePlansCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/EvaluatePreventivePlansCommand.cs` (process all due plans, single-asset + template targets, work task and/or maintenance order generation, advance `NextRunAt`)
- [x] T021 [P] [US1] Implement `EvaluatePreventivePlanCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/EvaluatePreventivePlanCommand.cs` (single-plan trigger for manual execution)
- [x] T022 [US1] Extend `PreventivePlansController` in `asset-hub/src/backend/AssetHub.Api/Controllers/PreventivePlansController.cs` with CRUD endpoints and evaluation endpoints
- [x] T023 [P] [US1] Create `preventive-plan.service.ts` in `asset-hub/src/frontend/apps/web/src/services/preventive-plan.service.ts`
- [x] T024 [P] [US1] Implement preventive plans list page `asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/index.tsx`
- [x] T025 [US1] Implement create/edit form sheet `asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/components/preventive-plan-form-sheet.tsx`
- [x] T026 [US1] Add scheduler API key middleware check for `POST /api/preventive-plans/evaluate-all` in `asset-hub/src/backend/AssetHub.Api/Program.cs` or an authorization policy

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Control Plan Scope and Conditions (Priority: P2)

**Goal**: Users can choose whether a plan generates a work task, a maintenance order, or both; define relative due dates; assign items automatically or manually; and skip generation when the target asset is in an excluded state.

**Independent Test**: Follow quickstart Scenario 3: configure a plan with excluded state `Obsoleta`, set the asset to that state, trigger evaluation, and verify skip record exists. Also verify `Both` generation and due date offset.

### Tests for User Story 2

- [x] T027 [P] [US2] Add integration test `EvaluatePlan_SkipsExcludedAssetState_AndLogsReason` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`
- [x] T028 [P] [US2] Add integration test `EvaluatePlan_GeneratesBothTaskAndOrder` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`
- [x] T029 [P] [US2] Add integration test `EvaluatePlan_SetsDueDateRelativeToExecution` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`

### Implementation for User Story 2

- [x] T030 [US2] Implement condition evaluation logic inside `EvaluatePreventivePlansCommand` handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/EvaluatePreventivePlansCommand.cs`
- [x] T031 [US2] Implement both `WorkTask` and `MaintenanceOrder` generation paths in `EvaluatePreventivePlansCommand` handler
- [x] T032 [US2] Implement assignment logic (auto vs manual, employee/team defaults) in `EvaluatePreventivePlansCommand` handler
- [x] T033 [P] [US2] Add condition rule JSON editor/pickers in `asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/components/preventive-plan-form-sheet.tsx`
- [x] T034 [P] [US2] Add entity type selector (WorkTask / MaintenanceOrder / Both) and assignment section in the form sheet

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently.

---

## Phase 5: User Story 3 - Monitor and Manage Plans (Priority: P2)

**Goal**: Users can view all preventive plans, see upcoming scheduled executions in a calendar view, review a complete execution log, and receive notifications when work items are generated.

**Independent Test**: Follow quickstart Scenario 4, 5, and 6: trigger evaluation twice, verify no duplicates; verify notification creation; pause and resume a plan and verify generation stops/starts.

### Tests for User Story 3

- [x] T035 [P] [US3] Add integration test `EvaluatePlan_IsIdempotent_ForSameOccurrence` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`
- [x] T036 [P] [US3] Add integration test `PausePlan_PreventsGeneration` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`
- [x] T037 [P] [US3] Add integration test `EvaluatePlan_CreatesNotification_ForAssignee` in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/EvaluatePreventivePlanTests.cs`

### Implementation for User Story 3

- [x] T038 [US3] Implement idempotency check using `PreventivePlanExecutionLog` in `EvaluatePreventivePlansCommand` handler
- [x] T039 [US3] Implement `PreventivePlanExecutedEvent` in `asset-hub/src/backend/AssetHub.Application/Maintenance/Events/PreventivePlanExecutedEvent.cs`
- [x] T040 [US3] Implement `NotifyOnPreventivePlanExecutionHandler` in `asset-hub/src/backend/AssetHub.Application/Notifications/EventHandlers/NotifyOnPreventivePlanExecutionHandler.cs`
- [x] T041 [P] [US3] Implement `CreateNotificationCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Notifications/Commands/CreateNotificationCommand.cs`
- [x] T042 [P] [US3] Implement `GetPreventivePlanExecutionLogsQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Queries/GetPreventivePlanExecutionLogsQuery.cs`
- [x] T043 [P] [US3] Implement `GetPreventivePlanNextOccurrencesQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Queries/GetPreventivePlanNextOccurrencesQuery.cs`
- [x] T044 [US3] Implement `TogglePreventivePlanActiveCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/TogglePreventivePlanActiveCommand.cs`
- [x] T045 [P] [US3] Add execution log UI component `asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/components/preventive-plan-execution-log.tsx`
- [x] T046 [P] [US3] Add calendar view component `asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/components/preventive-plan-calendar.tsx`
- [x] T047 [US3] Add preventive plans widget to asset detail page `asset-hub/src/frontend/apps/web/src/pages/assets/detail.tsx`
- [ ] T048 [US3] Add notification bell unread count indicator in the frontend shell/header (existing component to be identified)

**Checkpoint**: All user stories should now be independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and quality improvements that affect multiple user stories.

- [ ] T049 [P] Run quickstart scenarios from `specs/004-preventive-maintenance-plans/quickstart.md` against a local environment and fix any gaps
- [x] T050 [P] Add backend validation unit tests for cron parsing, target mutual exclusion, and condition rule format in `asset-hub/tests/backend/AssetHub.Api.Tests/PreventivePlans/PreventivePlanValidationTests.cs`
- [ ] T051 Document external cron setup and API key usage in `asset-hub/docs/preventive-plans-scheduler.md`
- [x] T052 Run `dotnet build` and `dotnet test` for the backend; run frontend typecheck with `tsc --noEmit`
- [ ] T053 Review and remove unused imports / dead code introduced during the feature

## Phase 7: Technical Debt / M4 Billing Integration

**Purpose**: Track cleanup work that depends on the future M4 (Payments & Subscriptions) module.

- [ ] T054 [P] Remove `PlanLimitsFilter` fallback for tenants without a plan (`PlanId == Guid.Empty`) once M4 assigns a default plan during signup and seeds real `Plan` records. File: `asset-hub/src/backend/AssetHub.Infrastructure/Billing/PlanLimitsFilter.cs`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 commands/queries but can be implemented incrementally once US1 endpoints exist
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 + US2 logic (execution log needs generation to exist)

### Within Each User Story

- Models before services
- Services before endpoints
- Core backend implementation before frontend
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks (T001-T003) can run in parallel.
- All Foundational model tasks (T004-T007) can run in parallel; context updates (T008-T011) can run after models are defined.
- Backend CRUD commands/queries for US1 (T015-T019) can be implemented in parallel.
- Frontend service and list page (T023-T024) can run in parallel with backend endpoints.
- US2 condition UI (T033) can be built in parallel with backend condition logic (T030) once the DTO shape is known.
- US3 notification handler (T040) can be implemented in parallel with execution log query (T042) and calendar UI (T046).

---

## Parallel Example: User Story 1

```bash
# Launch backend CRUD work in parallel:
Task: "Implement CreatePreventivePlanCommand in asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/CreatePreventivePlanCommand.cs"
Task: "Implement UpdatePreventivePlanCommand in asset-hub/src/backend/AssetHub.Application/Maintenance/Commands/UpdatePreventivePlanCommand.cs"
Task: "Implement GetPreventivePlansQuery in asset-hub/src/backend/AssetHub.Application/Maintenance/Queries/GetPreventivePlansQuery.cs"

# Launch frontend scaffolding in parallel:
Task: "Create preventive-plan.service.ts in asset-hub/src/frontend/apps/web/src/services/preventive-plan.service.ts"
Task: "Implement preventive plans list page in asset-hub/src/frontend/apps/web/src/pages/maintenance/preventive-plans/index.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently using quickstart Scenario 1 and Scenario 2
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (backend CRUD + frontend list/form)
   - Developer B: User Story 2 (conditions + assignment + due dates)
   - Developer C: User Story 3 (logs + calendar + notifications)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies.
- Each user story should be independently completable and testable.
- The `GeneratedEntityType` "Both" path should link the generated `WorkTask` and `MaintenanceOrder` via `WorkTask.MaintenanceOrderId` when both are created in the same execution.
- The scheduler endpoint must be protected by the configured API key; all other endpoints use the existing tenant-based authorization.
