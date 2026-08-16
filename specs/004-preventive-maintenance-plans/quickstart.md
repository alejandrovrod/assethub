# Quickstart: Preventive Maintenance Plans

## Goal

Validate that a preventive plan can be created, scheduled, executed, and audited end-to-end.

## Prerequisites

- AssetHub backend and frontend running.
- At least one asset template with one active asset, or one standalone asset.
- Optional: an employee or team to assign.
- Scheduler API key configured (for the `evaluate-all` endpoint).

## Scenario 1 — Create a Plan for a Single Asset

1. **Open** `Mantenimiento > Planes de Mantenimiento`.
2. **Click** `Nuevo Plan`.
3. **Fill**:
   - Nombre: `Prueba mensual poste 001`
   - Objetivo: select asset `Poste 001`.
   - Recurrencia: `0 0 1 * *` (primer día de cada mes a medianoche UTC).
   - Entregable: `Tarea de trabajo`.
   - Asignación: choose an employee.
   - Vencimiento: `7` días.
4. **Save**. Verify `Próxima ejecución` shows the first day of next month.
5. **Trigger manually** with `Ejecutar ahora`.
6. **Verify**:
   - A `WorkTask` exists for `Poste 001` with due date 7 days from execution.
   - The plan's `Próxima ejecución` advanced to the following month.
   - The execution log shows `success`.

## Scenario 2 — Create a Plan for All Assets of a Template

1. **Create** a new plan targeting an asset template (e.g., `Postes de luz`) with 3 active assets.
2. **Set** recurrence to a near-future cron expression (e.g., `*/5 * * * *` for testing).
3. **Save** and trigger manual evaluation.
4. **Verify** that 3 work tasks are created, one per asset.
5. **Verify** that 3 execution log rows exist, all `success`.

## Scenario 3 — Condition Evaluation

1. **Create** a plan for an asset in state `Activo`.
2. **Set** excluded state `Obsoleta`.
3. **Manually change** the asset state to `Obsoleta`.
4. **Trigger** the plan.
5. **Verify**:
   - No work item is created.
   - Execution log shows `skipped` with reason referencing excluded state.

## Scenario 4 — Idempotency

1. **Use** the same plan from Scenario 1 with a `NextRunAt` in the past.
2. **Call** `POST /api/preventive-plans/evaluate-all` twice with the scheduler API key.
3. **Verify**:
   - First call generates items.
   - Second call generates no additional items for the same occurrence.
   - Execution log count does not double for that occurrence.

## Scenario 5 — Notifications

1. **Assign** a plan to a user who is logged in.
2. **Trigger** the plan.
3. **Verify** an in-app notification is received within 10 seconds.

## Scenario 6 — Pause and Resume

1. **Pause** an active plan.
2. **Trigger** evaluation.
3. **Verify** no items are generated.
4. **Resume** the plan.
5. **Trigger** evaluation again and verify generation resumes.

## Manual Scheduler Invocation

```bash
curl -X POST https://<host>/api/preventive-plans/evaluate-all \
  -H "X-Api-Key: <scheduler-api-key>"
```

Expected response:

```json
{
  "processedPlans": 2,
  "generatedWorkTasks": 3,
  "generatedMaintenanceOrders": 0,
  "skippedAssets": 1
}
```

## Cleanup

After testing, delete or pause the test plans to avoid generating real work items on every scheduler invocation.
