# Feature Specification: Work Tasks Module

**Feature Branch**: `005-work-tasks-module`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Implementar el módulo de Tareas (M14) de AssetHub. El módulo debe permitir gestionar WorkTasks del tenant: listado con filtros y búsqueda, vista Kanban básica por estado, crear tareas manualmente, editar tareas, asignar empleado o equipo, cambiar estado con validación de transiciones, ver detalle con timeline de historial de estados, comentarios en tareas, y notificaciones de asignación/vencimiento. Las tareas deben estar integradas con activos, incidencias, órdenes de mantenimiento, planes preventivos y recurrencias de tareas: desde el listado se debe poder filtrar por estas entidades relacionadas, en el detalle se muestran links a las entidades vinculadas, desde la pantalla de activos se debe ver las tareas del activo, desde la pantalla de incidencias las tareas derivadas, y se debe poder crear tarea manual desde un activo o una incidencia. El backend es .NET 10 con EF Core, el frontend es React/TypeScript. Existen ya las entidades WorkTask, TaskStatusHistory, TaskComment, Notification y WorkTaskController con endpoints POST/PUT básicos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Work Tasks (Priority: P1)

As a maintenance manager or technician, I want to view, filter, search, and update work tasks so that I can track maintenance work across the organization.

**Why this priority**: Without a centralized task list, users cannot see what work is pending, who is assigned, or what is overdue. This is the core value of the module.

**Independent Test**: A user opens the Tasks page, sees a list of tasks, filters by state, searches by title, opens a task detail, and changes its state.

**Acceptance Scenarios**:

1. **Given** a tenant with existing work tasks, **When** a manager opens the Tasks page, **Then** the system displays a paginated list of tasks with title, state, assignee, due date, and related asset.
2. **Given** the task list, **When** the user filters by state `todo`, **Then** only tasks in `todo` state are displayed.
3. **Given** the task list, **When** the user types a search term, **Then** only tasks whose title or asset name contains the term are displayed.
4. **Given** a task in `todo` state, **When** the user changes the state to `in_progress`, **Then** the task is updated and a new entry is recorded in the task history.

---

### User Story 2 - Task Detail and Collaboration (Priority: P2)

As a technician, I want to view the full detail of a task, see its history of state changes, and add comments so that I can collaborate with my team and keep a record of progress.

**Why this priority**: Task history and comments are essential for traceability and coordination in maintenance operations.

**Independent Test**: A user opens a task detail, sees the history of state transitions, adds a comment, and sees the comment appear in the activity feed.

**Acceptance Scenarios**:

1. **Given** a task with previous state changes, **When** a user opens the task detail, **Then** the system shows the timeline of state changes with timestamps and users.
2. **Given** a task detail, **When** a user adds a comment, **Then** the comment is saved and displayed in the activity feed.
3. **Given** a task related to an asset, **When** a user views the task detail, **Then** the system shows a link to the asset page.

---

### User Story 3 - Create Tasks from Context (Priority: P2)

As a maintenance manager, I want to create tasks directly from an asset or an incident so that work can be scheduled without navigating to the Tasks page first.

**Why this priority**: Users naturally discover work while reviewing assets or incidents; removing friction increases adoption.

**Independent Test**: From an asset detail page, a user creates a new task. From an incident detail page, a user creates a task linked to that incident.

**Acceptance Scenarios**:

1. **Given** an asset detail page, **When** a user clicks "Create task", **Then** a task form opens with the asset pre-selected.
2. **Given** an incident detail page, **When** a user clicks "Create task", **Then** a task form opens with the incident pre-selected.
3. **Given** a task created from an asset, **When** the task is saved, **Then** the asset page shows the new task in its task list.

---

### User Story 4 - Assign and Notify (Priority: P2)

As a manager, I want to assign tasks to employees or teams and receive notifications when a task is assigned to me or is about to expire so that responsibilities are clear and deadlines are met.

**Why this priority**: Assignment and notifications ensure accountability and prevent tasks from being forgotten.

**Independent Test**: A manager assigns a task to an employee. The employee sees a notification. A task nearing its due date triggers a notification.

**Acceptance Scenarios**:

1. **Given** an unassigned task, **When** a manager assigns it to an employee, **Then** the employee receives an in-app notification.
2. **Given** a task due within 24 hours, **When** the system evaluates due tasks, **Then** the assigned user receives a reminder notification.
3. **Given** a task assigned to a team, **When** the task is saved, **Then** all team members see the task in their task lists.

---

### User Story 5 - Kanban View (Priority: P3)

As a technician, I want to see tasks grouped by state in a Kanban board so that I can quickly visualize workload and drag tasks to update their state.

**Why this priority**: Kanban improves visual management, though the list view is sufficient for the MVP.

**Independent Test**: A user switches to Kanban view and sees columns for each state. Moving a card to another column updates the task state.

**Acceptance Scenarios**:

1. **Given** the Tasks page, **When** a user switches to Kanban view, **Then** tasks are grouped into columns by state.
2. **Given** a task card in the `todo` column, **When** the user drags it to `in_progress`, **Then** the task state is updated and a history entry is recorded.

---

### Edge Cases

- What happens when a task is created without an asset, incident, order, plan, or recurrence? The task must be allowed as an independent task (`IsIndependent = true`).
- What happens when a task is assigned to a team but no employee? The task remains assigned to the team; any team member can take it.
- What happens when the user tries to change a task to an invalid state transition? The system rejects the change and shows an error.
- What happens when a task generated by a preventive plan is manually edited? Manual edits are allowed but do not affect the source plan.
- What happens when the related asset or incident is deleted? The task remains visible but shows the related entity as deleted or deactivated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to view a paginated list of work tasks for the current tenant.
- **FR-002**: The task list MUST support filtering by state, assignee, asset, incident, maintenance order, preventive plan, and due date range.
- **FR-003**: The task list MUST support searching by task title or related asset name.
- **FR-004**: Users MUST be able to switch between a list view and a Kanban view grouped by state.
- **FR-005**: Users MUST be able to create a work task manually from the Tasks page.
- **FR-006**: Users MUST be able to create a work task directly from an asset detail page or an incident detail page.
- **FR-007**: Users MUST be able to edit task title, description, due date, priority catalog item, task type catalog item, and related entities.
- **FR-008**: Users MUST be able to assign a task to an employee, a team, or leave it unassigned.
- **FR-009**: Users MUST be able to change a task state, and the system MUST validate the transition against allowed transitions.
- **FR-010**: The system MUST record every state change in a history log with timestamp and user.
- **FR-011**: Users MUST be able to view task detail including history, comments, and related entity links.
- **FR-012**: Users MUST be able to add comments to a task.
- **FR-013**: The system MUST send an in-app notification when a task is assigned to a user or team.
- **FR-014**: The system MUST send a reminder notification when a task is due within 24 hours.
- **FR-015**: The asset detail page MUST display a list of tasks related to that asset.
- **FR-016**: The incident detail page MUST display a list of tasks related to that incident.

### Key Entities *(include if feature involves data)*

- **WorkTask**: Represents a unit of work. Attributes: title, description, state, due date, asset reference, incident reference, maintenance order reference, preventive plan reference, task recurrence reference, assigned employee, assigned team, task type catalog item, priority catalog item, independence flag.
- **TaskStatusHistory**: Records every state change of a work task with timestamp and user.
- **TaskComment**: A text comment added by a user to a task, with timestamp.
- **Notification**: In-app alert sent to users on assignment or due date reminder.
- **Asset**: Physical or logical item to which a task can be linked.
- **Incident**: Maintenance issue from which a task can be derived.
- **MaintenanceOrder**: Formal work order that can group related tasks.
- **PreventivePlan**: Recurring plan that can generate tasks automatically.
- **TaskRecurrence**: Manual recurrence rule that can generate tasks.
- **Employee / Team**: Assignees of a task.
- **CatalogItem**: Used for task type and priority classification.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can find and open a task in under 30 seconds from the Tasks page.
- **SC-002**: 95% of state changes are recorded in the task history without missing transitions.
- **SC-003**: Users can create a task from an asset or incident page in under 1 minute.
- **SC-004**: Assignment notifications are delivered to the assigned user within 10 seconds.
- **SC-005**: Task list filters return results in under 2 seconds for up to 1,000 tasks.
- **SC-006**: Kanban view loads and groups tasks by state in under 2 seconds.
- **SC-007**: Comments and history are visible immediately after submission.

## Assumptions

- The existing `WorkTask`, `TaskStatusHistory`, `TaskComment`, and `Notification` entities are sufficient and will be extended as needed.
- Task type and priority catalog items will be created automatically if they do not exist, using the same default catalog approach established for preventive plans.
- In-app notifications are sufficient for the first release; email or push notifications are out of scope.
- State transitions for work tasks are `todo → in_progress → done` and `todo → cancelled`; additional transitions may be added later.
- File attachments for tasks are out of scope for this release; only text comments are included.
