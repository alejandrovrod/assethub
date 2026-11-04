// complete-task.ts — Bridge to core-offline completeTask
import type { FieldDatabase, GeoStamp, CompleteTaskResult } from '@asset-hub/core-offline';
import { completeTask as coreCompleteTask } from '@asset-hub/core-offline';

export type { CompleteTaskResult };

export async function completeTask(
  db: FieldDatabase,
  taskId: string,
  geo?: GeoStamp | null,
): Promise<CompleteTaskResult> {
  return coreCompleteTask(db, { taskId, geo });
}
