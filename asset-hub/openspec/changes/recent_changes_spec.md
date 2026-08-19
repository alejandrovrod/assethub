# Recent Changes Spec

## 1. Task UI Improvements (UX/UI)
- **Detail Panel**:
  - Made the task title editable directly inside the detail panel.
  - Moved the **Related Entities** section (Maintenance Order, Incident, Asset) to the top of the detail panel (`CardHeader`) so it remains constantly visible across all tabs (Detail, History, Comments).
- **Edit Modal Refactor**:
  - Removed the redundancy of having both a detail panel and an edit modal for tasks.
  - The `WorkTaskFormSheet` is now strictly used for **creating** new tasks.
  - Editing is done purely within the right-side `WorkTaskDetail` panel.
- **Routing & Deep-linking**:
  - Updated the Maintenance Order tasks widget so clicking a task correctly navigates to `/maintenance/tasks?selected={taskId}` instead of just `/maintenance/tasks`.

## 2. Backend DTO Adjustments
- Added `MaintenanceOrderId` and `MaintenanceOrderTitle` to `WorkTaskSummaryDto`.
- Mapped `MaintenanceOrder.Title` in `GetWorkTasksQuery` so the frontend can correctly display the order name instead of its raw UUID in the task details.

## 3. Incident UI Cleanup
- **Incident Detail View**:
  - Completely removed the "Attachments" (Adjuntos) widget, including the file upload logic, as requested.

## 4. State Machine Automation
- **Maintenance Order to Incident Cascading**:
  - Implemented `MaintenanceOrderCompletedEventHandler`.
  - When the final task of a Maintenance Order is completed, the system automatically marks the Order as `Done`.
  - The new event handler captures this order completion and automatically issues a `ChangeIncidentStateCommand` to transition the parent Incident to `resolved` (Resuelta).
  - Included a fallback to swallow exceptions and log warnings in case custom lifecycle rules strictly forbid the transition.
