import type { FieldDatabase } from '../db/database';
import type { TaskRecord } from '../db/schema';
import { enqueueOrCoalesce } from '../outbox/outbox';

export interface PauseTaskParams {
  taskId: string;
  reason?: string;
  nowIso?: string;
}

export interface PauseTaskResult {
  taskId: string;
  mutationId: string;
  state: 'paused';
}

export async function pauseTask(
  db: FieldDatabase,
  params: PauseTaskParams,
): Promise<PauseTaskResult> {
  const { taskId, reason, nowIso } = params;
  const now = nowIso ?? new Date().toISOString();
  const nowMs = Date.now();

  let mutationId = '';

  await db.transaction('rw', [db.tasks, db.outbox_mutations], async (tx) => {
    const task = await db.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.maintenanceOrderState && task.maintenanceOrderState !== 'in_progress') {
      throw new Error(
        `Task transition locked: parent maintenance order is in "${task.maintenanceOrderState}" (must be in_progress)`,
      );
    }

    let history: Array<Record<string, unknown>> = [];
    if (task.historyJson) {
      try {
        history = JSON.parse(task.historyJson);
      } catch {
        history = [];
      }
    }
    history.push({
      timestampIso: now,
      fromState: task.state,
      toState: 'paused',
      action: 'pause',
      reason,
    });

    const patch: Partial<TaskRecord> = {
      state: 'paused',
      historyJson: JSON.stringify(history),
      syncState: 'pending',
      updatedAtLocalMs: nowMs,
    };

    await db.tasks.update(taskId, patch);

    mutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'task',
      aggregateId: taskId,
      tenantId: task.tenantId,
      operation: 'task.state',
      path: `/api/v1/work-tasks/${taskId}/state`,
      method: 'PUT',
      bodyJson: JSON.stringify({ state: 'paused', reason }),
      headersJson: JSON.stringify({ 'If-Match': task.version ?? '' }),
      status: 'pending',
      priority: 100,
    });
  });

  return {
    taskId,
    mutationId,
    state: 'paused',
  };
}

