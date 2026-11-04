// pause-task.ts — Bridge to core-offline pauseTask
import type { FieldDatabase, PauseTaskResult } from '@asset-hub/core-offline';
import { pauseTask as corePauseTask } from '@asset-hub/core-offline';

export type { PauseTaskResult };

export async function pauseTask(
  db: FieldDatabase,
  taskId: string,
  reason?: string,
): Promise<PauseTaskResult> {
  return corePauseTask(db, { taskId, reason });
}
