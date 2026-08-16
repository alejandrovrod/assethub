# Data Model: Preventive Maintenance Plans

## Entity: PreventivePlan

Represents a recurring schedule that generates maintenance work items.

| Field | Type | Required | Description |
|---|---|---|---|
| Id | GUID | Yes | Primary key |
| TenantId | GUID | Yes | Multi-tenant discriminator |
| Name | string | Yes | Human-readable plan name |
| Description | string? | No | Optional details |
| AssetTemplateId | GUID? | No | Target all active assets of this template |
| AssetId | GUID? | No | Target a single asset |
| GeneratedEntityType | string | Yes | `"WorkTask"`, `"MaintenanceOrder"`, or `"Both"` |
| CronExpression | string | Yes | Cron expression for recurrence |
| DueDateOffsetDays | int | Yes | Days added to execution time to set the work item due date |
| ConditionRuleJson | string? | No | JSON with `excludedStates` and optionally `allowedStates` |
| DefaultAssignedEmployeeId | GUID? | No | Used when `AutoAssign` is true |
| DefaultAssignedTeamId | GUID? | No | Used when `AutoAssign` is true |
| AutoAssign | bool | Yes | `true` = apply defaults; `false` = leave unassigned |
| NextRunAt | DateTime? | Yes | Next scheduled execution (UTC) |
| LastRunAt | DateTime? | No | Last execution time |
| EndsAt | DateTime? | No | Optional plan end date |
| IsActive | bool | Yes | `false` pauses generation |
| IsDeleted | bool | Yes | Soft delete flag |

**Validation rules**:

- Exactly one of `AssetTemplateId` or `AssetId` must be set.
- `CronExpression` must be a valid cron expression.
- `DueDateOffsetDays` must be >= 0.
- `GeneratedEntityType` must be one of the allowed values.

## Entity: PreventivePlanExecutionLog

One row per execution attempt per target asset.

| Field | Type | Required | Description |
|---|---|---|---|
| Id | GUID | Yes | Primary key |
| TenantId | GUID | Yes | Multi-tenant discriminator |
| PreventivePlanId | GUID | Yes | FK to PreventivePlan |
| ExecutedAt | DateTime | Yes | When the execution happened (UTC) |
| Occurrence | DateTime | Yes | The scheduled occurrence that triggered this execution |
| AssetId | GUID | Yes | Target asset |
| Status | string | Yes | `"success"`, `"skipped"`, or `"failed"` |
| GeneratedEntityType | string? | No | `"WorkTask"` or `"MaintenanceOrder"` |
| GeneratedEntityId | GUID? | No | ID of the generated item, when successful |
| Message | string? | No | Skip reason or error message |

**Unique constraint**: `(PreventivePlanId, AssetId, Occurrence)` prevents duplicate work items for the same scheduled occurrence.

## Entity: Notification

In-app alert sent when a plan generates a work item.

| Field | Type | Required | Description |
|---|---|---|---|
| Id | GUID | Yes | Primary key |
| TenantId | GUID | Yes | Multi-tenant discriminator |
| UserId | GUID | Yes | Recipient |
| Title | string | Yes | Notification title |
| Message | string | Yes | Notification body |
| IsRead | bool | Yes | Read status |
| CreatedAt | DateTime | Yes | UTC timestamp |
| RelatedEntityType | string? | No | `"PreventivePlan"`, `"WorkTask"`, or `"MaintenanceOrder"` |
| RelatedEntityId | GUID? | No | ID of the related entity |

## Changes to Existing Entities

### WorkTask

- Add `PreventivePlanId` (GUID?, FK to PreventivePlan). Already has `AssetId`, `MaintenanceOrderId`, `TaskRecurrenceId`.

### MaintenanceOrder

- `PreventivePlanId` already exists. No change required.

## Relationships

```text
PreventivePlan 1--* PreventivePlanExecutionLog
PreventivePlan 1--0..1 Asset
PreventivePlan 1--0..1 AssetTemplate
PreventivePlanExecutionLog *--1 Asset
PreventivePlan 1--* WorkTask
PreventivePlan 1--* MaintenanceOrder
Notification *--0..1 PreventivePlan
Notification *--0..1 WorkTask
Notification *--0..1 MaintenanceOrder
```

## Condition Rule Format

`ConditionRuleJson` stores a JSON object:

```json
{
  "allowedStates": ["Activo", "Instalado_Activo"],
  "excludedStates": ["Obsoleta", "En_Reparacion"]
}
```

Evaluation rules:

- If `allowedStates` is provided and non-empty, the asset must be in one of these states.
- If `excludedStates` is provided and non-empty, the asset must NOT be in any of these states.
- If both are provided, both conditions must be satisfied.
- If the rule is missing/empty, no condition is applied.

A failed condition results in a log row with `Status = "skipped"` and a message such as "Asset state 'Obsoleta' is excluded by plan conditions".
