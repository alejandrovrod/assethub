# API Contract: Maintenance Workflow Integration

## Maintenance Orders

### Start an order

```http
PATCH /api/v1/maintenance-orders/{id}/start
```

**Response**: `204 NoContent`

**Errors**:
- `400` — Order not found.
- `422` — Invalid state transition.

### Complete an order

```http
PATCH /api/v1/maintenance-orders/{id}/complete
```

**Response**: `204 NoContent`

**Errors**:
- `400` — Order not found.
- `422` — Invalid state transition (e.g. not `in_progress`).

### Cancel an order

```http
PATCH /api/v1/maintenance-orders/{id}/cancel
```

**Response**: `204 NoContent`

**Errors**:
- `400` — Order not found.
- `422` — Invalid state transition (e.g. already `verified`).

## Incidents

### Change incident state

```http
PATCH /api/v1/incidents/{id}/state
Content-Type: application/json

{
  "targetState": "closed"
}
```

**Response**: `204 NoContent`

**Behavior changes**:
- Transitioning to `assigned` triggers creation of a corrective `MaintenanceOrder` in `draft`.
- Transitioning to a terminal state (`closed` / `cancelled`) is rejected while the incident has active orders or non-terminal tasks.

**Errors**:
- `400` — Incident not found.
- `422` — Invalid state transition or guard violation (active work exists).

## Work Tasks

### Change task state

```http
PUT /api/v1/work-tasks/{id}/state
Content-Type: application/json

{
  "state": "done"
}
```

**Response**: `204 NoContent`

**Behavior changes**:
- When the last child task of an `in_progress` order reaches `done`, the parent order moves to `done` automatically.

## Preventive Plans

### Evaluate a single plan

```http
POST /api/v1/preventive-plans/{id}/evaluate
```

**Response**: `200 OK`

```json
{
  "processedPlans": 1,
  "generatedWorkTasks": 0,
  "generatedMaintenanceOrders": 0,
  "skippedAssets": 1,
  "failedAssets": 0
}
```

**Behavior changes**:
- If the target asset has an active incident or an order that is not `verified`/`cancelled`, the execution is recorded as `skipped` with a reason instead of generating work.
