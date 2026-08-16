# API Contract: Preventive Maintenance Plans

## Base Path

`/api/preventive-plans`

## Endpoints

### List Plans

```text
GET /api/preventive-plans?assetId={assetId}&templateId={templateId}&active={true|false}
```

**Response 200**:

```json
{
  "items": [
    {
      "id": "guid",
      "name": "Monthly Street Light Review",
      "description": "...",
      "targetType": "AssetTemplate",
      "assetTemplateId": "guid",
      "assetTemplateName": "Street Light",
      "assetId": null,
      "generatedEntityType": "Both",
      "cronExpression": "0 0 1 * *",
      "dueDateOffsetDays": 7,
      "autoAssign": true,
      "defaultAssignedEmployeeId": "guid",
      "defaultAssignedTeamId": "guid",
      "nextRunAt": "2026-09-01T00:00:00Z",
      "lastRunAt": "2026-08-01T00:00:00Z",
      "endsAt": null,
      "isActive": true
    }
  ]
}
```

---

### Get Plan by Id

```text
GET /api/preventive-plans/{id}
```

**Response 200**: same shape as a list item, including full details.

---

### Create Plan

```text
POST /api/preventive-plans
```

**Request body**:

```json
{
  "name": "Monthly Street Light Review",
  "description": "Inspect all street lights every month",
  "assetTemplateId": "guid",
  "assetId": null,
  "generatedEntityType": "Both",
  "cronExpression": "0 0 1 * *",
  "dueDateOffsetDays": 7,
  "conditionRuleJson": "{\"excludedStates\":[\"Obsoleta\"]}",
  "autoAssign": true,
  "defaultAssignedEmployeeId": "guid",
  "defaultAssignedTeamId": "guid",
  "endsAt": null
}
```

**Response 201**:

```json
{
  "id": "guid",
  "nextRunAt": "2026-09-01T00:00:00Z"
}
```

**Validation rules**:

- Exactly one of `assetTemplateId` or `assetId` must be provided.
- `generatedEntityType` must be `"WorkTask"`, `"MaintenanceOrder"`, or `"Both"`.
- `cronExpression` must be a valid cron expression.
- `dueDateOffsetDays` must be >= 0.

---

### Update Plan

```text
PUT /api/preventive-plans/{id}
```

**Request body**: same as Create Plan, but with existing `id` in path.

**Response 200**: updated plan shape.

---

### Delete Plan

```text
DELETE /api/preventive-plans/{id}
```

**Response 204**.

---

### Toggle Active

```text
PATCH /api/preventive-plans/{id}/toggle-active
```

**Response 200**: updated plan shape with flipped `isActive`.

---

### Evaluate All Due Plans (Scheduler Endpoint)

```text
POST /api/preventive-plans/evaluate-all
```

**Headers**:

- `X-Api-Key: {configured scheduler key}`

**Response 200**:

```json
{
  "processedPlans": 5,
  "generatedWorkTasks": 12,
  "generatedMaintenanceOrders": 8,
  "skippedAssets": 3
}
```

**Behavior**: Processes all active, non-deleted plans whose `NextRunAt` is less than or equal to the current UTC time. Advances each processed plan to its next cron occurrence.

---

### Evaluate Single Plan (Manual Trigger)

```text
POST /api/preventive-plans/{id}/evaluate
```

**Response 200**: summary of generated items for that plan.

---

### List Execution Logs

```text
GET /api/preventive-plans/{id}/logs?assetId={assetId}&status={status}&page=1&pageSize=20
```

**Response 200**:

```json
{
  "items": [
    {
      "id": "guid",
      "executedAt": "2026-08-01T00:00:00Z",
      "occurrence": "2026-08-01T00:00:00Z",
      "assetId": "guid",
      "assetName": "Street Light 001",
      "status": "success",
      "generatedEntityType": "WorkTask",
      "generatedEntityId": "guid",
      "message": null
    }
  ],
  "totalCount": 42
}
```

---

### Get Next Occurrences

```text
GET /api/preventive-plans/{id}/next-occurrences?count=12
```

**Response 200**:

```json
{
  "items": [
    "2026-09-01T00:00:00Z",
    "2026-10-01T00:00:00Z"
  ]
}
```
