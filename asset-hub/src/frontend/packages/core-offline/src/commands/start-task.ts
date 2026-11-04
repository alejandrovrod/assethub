import type { FieldDatabase } from '../db/database';
import type { GeoStamp, TaskRecord } from '../db/schema';
import { enqueueOrCoalesce } from '../outbox/outbox';

export interface StartTaskParams {
  taskId: string;
  geo?: GeoStamp | null;
  monotonicMs?: number;
  nowIso?: string;
}

export interface StartTaskResult {
  taskId: string;
  mutationId: string;
  state: 'in_progress';
  geo: GeoStamp;
}

export async function startTask(
  db: FieldDatabase,
  params: StartTaskParams,
): Promise<StartTaskResult> {
  const { taskId, geo, monotonicMs, nowIso } = params;
  const now = nowIso ?? new Date().toISOString();
  const nowMs = Date.now();

  const resolvedGeo: GeoStamp = geo
    ? {
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracyM: geo.accuracyM,
        capturedAtIso: geo.capturedAtIso || now,
        capturedAtMs: geo.capturedAtMs || nowMs,
        status: geo.status ?? 'ok',
      }
    : {
        latitude: 0,
        longitude: 0,
        accuracyM: 0,
        capturedAtIso: now,
        capturedAtMs: nowMs,
        status: 'unavailable',
      };

  let mutationId = '';

  await db.transaction('rw', [db.tasks, db.outbox_mutations], async (tx) => {
    const task = await db.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Parity with apps/web: Parent maintenance order lock check
    if (task.maintenanceOrderState && task.maintenanceOrderState !== 'in_progress') {
      throw new Error(
        `Task transition locked: parent maintenance order is in "${task.maintenanceOrderState}" (must be in_progress)`,
      );
    }

    // Update history
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
      toState: 'in_progress',
      action: 'start',
      geo: resolvedGeo,
    });

    const patch: Partial<TaskRecord> = {
      state: 'in_progress',
      startedAtLocalIso: task.startedAtLocalIso ?? now,
      geoStart: resolvedGeo,
      historyJson: JSON.stringify(history),
      monotonicMs: monotonicMs ?? nowMs,
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
      bodyJson: JSON.stringify({ state: 'in_progress', geo: resolvedGeo }),
      headersJson: JSON.stringify({ 'If-Match': task.version ?? '' }),
      status: 'pending',
      priority: 100,
    });
  });

  return {
    taskId,
    mutationId,
    state: 'in_progress',
    geo: resolvedGeo,
  };
}

