// save-checklist.ts — Bridge to core-offline saveChecklist
import type { FieldDatabase, SaveChecklistResult } from '@asset-hub/core-offline';
import {
  saveChecklist as coreSaveChecklist,
  saveChecklistDraft as coreSaveChecklistDraft,
} from '@asset-hub/core-offline';

export type { SaveChecklistResult };

export async function saveChecklist(
  db: FieldDatabase,
  taskId: string,
  responseJson: string,
): Promise<SaveChecklistResult> {
  return coreSaveChecklist(db, { taskId, responseJson });
}

export async function saveChecklistDraft(
  db: FieldDatabase,
  taskId: string,
  responseJson: string,
): Promise<void> {
  return coreSaveChecklistDraft(db, { taskId, responseJson });
}
