# Tasks: Work Tasks Module

**Input**: Design documents from `/specs/005-work-tasks-module/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Integration tests are included because the success criteria require verifiable outcomes.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add minimal structure and configuration needed before user story work begins.

- [x] T001 Create feature directory `specs/005-work-tasks-module/` and design documents (spec, plan, research, data-model, contracts, quickstart)
- [x] T002 [P] Create backend test directory `tests/backend/AssetHub.Api.Tests/WorkTasks/`
- [x] T003 [P] Create frontend task page directory `asset-hub/src/frontend/apps/web/src/pages/tasks/` and `components/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core DTOs, queries, and shared commands that MUST be complete before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Extend `WorkTaskDto` in `asset-hub/src/backend/AssetHub.Application/Tasks/Dtos/WorkTaskDto.cs` to include related entity names, assignee names, and priority label
- [x] T005 Create `WorkTaskSummaryDto` in `asset-hub/src/backend/AssetHub.Application/Tasks/Dtos/WorkTaskSummaryDto.cs` for list responses
- [x] T006 Create `TaskStateTransitionValidator` helper in `asset-hub/src/backend/AssetHub.Application/Tasks/Helpers/TaskStateTransitionValidator.cs` with allowed transitions
- [x] T007 Create `TaskCatalogDefaults` helper in `asset-hub/src/backend/AssetHub.Application/Tasks/Helpers/TaskCatalogDefaults.cs` to ensure tasktype/priority catalog items exist (reuse `PreventivePlanCatalogDefaults` pattern if applicable)
- [x] T008 Update `ITenantDbContext` in `asset-hub/src/backend/AssetHub.Application/Interfaces/ITenantDbContext.cs` to ensure `TaskComments` and `Notifications` DbSets are exposed (if not already)
- [ ] T009 Ensure `TenantDbContext` in `asset-hub/src/backend/AssetHub.Infrastructure/Persistence/TenantDbContext.cs` has correct entity configuration for `WorkTask`, `TaskStatusHistory`, and `TaskComment`

**Checkpoint**: Foundation ready — backend can read/write tasks, history, and comments; frontend directories exist.

---

## Phase 3: User Story 1 - Manage Work Tasks (Priority: P1) 🎯 MVP

**Goal**: Users can view, filter, search, and update work tasks.

**Independent Test**: Follow quickstart Scenario 1 and Scenario 2: execute a preventive plan, open the Tasks page, verify the generated task appears, filter by state, and change its state.

### Tests for User Story 1

- [ ] T010 [P] [US1] Add integration test `GetWorkTasks_ReturnsGeneratedTask` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/GetWorkTasksTests.cs`
- [ ] T011 [P] [US1] Add integration test `ChangeWorkTaskState_FollowsAllowedTransitions` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/ChangeWorkTaskStateTests.cs`
- [ ] T012 [P] [US1] Add integration test `ChangeWorkTaskState_RejectsInvalidTransition` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/ChangeWorkTaskStateTests.cs`

### Implementation for User Story 1

- [ ] T013 [US1] Implement `GetWorkTasksQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Queries/GetWorkTasksQuery.cs` with filtering, search, and pagination
- [ ] T014 [US1] Implement `GetWorkTaskByIdQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Queries/GetWorkTaskByIdQuery.cs`
- [ ] T015 [US1] Extend `ChangeWorkTaskStateCommand` handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Commands/ChangeWorkTaskStateCommand.cs` to validate transitions and record history
- [ ] T016 [US1] Extend `WorkTasksController` in `asset-hub/src/backend/AssetHub.Api/Controllers/WorkTasksController.cs` with GET list and GET by id endpoints
- [ ] T017 [US1] Create `work-task.service.ts` in `asset-hub/src/frontend/apps/web/src/services/work-task.service.ts`
- [ ] T018 [US1] Implement tasks list page in `asset-hub/src/frontend/apps/web/src/pages/tasks/index.tsx` with table, filters, search, and state badges
- [ ] T019 [US1] Implement task detail drawer in `asset-hub/src/frontend/apps/web/src/pages/tasks/detail.tsx` with state selector and allowed transitions
- [ ] T020 [US1] Add state transition toast error handling in the frontend service and detail page

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Task Detail and Collaboration (Priority: P2)

**Goal**: Users can view task history, add comments, and see related entity links.

**Independent Test**: Follow quickstart Scenario 3 and Scenario 4: open a task, verify history entries, add a comment, and confirm it appears.

### Tests for User Story 2

- [ ] T021 [P] [US2] Add integration test `GetWorkTaskHistory_ReturnsStateTransitions` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/GetWorkTaskHistoryTests.cs`
- [ ] T022 [P] [US2] Add integration test `AddTaskComment_CreatesComment` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/AddTaskCommentTests.cs`

### Implementation for User Story 2

- [ ] T023 [US2] Implement `GetWorkTaskHistoryQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Queries/GetWorkTaskHistoryQuery.cs`
- [ ] T024 [US2] Implement `GetWorkTaskCommentsQuery` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Queries/GetWorkTaskCommentsQuery.cs`
- [ ] T025 [US2] Implement `AddTaskCommentCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Commands/AddTaskCommentCommand.cs`
- [ ] T026 [US2] Extend `WorkTasksController` in `asset-hub/src/backend/AssetHub.Api/Controllers/WorkTasksController.cs` with GET history, GET comments, and POST comments endpoints
- [ ] T027 [US2] Add history timeline component in `asset-hub/src/frontend/apps/web/src/pages/tasks/components/work-task-history.tsx`
- [ ] T028 [US2] Add comments component in `asset-hub/src/frontend/apps/web/src/pages/tasks/components/work-task-comments.tsx`
- [ ] T029 [US2] Extend task detail page in `asset-hub/src/frontend/apps/web/src/pages/tasks/detail.tsx` to display related entity links, history, and comments

**Checkpoint**: User Stories 1 AND 2 should both work independently.

---

## Phase 5: User Story 3 - Create Tasks from Context (Priority: P2)

**Goal**: Users can create tasks directly from assets, incidents, and the Tasks page.

**Independent Test**: Follow quickstart Scenario 5 and Scenario 6: create a task from an asset page and from an incident page, verify the relationship is saved and visible in the related widgets.

### Tests for User Story 3

- [ ] T030 [P] [US3] Add integration test `CreateWorkTask_FromAsset_SetsAssetId` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/CreateWorkTaskTests.cs`
- [ ] T031 [P] [US3] Add integration test `CreateWorkTask_FromIncident_SetsIncidentId` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/CreateWorkTaskTests.cs`
- [ ] T032 [P] [US3] Add integration test `GetWorkTasks_ByAssetId_ReturnsRelatedTasks` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/GetWorkTasksTests.cs`

### Implementation for User Story 3

- [ ] T033 [US3] Extend `CreateWorkTaskCommand` handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Commands/CreateWorkTaskCommand.cs` to support all optional related entity IDs and set `IsIndependent`
- [ ] T034 [US3] Implement `UpdateWorkTaskCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Commands/UpdateWorkTaskCommand.cs`
- [ ] T035 [US3] Implement `DeleteWorkTaskCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Commands/DeleteWorkTaskCommand.cs` (soft delete)
- [ ] T036 [US3] Extend `WorkTasksController` in `asset-hub/src/backend/AssetHub.Api/Controllers/WorkTasksController.cs` with PUT update and DELETE endpoints
- [ ] T037 [US3] Create reusable `WorkTaskFormSheet` in `asset-hub/src/frontend/apps/web/src/pages/tasks/components/work-task-form-sheet.tsx` with prefill support
- [ ] T038 [US3] Add "Create task" button and widget to asset detail page in `asset-hub/src/frontend/apps/web/src/pages/assets/detail.tsx`
- [ ] T039 [US3] Add "Create task" button and widget to incident detail page in `asset-hub/src/frontend/apps/web/src/pages/maintenance/incident-detail.tsx`
- [ ] T040 [US3] Add "New Task" button to the tasks list page in `asset-hub/src/frontend/apps/web/src/pages/tasks/index.tsx`

**Checkpoint**: User Stories 1, 2, AND 3 should all work independently.

---

## Phase 6: User Story 4 - Assign and Notify (Priority: P2)

**Goal**: Users can assign tasks and receive notifications on assignment and due-date reminders.

**Independent Test**: Follow quickstart Scenario 3: assign a task to an employee and verify the notification. Verify due-date reminder behavior by creating a task due within 24 hours.

### Tests for User Story 4

- [ ] T041 [P] [US4] Add integration test `AssignWorkTask_SendsNotification` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/AssignWorkTaskTests.cs`
- [ ] T042 [P] [US4] Add integration test `EvaluateDueTasks_SendsReminderNotification` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/EvaluateDueTasksTests.cs`

### Implementation for User Story 4

- [ ] T043 [US4] Extend `AssignWorkTaskCommand` handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Commands/AssignWorkTaskCommand.cs` to send a notification when assignment changes
- [ ] T044 [US4] Create `EvaluateDueWorkTasksCommand` and handler in `asset-hub/src/backend/AssetHub.Application/Tasks/Commands/EvaluateDueWorkTasksCommand.cs` to send reminder notifications for tasks due within 24 hours
- [ ] T045 [US4] Add `POST /api/v1/work-tasks/evaluate-due` endpoint in `asset-hub/src/backend/AssetHub.Api/Controllers/WorkTasksController.cs` for cron invocation
- [ ] T046 [US4] Create `NotifyTaskAssignedEventHandler` in `asset-hub/src/backend/AssetHub.Application/Tasks/EventHandlers/NotifyTaskAssignedEventHandler.cs` (or inline in command)
- [ ] T047 [US4] Add assignee selector (employee/team) to `WorkTaskFormSheet` in `asset-hub/src/frontend/apps/web/src/pages/tasks/components/work-task-form-sheet.tsx`
- [ ] T048 [US4] Add assignment field to task detail page in `asset-hub/src/frontend/apps/web/src/pages/tasks/detail.tsx`
- [ ] T049 [US4] Add notification bell unread count indicator in the frontend shell/header (identify existing component; if absent, create in `asset-hub/src/frontend/apps/web/src/components/layout/`)

**Checkpoint**: All user stories up to US4 should be independently functional.

---

## Phase 7: User Story 5 - Kanban View (Priority: P3)

**Goal**: Users can view and update tasks in a Kanban board.

**Independent Test**: Follow quickstart Scenario 7: switch to Kanban view, drag a task to another column, and verify state change.

### Tests for User Story 5

- [ ] T050 [P] [US5] Add integration test `KanbanStateChange_UpdatesTaskState` in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/ChangeWorkTaskStateTests.cs`

### Implementation for User Story 5

- [ ] T051 [US5] Create `WorkTaskKanban` component in `asset-hub/src/frontend/apps/web/src/pages/tasks/components/work-task-kanban.tsx`
- [ ] T052 [US5] Add list/kanban toggle to tasks page in `asset-hub/src/frontend/apps/web/src/pages/tasks/index.tsx`
- [ ] T053 [US5] Implement drag-and-drop state change using existing `ChangeWorkTaskStateCommand` endpoint

**Checkpoint**: All five user stories should be independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and quality improvements that affect multiple user stories.

- [ ] T054 [P] Run quickstart scenarios from `specs/005-work-tasks-module/quickstart.md` against a local environment and fix any gaps
- [ ] T055 [P] Add backend validation unit tests for state transitions and task independence in `asset-hub/tests/backend/AssetHub.Api.Tests/WorkTasks/WorkTaskValidationTests.cs`
- [ ] T056 [P] Run `dotnet build` and `dotnet test` for the backend; run frontend typecheck if possible
- [ ] T057 Review and remove unused imports / dead code introduced during the feature
- [ ] T058 Document task module in `asset-hub/docs/work-tasks.md` with API summary and usage notes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4 → P5)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 endpoints but can be implemented incrementally once list/detail exist
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Builds on US1/2 but mainly reuses form/detail components
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Requires US3 assignment form fields and notification infrastructure
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Requires US1 list and US3 state-change endpoint

### Within Each User Story

- Models before services
- Services before endpoints
- Core backend implementation before frontend
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks (T002-T003) can run in parallel.
- All Foundational tasks (T004-T009) can run in parallel.
- Backend queries and frontend list page for US1 can run in parallel.
- History and comments backend/frontend for US2 can run in parallel.
- Asset widget and incident widget for US3 can run in parallel.
- Notification handler and due-task evaluation for US4 can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Launch backend queries and frontend list in parallel:
Task: "Implement GetWorkTasksQuery in asset-hub/src/backend/AssetHub.Application/Tasks/Queries/GetWorkTasksQuery.cs"
Task: "Create work-task.service.ts in asset-hub/src/frontend/apps/web/src/services/work-task.service.ts"
Task: "Implement tasks list page in asset-hub/src/frontend/apps/web/src/pages/tasks/index.tsx"
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
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Story 5 → Test independently → Deploy/Demo

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (list + detail + state change)
   - Developer B: User Story 2 (history + comments) and User Story 4 (assignment + notifications)
   - Developer C: User Story 3 (create from context + widgets) and User Story 5 (Kanban)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies.
- Each user story should be independently completable and testable.
- The existing `WorkTask` entity already supports most relationships; this plan focuses on exposing them through queries and UI.
- Soft-delete for tasks is implemented via `IsDeleted` flag on `WorkTask`.
