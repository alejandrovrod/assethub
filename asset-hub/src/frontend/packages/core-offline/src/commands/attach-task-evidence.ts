import type { FieldDatabase } from '../db/database';
import type { MediaQueueItem } from '../db/schema';
import { uuidv7 } from '../util/uuidv7';
import { enqueue } from '../outbox/outbox';

export interface AttachTaskEvidenceParams {
  taskId: string;
  blob: Blob;
  mimeType: string;
  sha256: string;
  width?: number;
  height?: number;
  note?: string;
  latitude?: number;
  longitude?: number;
}

export interface AttachTaskEvidenceResult {
  mediaId: string;
  mutationId: string;
}

export async function attachTaskEvidence(
  db: FieldDatabase,
  params: AttachTaskEvidenceParams,
): Promise<AttachTaskEvidenceResult> {
  const { taskId, blob, mimeType, sha256, width, height, note, latitude, longitude } = params;
  const nowMs = Date.now();
  const mediaId = uuidv7();
  const mutationId = uuidv7();

  let tenantId = '';

  await db.transaction('rw', [db.tasks, db.media_queue, db.outbox_mutations], async (tx) => {
    const task = await db.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    tenantId = task.tenantId;

    const mediaItem: MediaQueueItem = {
      id: mediaId,
      tenantId,
      ownerType: 'task_evidence',
      ownerId: taskId,
      purpose: 'task_photo',
      blob,
      mimeType,
      bytes: blob.size,
      width,
      height,
      sha256,
      status: 'pending',
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: nowMs,
      outboxId: mutationId,
    };

    await db.media_queue.add(mediaItem);

    // Enqueue evidence.create mutation in outbox, dependent on media upload
    await enqueue(tx, {
      id: mutationId,
      aggregateType: 'evidence',
      aggregateId: taskId,
      tenantId,
      operation: 'evidence.create',
      path: `/api/v1/work-tasks/${taskId}/evidences`,
      method: 'POST',
      bodyJson: JSON.stringify({
        type: 'photo',
        note,
        latitude,
        longitude,
        mediaQueueId: mediaId,
      }),
      status: 'pending',
      priority: 110,
      dependsOn: mediaId,
    });
  });

  return { mediaId, mutationId };
}

