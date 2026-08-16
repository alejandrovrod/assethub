# Feature Specification: Preventive Maintenance Plans

**Feature Branch**: `004-preventive-maintenance-plans`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Programación de tareas de mantenimiento preventivo y revisiones periódicas de activos en AssetHub. Los usuarios pueden crear planes preventivos asignados a un activo específico o a todos los activos de una plantilla. El plan usa una expresión cron para generar automáticamente WorkTask y/o MaintenanceOrder. Soporta asignación automática o manual, vencimiento relativo a la ejecución, condiciones basadas en el estado del activo, bitácora completa de ejecuciones, notificaciones/alertas y vista tipo calendario. El scheduler se dispara mediante un endpoint llamado por cron externo. El backend es .NET Aspire con EF Core, el frontend es React/TypeScript. Contexto: existen entidades Asset, AssetTemplate, PreventivePlan, WorkTask, MaintenanceOrder, TaskRecurrence, Employee, Team. La pantalla de tareas actualmente está vacía (Próximamente)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Execute a Preventive Plan (Priority: P1)

As a maintenance manager, I want to create a recurring preventive maintenance plan for one asset or for all assets that share a template so that the system automatically generates the required work items on schedule without manual intervention.

**Why this priority**: This is the core value of the feature. Without automatic generation, users must continue creating maintenance tasks manually, which is error-prone and does not scale.

**Independent Test**: A manager can create a plan with a cron expression, wait until the scheduled time (or trigger evaluation manually), and verify that the corresponding work item(s) are created for the target asset(s).

**Acceptance Scenarios**:

1. **Given** a single asset "Street Light 001", **When** a manager creates a plan that targets that asset with a cron expression, **Then** the system schedules the first execution and generates a work item for that asset when the scheduled time arrives.
2. **Given** an asset template "Vehicle" used by 10 assets, **When** a manager creates a plan that targets the template, **Then** the system generates one work item per active asset of that template when the scheduled time arrives.
3. **Given** a plan with a cron expression, **When** the scheduled time is reached, **Then** the system calculates the next occurrence and does not create duplicate work items if the same scheduled time is evaluated more than once.

---

### User Story 2 - Control Plan Scope and Conditions (Priority: P2)

As a maintenance manager, I want to define whether a plan generates a work task, a maintenance order, or both, and I want to skip generation when the target asset is in an excluded state so that generated work items are meaningful and aligned with current asset conditions.

**Why this priority**: Different maintenance activities require different workflows (simple task vs. formal work order), and generating work items for obsolete or decommissioned assets creates noise.

**Independent Test**: A manager can configure a plan to generate a maintenance order, mark the target asset as obsolete, trigger evaluation, and verify that no work item is created and that a skip reason is recorded.

**Acceptance Scenarios**:

1. **Given** a plan configured to generate a maintenance order, **When** the plan executes, **Then** a maintenance order is created instead of a work task.
2. **Given** a plan configured to generate both a work task and a maintenance order, **When** the plan executes, **Then** both items are created and linked to each other and to the source plan.
3. **Given** a plan with an excluded state "Obsolete", **When** the target asset is in that state at the scheduled time, **Then** no work item is generated and a skip record is stored.
4. **Given** a plan with a relative due date of 7 days, **When** a work item is generated, **Then** its due date is set to 7 days after the scheduled execution time.

---

### User Story 3 - Monitor and Manage Plans (Priority: P2)

As a maintenance manager, I want to view all preventive plans, see upcoming scheduled executions in a calendar view, review a complete execution log, and receive notifications when work items are generated so that I can track maintenance activity and take action on overdue items.

**Why this priority**: Visibility and traceability are required to operate a preventive maintenance program; without them users cannot verify that plans are running or diagnose missed occurrences.

**Independent Test**: A manager can open the preventive plans screen, see the next three scheduled dates for a plan, trigger an execution, and see a new log entry plus a notification.

**Acceptance Scenarios**:

1. **Given** an active plan with a cron expression, **When** a manager opens the calendar view, **Then** the next N scheduled occurrences are displayed.
2. **Given** a plan that has executed, **When** a manager opens the execution log, **Then** each execution shows the timestamp, generated work item, target asset, and status (success/skipped/failed).
3. **Given** a plan that generates a work item, **When** the generation completes, **Then** the assigned user or team receives a notification.
4. **Given** an active plan, **When** a manager pauses it, **Then** no new work items are generated until the plan is resumed.

---

### Edge Cases

- What happens when a plan targets a template that has no active assets? The execution should log a skip reason and not fail.
- What happens when the same scheduled occurrence is evaluated twice? The system must remain idempotent and create at most one work item per occurrence per target asset.
- What happens when a plan's cron expression produces an occurrence in the past while the system was down? The system should process the most recent missed occurrence or provide a configurable policy (e.g., skip missed, run once).
- What happens when the target asset is deleted after the plan is created? The plan should be deactivated or the execution should skip the deleted asset and log the reason.
- What happens when assignment is set to automatic but no default assignee is configured? The generated work item should be created unassigned and the execution log should note that automatic assignment was not possible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to create a preventive maintenance plan with a name, description, and a cron-based recurrence schedule.
- **FR-002**: A plan MUST target either a single asset or all active assets that belong to an asset template; it MUST NOT target both at the same time.
- **FR-003**: A plan MUST define the type of work item(s) it generates: a work task, a maintenance order, or both.
- **FR-004**: When a plan executes, the system MUST generate the configured work item(s) for each applicable target asset.
- **FR-005**: Each generated work item MUST be linked to the source plan and to the target asset.
- **FR-006**: The plan MUST support a relative due date expressed as a number of days after the scheduled execution time; this due date MUST be applied to every generated work item.
- **FR-007**: The plan MUST support optional assignment settings: manual assignment (leave unassigned), automatic assignment to a default employee, or automatic assignment to a default team.
- **FR-008**: The plan MUST support execution conditions based on the current state of the target asset, allowing users to define excluded states that prevent generation.
- **FR-009**: When an asset is in an excluded state at execution time, the system MUST skip generation for that asset and record a skip reason in the execution log.
- **FR-010**: After each execution, the system MUST update the plan's last execution time and compute the next scheduled occurrence from the cron expression.
- **FR-011**: The system MUST keep a complete execution log for every plan, including timestamp, target asset, status, generated work item identifier, and reason for skips or failures.
- **FR-012**: Users MUST be able to view all plans, edit them, pause/resume them, and delete them.
- **FR-013**: Users MUST be able to view the next scheduled occurrences of a plan in a calendar or list view.
- **FR-014**: Users MUST receive notifications when a plan successfully generates a work item for an asset they are responsible for.
- **FR-015**: The scheduler MUST be triggerable through an endpoint so that an external cron service can invoke it at the desired frequency.

### Key Entities *(include if feature involves data)*

- **PreventivePlan**: Represents the recurring schedule and rules for generating maintenance work items. It has a target (asset or template), a cron schedule, a generation type, assignment defaults, execution conditions, and a lifecycle (active/paused/deleted).
- **Asset**: The physical or logical item that may be the direct target of a plan or one of the items generated from a template-level plan.
- **AssetTemplate**: Defines a group of assets; a plan can target all active assets that use this template.
- **WorkTask**: A lightweight task generated by a plan when the configured output type includes tasks.
- **MaintenanceOrder**: A formal work order generated by a plan when the configured output type includes orders.
- **ExecutionLog**: A record of each plan execution attempt, capturing timestamp, target asset, status, generated work item, and messages.
- **Notification**: An alert sent to assigned users or teams when a plan generates a work item.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintenance manager can create a preventive plan in under 3 minutes.
- **SC-002**: 100% of scheduled occurrences generate the correct work item(s) for the target asset(s) when conditions are met.
- **SC-003**: No duplicate work items are created for the same scheduled occurrence and target asset, even if the scheduler endpoint is invoked multiple times.
- **SC-004**: 100% of executions are recorded in the execution log with a clear status and reason within 1 second of completion.
- **SC-005**: Users can view the next 12 scheduled occurrences for any active plan in under 2 seconds.
- **SC-006**: Notifications are delivered to assigned users within 10 seconds of a successful work item generation.
- **SC-007**: Execution skips caused by excluded asset states are logged and visible without requiring support intervention.

## Assumptions

- An external scheduler or cron service will invoke the system endpoint at the desired frequency; the system does not need to manage its own timer for the initial release.
- The existing asset hierarchy and state model are sufficient to evaluate execution conditions; no new asset states are required for this feature.
- Work tasks and maintenance orders already support the fields needed for assignment, due dates, and linkage to an asset.
- Users with permission to manage preventive plans have access to asset and template catalogs.
- A generated work task and maintenance order are independent workflows; the feature does not need to synchronize their states after generation.
- The first release will deliver notifications as in-app alerts; push notifications or email are out of scope.
