// start-task.ts — Bridge to core-offline startTask
import type { FieldDatabase, GeoStamp, StartTaskResult } from '@asset-hub/core-offline';
import { startTask as coreStartTask } from '@asset-hub/core-offline';

export type { StartTaskResult };

export async function startTask(
  db: FieldDatabase,
  taskId: string,
  geo?: GeoStamp | null,
): Promise<StartTaskResult> {
  return coreStartTask(db, { taskId, geo });
}
