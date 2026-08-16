# API Contracts: Work Tasks Module

**Feature**: Work Tasks Module (M14)
**Date**: 2026-08-16

## Endpoints

### GET /api/v1/work-tasks

List work tasks for the current tenant with optional filters.

**Query parameters**:
- `state` (optional): one of `todo`, `in_progress`, `done`, `cancelled`
- `assignedToMe` (optional, bool): true to filter by current user assignment
- `assetId` (optional, GUID): filter by related asset
- `incidentId` (optional, GUID): filter by related incident
- `maintenanceOrderId` (optional, GUID): filter by related order
- `preventivePlanId` (optional, GUID): filter by source plan
- `taskRecurrenceId` (optional, GUID): filter by source recurrence
- `search` (optional, string): search by title or related asset name
- `dueBefore` (optional, ISO date): tasks due before this date
- `dueAfter` (optional, ISO date): tasks due after this date
- `page` (optional, int): page number, default 1
- `pageSize` (optional, int): default 20

**Response 200**:
```json
{
  "items": [
    {
      "id": "guid",
      "title": "string",
      "description": "string?",
      "state": "todo | in_progress | done | cancelled",
      "stateLabel": "string",
      "dueAt": "2026-08-16T12:00:00Z",
      "assetId": "guid?",
      "assetName": "string?",
      "incidentId": "guid?",
      "incidentTitle": "string?",
      "maintenanceOrderId": "guid?",
      "preventivePlanId": "guid?",
      "preventivePlanName": "string?",
      "assignedEmployeeId": "guid?",
      "assignedEmployeeName": "string?",
      "assignedTeamId": "guid?",
      "assignedTeamName": "string?",
      "taskTypeCatalogItemId": "guid",
      "priorityCatalogItemId": "guid",
      "priorityLabel": "string?",
      "createdAt": "2026-08-16T12:00:00Z"
    }
  ],
  "totalCount": 100,
  "page": 1,
  "pageSize": 20
}
```

### GET /api/v1/work-tasks/{id}

Get a single task with full detail, including latest state and related entity names.

**Response 200**: same item shape as list, plus `history` and `comments`.

### POST /api/v1/work-tasks

Create a new work task.

**Request body**:
```json
{
  "title": "string",
  "description": "string?",
  "dueAt": "2026-08-16T12:00:00Z",
  "taskTypeCatalogItemId": "guid",
  "priorityCatalogItemId": "guid",
  "assetId": "guid?",
  "incidentId": "guid?",
  "maintenanceOrderId": "guid?",
  "preventivePlanId": "guid?",
  "taskRecurrenceId": "guid?",
  "assignedEmployeeId": "guid?",
  "assignedTeamId": "guid?"
}
```

**Response 201**: `{ "id": "guid" }`

### PUT /api/v1/work-tasks/{id}

Update a task.

**Request body**: same as POST, minus `incidentId`, `maintenanceOrderId`, `preventivePlanId`, `taskRecurrenceId` (relationships cannot be changed after creation).

**Response 200**: updated task DTO.

### PUT /api/v1/work-tasks/{id}/state

Change task state.

**Request body**:
```json
{
  "state": "todo | in_progress | done | cancelled"
}
```

**Response 204** on success.
**Response 400** if transition is invalid.

### PUT /api/v1/work-tasks/{id}/assign

Assign or reassign a task.

**Request body**:
```json
{
  "assignedEmployeeId": "guid?",
  "assignedTeamId": "guid?"
}
```

**Response 204** on success.

### DELETE /api/v1/work-tasks/{id}

Soft-delete a task.

**Response 204**.

### GET /api/v1/work-tasks/{id}/history

Get state history for a task.

**Response 200**:
```json
{
  "items": [
    {
      "id": "guid",
      "fromState": "string?",
      "toState": "string",
      "changedAt": "2026-08-16T12:00:00Z",
      "changedByName": "string?"
    }
  ]
}
```

### GET /api/v1/work-tasks/{id}/comments

Get comments for a task.

**Response 200**:
```json
{
  "items": [
    {
      "id": "guid",
      "text": "string",
      "createdAt": "2026-08-16T12:00:00Z",
      "createdByName": "string?"
    }
  ]
}
```

### POST /api/v1/work-tasks/{id}/comments

Add a comment to a task.

**Request body**:
```json
{
  "text": "string"
}
```

**Response 201**: `{ "id": "guid" }`
