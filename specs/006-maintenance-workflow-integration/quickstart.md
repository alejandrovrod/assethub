# Quickstart: Maintenance Workflow Integration

## Backend Validation

### 1. Build the solution

```bash
cd asset-hub
dotnet build src/backend/AssetHub.Api/AssetHub.Api.csproj
```

### 2. Run backend integration tests

```bash
cd asset-hub
dotnet test tests/backend/AssetHub.Api.Tests/AssetHub.Api.Tests.csproj
```

Expected result: 47 tests pass.

### 3. Apply the migration (optional, against a real database)

```bash
cd asset-hub
dotnet ef database update --startup-project src/backend/AssetHub.Api/AssetHub.Api.csproj --project src/backend/AssetHub.Infrastructure/AssetHub.Infrastructure.csproj --context TenantDbContext
```

## Manual API Validation

### Scenario A: Incident → Corrective Order → Closed Incident

1. Create an asset.
2. Report an incident for the asset.
3. Transition the incident to `assigned`:

```bash
PATCH /api/v1/incidents/{incidentId}/state
{ "targetState": "assigned" }
```

4. Verify that a corrective `MaintenanceOrder` in `draft` state exists with `incidentId == incidentId`.
5. Add a task to the order:

```bash
POST /api/v1/work-tasks
{
  "title": "Fix issue",
  "maintenanceOrderId": "{orderId}",
  "taskTypeCatalogItemId": "...",
  "priorityCatalogItemId": "..."
}
```

6. Approve, schedule, and start the order:

```bash
PATCH /api/v1/maintenance-orders/{orderId}/approve
PATCH /api/v1/maintenance-orders/{orderId}/schedule
PATCH /api/v1/maintenance-orders/{orderId}/start
```

7. Mark the task `done`:

```bash
PUT /api/v1/work-tasks/{taskId}/state
{ "state": "done" }
```

8. Verify the order moved to `done`.
9. Verify the order:

```bash
PATCH /api/v1/maintenance-orders/{orderId}/verify
```

10. Verify the incident moved to `closed`.

### Scenario B: Preventive Plan Skips Blocked Asset

1. Create an asset.
2. Create and assign an incident for the asset (state `assigned`).
3. Create a preventive plan targeting the asset with `NextRunAt` in the past.
4. Evaluate the plan:

```bash
POST /api/v1/preventive-plans/{planId}/evaluate
```

5. Verify the response has `skippedAssets: 1` and `generatedWorkTasks: 0`.
6. Verify the execution log message contains "active incident".

### Scenario C: Guard Rejects Early Incident Closure

1. Create an incident and generate a corrective order.
2. Attempt to close the incident:

```bash
PATCH /api/v1/incidents/{incidentId}/state
{ "targetState": "closed" }
```

3. Verify the request returns `422` with the message "Cannot close the incident while it has active maintenance orders or open tasks."

## Frontend Validation (after Phase 8)

1. Open an asset detail page and confirm the new widgets show related incidents, orders, tasks, and plans.
2. Open an incident detail page and confirm the generated corrective order appears.
3. Open the order detail page, start it, and confirm child tasks move to `in_progress`.
4. Mark all child tasks `done` in the task detail/Kanban and confirm the order shows "Ready to complete".
5. Verify the order and confirm the incident closes.
6. Attempt to close an incident with active work and confirm the UI disables the action and shows a tooltip.
