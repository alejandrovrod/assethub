# UI Contracts: Work Tasks Module

**Feature**: Work Tasks Module (M14)
**Date**: 2026-08-16

## Pages

### /maintenance/tasks

Main tasks page. Contains:
- Header with title, "New Task" button, and view toggle (List / Kanban).
- Filter bar: state dropdown, assignee dropdown, search input, due date range, and "Related to" filters.
- List view: table with columns Title, State, Due Date, Assignee, Asset, Priority.
- Kanban view: columns for each state with draggable cards showing title, due date, assignee, and priority.

### /maintenance/tasks/{id}

Task detail page (or drawer). Contains:
- Title and editable fields (description, due date, type, priority, assignee).
- State selector with allowed transitions.
- Related entity links (asset, incident, order, plan, recurrence).
- History timeline.
- Comments section with input.
- "Delete" action.

## Components

### WorkTaskFormSheet

Reusable form used for creating and editing tasks.

**Props**:
- `open`: boolean
- `onOpenChange`: (open: boolean) => void
- `prefill`: object with optional `assetId`, `incidentId`, `maintenanceOrderId`, `preventivePlanId`, `taskRecurrenceId`

**Fields**:
- Title (required)
- Description
- Due date (date picker)
- Task type (catalog select)
- Priority (catalog select)
- Related entity (read-only when prefill provided)
- Assignee (employee or team select)

### WorkTaskKanban

Board with columns `todo`, `in_progress`, `done`, `cancelled`. Cards are draggable between columns. Dropping a card triggers the state change endpoint.

### WorkTaskFilters

Collapsible filter panel with:
- State multi-select
- Assignee select
- Asset select
- Incident select
- Maintenance order select
- Preventive plan select
- Due date range
- Search input

### WorkTaskComments

Comment list + input form. Sorted newest first.

## Widgets

### Asset Tasks Widget

Displayed on asset detail page. Shows a compact list of open tasks for the asset with a "Create task" button.

### Incident Tasks Widget

Displayed on incident detail page. Shows a compact list of tasks related to the incident with a "Create task" button.
