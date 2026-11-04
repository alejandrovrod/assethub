// uploader.ts — Media upload with dedup by sha256
import { sha256 } from '@asset-hub/core-offline';
import type { FieldDatabase } from '@asset-hub/core-offline';

export interface UploadResult {
  mediaId: string;
  remoteUrl: string;
  sha256: string;
}

export async function uploadMedia(
  db: FieldDatabase,
  file: Blob,
  tenantId: string,
  ownerType: 'incident' | 'task_evidence',
  ownerId: string,
  purpose: 'incident_photo' | 'task_photo' | 'signature',
  apiBase: string,
  accessToken: string,
): Promise<UploadResult> {
  // Compute sha256 for dedup
  const hash = await sha256(file);

  // Check if already uploaded (dedup)
  const existing = await db.media_queue.where('sha256').equals(hash).first();
  if (existing?.remoteUrl) {
    return {
      mediaId: existing.id,
      remoteUrl: existing.remoteUrl,
      sha256: hash,
    };
  }

  // Create or reuse media queue entry (prevents ConstraintError on unique sha256)
  let mediaId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    try {
      await db.media_queue.update(mediaId, {
        ownerType,
        ownerId,
        purpose,
        status: 'pending',
      });
    } catch {
      // Best effort update
    }
  } else {
    try {
      await db.media_queue.add({
        id: mediaId,
        tenantId,
        ownerType,
        ownerId,
        purpose,
        blob: file,
        mimeType: file.type || 'image/jpeg',
        bytes: file.size,
        sha256: hash,
        status: 'pending',
        attempts: 0,
        nextAttemptAtMs: 0,
        createdAtMs: Date.now(),
      } as any);
    } catch {
      // Fallback if concurrent insert raced on sha256
      try {
        const raced = await db.media_queue.where('sha256').equals(hash).first();
        if (raced) {
          mediaId = raced.id;
          await db.media_queue.update(mediaId, {
            ownerType,
            ownerId,
            purpose,
            status: 'pending',
          });
        }
      } catch {
        // Continue with HTTP upload
      }
    }
  }

  // Upload to server (try /api/v1/files/upload, fallback to /api/v1/media/upload)
  const formData = new FormData();
  formData.append('file', file, `${mediaId}.jpg`);

  let res = await fetch(`${apiBase}/api/v1/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    res = await fetch(`${apiBase}/api/v1/media/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });
  }

  if (!res.ok) {
    await db.media_queue.update(mediaId, { status: 'failed' });
    throw new Error(`Upload failed: ${res.status}`);
  }

  const data = await res.json();
  const remoteUrl = data.url ?? data.blobUri ?? '';

  // Update media queue with remote URL
  try {
    await db.media_queue.where('sha256').equals(hash).modify({
      status: 'uploaded',
      remoteUrl,
    });
  } catch {
    await db.media_queue.update(mediaId, {
      status: 'uploaded',
      remoteUrl,
    });
  }

  return {
    mediaId,
    remoteUrl,
    sha256: hash,
  };
}
