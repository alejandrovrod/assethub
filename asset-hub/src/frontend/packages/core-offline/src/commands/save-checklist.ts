import type { FieldDatabase } from '../db/database';
import { enqueueOrCoalesce } from '../outbox/outbox';

export interface SaveChecklistParams {
  taskId: string;
  responseJson: string;
}

export interface SaveChecklistResult {
  taskId: string;
  mutationId: string;
}

/**
 * Saves a local draft of the checklist response without enqueuing to outbox.
 * Useful for debounced autosaving.
 */
export async function saveChecklistDraft(
  db: FieldDatabase,
  params: SaveChecklistParams,
): Promise<void> {
  const { taskId, responseJson } = params;
  await db.tasks.update(taskId, {
    checklistDraftJson: responseJson,
    updatedAtLocalMs: Date.now(),
  });
}

/**
 * Commits checklist response and enqueues task.checklist mutation.
 */
export async function saveChecklist(
  db: FieldDatabase,
  params: SaveChecklistParams,
): Promise<SaveChecklistResult> {
  const { taskId, responseJson } = params;
  const nowMs = Date.now();
  let mutationId = '';

  await db.transaction('rw', [db.tasks, db.outbox_mutations], async (tx) => {
    const task = await db.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    await db.tasks.update(taskId, {
      checklistDraftJson: responseJson,
      checklistResponseJson: responseJson,
      syncState: 'pending',
      updatedAtLocalMs: nowMs,
    });

    mutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'task',
      aggregateId: taskId,
      tenantId: task.tenantId,
      operation: 'task.checklist',
      path: `/api/v1/work-tasks/${taskId}/checklist`,
      method: 'PUT',
      bodyJson: JSON.stringify({ responseJson }),
      headersJson: JSON.stringify({ 'If-Match': task.checklistVersion ?? '' }),
      status: 'pending',
      priority: 100,
    });
  });

  return { taskId, mutationId };
}

