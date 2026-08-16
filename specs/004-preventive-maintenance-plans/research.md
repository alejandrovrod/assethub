# Research: Preventive Maintenance Plans

## Decision 1 - Cron Expression Handling

**Decision**: Use the existing `Cronos` library already referenced in the backend.

**Rationale**: `CreatePreventivePlanCommand` and `EvaluateTaskRecurrencesCommand` already use `Cronos` to parse cron expressions and calculate next occurrences. Reusing it keeps the codebase consistent and avoids adding a new dependency.

**Alternatives considered**:
- `NCrontab` — mature but adds a second dependency.
- Manual interval implementation — rejected because the spec explicitly requested cron-based recurrence and Cronos is already present.

## Decision 2 - Scheduler Trigger

**Decision**: Expose a single externally-callable evaluation endpoint; do not add an in-process background service for the initial release.

**Rationale**: The feature specification chose Option B (external cron) for triggering. Adding an `IHostedService` would contradict that decision and introduce extra complexity (coordination in Aspire, multi-tenant resolution, restart behavior). An endpoint is simpler and directly testable.

**Alternatives considered**:
- `IHostedService` polling every 15 minutes — rejected per the user's explicit choice.
- Hangfire/Quartz — rejected as overkill for an MVP triggered by an external cron.

## Decision 3 - Idempotency

**Decision**: Prevent duplicate generation by recording every execution attempt in `PreventivePlanExecutionLog` keyed by `PreventivePlanId + AssetId + Occurrence`.

**Rationale**: The external cron may retry or invoke the endpoint more than once. A log record created as part of the same transaction as the generated work item guarantees that the second attempt sees the existing record and skips.

**Alternatives considered**:
- Unique constraint on generated `WorkTask`/`MaintenanceOrder` — too rigid; legitimate re-runs for different occurrences must be allowed.
- State flag on `PreventivePlan` — insufficient because a single plan can generate many work items in one run.

## Decision 4 - Missed Occurrences Policy

**Decision**: Evaluate only the current `NextRunAt` and then advance to the next occurrence. Repeated endpoint calls will catch up.

**Rationale**: This is the simplest correct behavior. If the system is down for multiple intervals, the first call processes the oldest pending occurrence, the next call processes the following one, and so on. It naturally satisfies "process most recent missed occurrence" without needing a configurable policy in the first release.

**Alternatives considered**:
- Process all missed occurrences in a loop — could generate a flood of work items after an outage; defer until a policy setting exists.
- Skip all missed occurrences — violates the spirit of preventive maintenance.

## Decision 5 - Notification Mechanism

**Decision**: Create a new per-tenant `Notification` entity and populate it via a MediatR event handler when a plan successfully generates a work item.

**Rationale**: The repo already uses MediatR events for side effects (e.g., `ParentStatePropagationHandler`). A new `Notification` entity is the smallest addition that satisfies the in-app alert requirement. Email/push are explicitly out of scope.

**Alternatives considered**:
- Reuse `AssetLifecycleEvent` — semantically wrong because it tracks asset state history, not user alerts.
- Generic message queue — unnecessary complexity for in-app notifications.

## Decision 6 - Domain Placement of PreventivePlan

**Decision**: Move `PreventivePlan` from `AssetHub.Domain.Incidents` to `AssetHub.Domain.Maintenance` but keep the database table name `tenant.PreventivePlans`.

**Rationale**: Preventive maintenance belongs to the maintenance domain, not incidents. Moving the C# class improves code organization, while preserving the table name avoids a migration that renames data.

**Alternatives considered**:
- Leave it in `Incidents` — rejected because it misleads future maintainers.
- Rename the table — rejected because it is a destructive migration with no functional benefit.

## Decision 7 - Work Item Generation Types

**Decision**: A plan can generate `WorkTask`, `MaintenanceOrder`, or both.

**Rationale**: Directly satisfies FR-003. Both entities already exist and have asset links. Generating both allows linking them by storing the generated IDs in the execution log rather than forcing a formal one-to-one relationship.

**Alternatives considered**:
- Always generate only a `WorkTask` — does not cover formal maintenance workflows.
- Introduce a new abstract "MaintenanceActivity" entity — unnecessary when existing entities already satisfy the requirement.

## Decision 8 - Assignment Strategy

**Decision**: Plans store optional `DefaultAssignedEmployeeId` and `DefaultAssignedTeamId`. Generated `WorkTask` uses both fields. `MaintenanceOrder` only uses the employee because its model has no team assignment. If automatic assignment is enabled but no compatible assignee is available, the item is created unassigned and the execution log notes it.

**Rationale**: Matches the existing data model with minimal changes. The spec requested both automatic and manual assignment; manual assignment means leaving defaults empty so the generated item is unassigned.

**Alternatives considered**:
- Add `AssignedTeamId` to `MaintenanceOrder` — out of scope for the first release.
- Infer assignee from asset owner — no owner field exists on `Asset` today.
