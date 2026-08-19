# Feature Specification: Maintenance Workflow Integration

**Feature Branch**: `006-maintenance-workflow-integration`

**Created**: 2026-08-18

**Status**: In Progress

**Input**: Unify the state-machine flows and relationships among assets, incidents, work tasks, maintenance orders, and preventive maintenance plans. Currently these entities evolve in isolation: an incident can close while its tasks/orders are still open, an order can be verified without finishing its tasks, and a preventive plan can generate work on an asset that is under an active incident. This specification defines the standard maintenance workflow that coordinates those machines.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Incident Drives Corrective Maintenance (Priority: P1)

As a maintenance manager, when I assign an incident I want the system to create a linked corrective maintenance order automatically so that no incident is handled informally.

**Why this priority**: Without a linked work order, incidents live outside the formal maintenance execution flow and cannot be tracked to completion.

**Independent Test**: A user reports and assigns an incident, then verifies that a corrective maintenance order in `draft` state appears in the incident detail.

**Acceptance Scenarios**:

1. **Given** an incident in `reported` state, **When** the user transitions it to `assigned`, **Then** the system creates a corrective `MaintenanceOrder` in `draft` linked to the incident and asset.
2. **Given** an incident that already has a corrective order, **When** it is reassigned to `assigned`, **Then** the system does not create a duplicate order.
3. **Given** the generated corrective order, **When** the user views the incident detail, **Then** the order is listed with its current state.

---

### User Story 2 - Order Progression Drives Tasks (Priority: P1)

As a technician, I want the tasks of a maintenance order to move to `in_progress` when the order starts, and I want the order to complete when all its tasks are done so that work is coordinated automatically.

**Why this priority**: Manually keeping order and task states in sync is error-prone and creates mismatched reporting.

**Independent Test**: A user creates tasks under an order, starts the order, completes the tasks, and observes the order move to `done` automatically.

**Acceptance Scenarios**:

1. **Given** an order in `scheduled` state with one or more tasks in `todo`, **When** the order is started, **Then** all child tasks move to `in_progress`.
2. **Given** an order in `in_progress` with two tasks, **When** one task is cancelled and the other is marked `done`, **Then** the order moves to `done`.
3. **Given** an order in `in_progress` with one task, **When** the task is cancelled, **Then** the order does **not** move to `done` (no task reached `done`).

---

### User Story 3 - Verified Order Closes Incident (Priority: P1)

As a maintenance manager, I want a verified corrective order to close its originating incident and release the asset so that the maintenance cycle is closed cleanly.

**Why this priority**: Verification is the final control gate; closing the incident at that moment guarantees traceability.

**Independent Test**: A user verifies a corrective order and observes the incident move to `closed`.

**Acceptance Scenarios**:

1. **Given** a corrective order linked to an incident, **When** the order is verified, **Then** the incident transitions to `closed` and records a closure lifecycle event.
2. **Given** a preventive order with no incident, **When** it is verified, **Then** no incident is closed.

---

### User Story 4 - Preventive Plans Respect Active Work (Priority: P2)

As a maintenance manager, I want preventive plans to skip generation when an asset is under an active incident or an open/unverified order so that we do not generate duplicate or conflicting work.

**Why this priority**: Generating preventive tasks while an asset is already being repaired creates noise and can mislead technicians.

**Independent Test**: A user triggers a preventive plan for an asset with an active incident and sees a skip log instead of a new task/order.

**Acceptance Scenarios**:

1. **Given** an asset with an incident in `assigned` state, **When** a preventive plan targeting that asset is evaluated, **Then** no work item is generated and a skip log records the reason.
2. **Given** an asset with an order in `in_progress`, **When** a preventive plan targeting that asset is evaluated, **Then** no work item is generated and a skip log records the reason.
3. **Given** an asset with a verified order but no active incident, **When** a preventive plan is evaluated, **Then** work items are generated normally.

---

### User Story 5 - Closure Consistency Guards (Priority: P2)

As a maintenance manager, I want the system to reject inconsistent transitions (e.g. closing an incident with open work) so that the state-machine contract is enforced across entities.

**Why this priority**: Without cross-entity guards, users can accidentally leave orphaned work or close incidents prematurely.

**Independent Test**: A user tries to close an incident that still has a `draft` order and receives a clear error.

**Acceptance Scenarios**:

1. **Given** an incident with a related order in `draft`, `approved`, `scheduled`, or `in_progress`, **When** the user tries to close the incident, **Then** the system rejects the transition with an error message.
2. **Given** an incident with a related task in `todo` or `in_progress`, **When** the user tries to close the incident, **Then** the system rejects the transition.
3. **Given** an incident whose related orders are `verified` or `cancelled` and whose tasks are terminal, **When** the user closes the incident, **Then** the transition succeeds.

---

### User Story 6 - Bidirectional Visibility in UI (Priority: P2)

As a technician, I want to see related work across entity detail pages so that I understand context without switching screens.

**Why this priority**: Bidirectional links reduce navigation friction and prevent users from losing context.

**Independent Test**: A user opens asset, incident, order, plan, and task detail pages and navigates between related records.

**Acceptance Scenarios**:

1. **Given** an asset detail page, **When** the asset has active incidents, open orders, or pending tasks, **Then** those items are listed with state and a link to their detail.
2. **Given** an incident detail page, **When** a corrective order was generated, **Then** the order is shown with its state and a link.
3. **Given** a maintenance order detail page, **When** the order has child tasks, **Then** the tasks are listed with their states.
4. **Given** a preventive plan detail page, **When** the plan has generated tasks or orders, **Then** those items are listed.
5. **Given** a task detail page, **When** the task belongs to an order, incident, or plan, **Then** the parent is shown as a clickable link.

## Edge Cases

- What happens when an incident is assigned but its asset is deleted? The order is still created; soft-delete checks are handled by existing query filters.
- What happens when all child tasks are cancelled? The order must remain open; a terminal state requires at least one task to have reached `done`.
- What happens when a preventive plan targets a template and some assets are blocked while others are not? The evaluation skips blocked assets individually and generates work for the rest.
- What happens when a user manually moves an order to `done` without finishing tasks? The transition is allowed by the state machine, but the automated `done` transition still fires only when the last task reaches `done`.
- What happens when `resolved` is selected for an incident? It is no longer a terminal state; the incident can still move to `closed` after order verification.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an incident transitions to `assigned`, the system MUST create one corrective `MaintenanceOrder` in `draft` for that incident if none exists.
- **FR-002**: The generated corrective order MUST reference the incident, the asset, and have `Kind = corrective`.
- **FR-003**: When a maintenance order transitions to `in_progress`, all its non-terminal child tasks in `todo` MUST transition to `in_progress` automatically.
- **FR-004**: When every non-deleted child task of an `in_progress` order is in a terminal state and at least one is `done`, the order MUST transition to `done` automatically.
- **FR-005**: When a corrective order is verified, its linked incident MUST transition to `closed` automatically.
- **FR-005b**: When a maintenance order transitions to `done` automatically, its linked incident MUST transition to `resolved` automatically (if custom lifecycle rules permit).
- **FR-006**: A `MaintenanceOrder` state machine MUST enforce the transitions: `draft → approved → scheduled → in_progress → done → verified`, with `cancelled` allowed from `draft`, `approved`, `scheduled`, and `in_progress`.
- **FR-007**: The system MUST prevent closing an incident while it has related orders in active states (`draft`, `approved`, `scheduled`, `in_progress`) or related tasks in non-terminal states.
- **FR-008**: A preventive plan evaluation MUST skip an asset if the asset has an active incident or an order that is not `verified` or `cancelled`.
- **FR-009**: Skipped preventive-plan executions MUST be recorded in `PreventivePlanExecutionLog` with status `skipped` and a descriptive reason.
- **FR-010**: Work tasks MUST be linked to at most one parent entity among `Asset`, `Incident`, `MaintenanceOrder`, `PreventivePlan`, or `TaskRecurrence`.
- **FR-011**: API consumers MUST be able to start, complete, and cancel a maintenance order via dedicated endpoints.
- **FR-012**: Entity detail pages MUST display bidirectional related-entity links.
- **FR-013**: The incident detail view MUST NOT display an attachments upload widget directly on the main summary (it is handled in tasks).
- **FR-014**: Work task editing MUST occur inline within the task detail panel rather than a separate modal, and the parent maintenance order title MUST be displayed in the task's Related Entities section.
- **FR-015**: Work tasks MUST support URL deep-linking (via `?selected=taskId`) to allow direct navigation to a specific task's detail panel.

### Key Entities *(include if feature involves data)*

- **Asset**: Parent of incidents, orders, tasks, and plans. Its lifecycle remains template-driven.
- **Incident**: Now owns collections of `MaintenanceOrders` and `WorkTasks`; closure is guarded by related work.
- **MaintenanceOrder**: Now owns a collection of `WorkTasks`; its state machine is centralized and fully enforced.
- **WorkTask**: Now mutually exclusive parent links; state changes can propagate to the parent order.
- **PreventivePlan**: Now owns collections of generated `WorkTasks` and `MaintenanceOrders`; evaluation is guarded by active work on the asset.
- **AssetTemplate / IncidentTemplate**: Keep their dynamic lifecycle configuration; no change to their machine model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of incidents moved to `assigned` generate a corrective order within the same request.
- **SC-002**: 0 inconsistent closure transitions are accepted (incident closed with active orders or open tasks).
- **SC-003**: Preventive plans never generate work for assets with active incidents or unverified orders in integration tests.
- **SC-004**: Order state reflects child-task completion in under 1 second after the last task reaches `done`.
- **SC-005**: Backend integration tests cover all cross-entity transitions with ≥ 90% assertion density.

## Assumptions

- Asset and incident lifecycles remain template-driven; this feature only coordinates the fixed maintenance workflow around them.
- `resolved` is an intermediate incident state; only `closed` and `cancelled` are terminal.
- The frontend detail widgets reuse existing list and form components; no new module-level pages are required.
- Notifications for automated transitions are out of scope for this release; only state changes and lifecycle events are recorded.
