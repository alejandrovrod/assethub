# Data Model: Work Tasks Module

**Feature**: Work Tasks Module (M14)
**Date**: 2026-08-16

## Entities

### WorkTask

Represents a unit of work assigned to a person or team.

| Field | Type | Required | Notes |
|---|---|---|---|
| Id | GUID | Yes | Primary key |
| TenantId | GUID | Yes | Multi-tenant filter |
| Title | string | Yes | Short description of the task |
| Description | string | No | Longer details |
| State | string | Yes | `todo`, `in_progress`, `done`, `cancelled` |
| TaskTypeCatalogItemId | GUID | Yes | FK to CatalogItem (task type) |
| PriorityCatalogItemId | GUID | Yes | FK to CatalogItem (priority) |
| DueAt | DateTime? | No | Deadline |
| CreatedAt | DateTime | Yes | UTC |
| AssetId | GUID? | No | Related asset |
| IncidentId | GUID? | No | Related incident |
| MaintenanceOrderId | GUID? | No | Related maintenance order |
| PreventivePlanId | GUID? | No | Source preventive plan |
| TaskRecurrenceId | GUID? | No | Source recurrence |
| AssignedEmployeeId | GUID? | No | Individual assignee |
| AssignedTeamId | GUID? | No | Team assignee |
| IsIndependent | bool | Yes | True if not linked to any source entity |

**Validation rules**:
- A task must have at least one related entity or be marked independent.
- Only one of `AssignedEmployeeId` or `AssignedTeamId` should be set at a time (UI enforces; backend accepts either or none).
- State transitions must follow the allowed transition matrix.

### TaskStatusHistory

Records every state change of a WorkTask.

| Field | Type | Required | Notes |
|---|---|---|---|
| Id | GUID | Yes | Primary key |
| TenantId | GUID | Yes | Multi-tenant filter |
| WorkTaskId | GUID | Yes | FK to WorkTask |
| FromState | string | No | Previous state (null for initial) |
| ToState | string | Yes | New state |
| ChangedAt | DateTime | Yes | UTC timestamp |
| ChangedBy | GUID? | No | User who changed the state |

### TaskComment

User comments on a task.

| Field | Type | Required | Notes |
|---|---|---|---|
| Id | GUID | Yes | Primary key |
| TenantId | GUID | Yes | Multi-tenant filter |
| WorkTaskId | GUID | Yes | FK to WorkTask |
| Text | string | Yes | Comment content |
| CreatedAt | DateTime | Yes | UTC timestamp |
| CreatedBy | GUID? | No | User who wrote the comment |

### Notification

In-app alert sent to users.

| Field | Type | Required | Notes |
|---|---|---|---|
| Id | GUID | Yes | Primary key |
| TenantId | GUID | Yes | Multi-tenant filter |
| UserId | GUID | Yes | Recipient |
| Title | string | Yes | Short summary |
| Message | string | Yes | Details |
| IsRead | bool | Yes | Read status |
| CreatedAt | DateTime | Yes | UTC timestamp |
| RelatedEntityId | GUID? | No | Link to task, asset, etc. |
| RelatedEntityType | string | No | Type of related entity |

## Relationships

- **WorkTask → Asset** (optional, many-to-one)
- **WorkTask → Incident** (optional, many-to-one)
- **WorkTask → MaintenanceOrder** (optional, many-to-one)
- **WorkTask → PreventivePlan** (optional, many-to-one)
- **WorkTask → TaskRecurrence** (optional, many-to-one)
- **WorkTask → Employee** (optional, many-to-one via AssignedEmployeeId)
- **WorkTask → Team** (optional, many-to-one via AssignedTeamId)
- **WorkTask → TaskStatusHistory** (one-to-many, cascade delete)
- **WorkTask → TaskComment** (one-to-many, cascade delete)
- **WorkTask → CatalogItem** (required, many-to-one via TaskTypeCatalogItemId and PriorityCatalogItemId)

## State Transitions

```
todo ──► in_progress ──► done
todo ──► cancelled
in_progress ──► cancelled
```

`done` and `cancelled` are terminal.

## Indexes

- `WorkTask`: `(TenantId, State)`, `(TenantId, AssetId)`, `(TenantId, IncidentId)`, `(TenantId, AssignedEmployeeId)`, `(TenantId, AssignedTeamId)`, `(TenantId, PreventivePlanId)`, `(TenantId, DueAt)`
- `TaskStatusHistory`: `(TenantId, WorkTaskId)`
- `TaskComment`: `(TenantId, WorkTaskId)`
- `Notification`: `(TenantId, UserId, IsRead)`, `(TenantId, CreatedAt)`
