// report-incident.ts — Report incident offline
import type { FieldDatabase } from '@asset-hub/core-offline';
import { enqueue } from '@asset-hub/core-offline';
import { uuidv7 } from '@asset-hub/core-offline';

export interface ReportIncidentParams {
  title: string;
  description: string;
  assetId?: string;
  assetCode?: string;
  assetName?: string;
  taskId?: string;
  latitude?: number;
  longitude?: number;
  photoIds: string[];
  tenantId: string;
}

export interface ReportIncidentResult {
  incidentId: string;
  mutationId: string;
}

export async function reportIncident(
  db: FieldDatabase,
  params: ReportIncidentParams,
): Promise<ReportIncidentResult> {
  const incidentId = uuidv7();
  const mutationId = uuidv7();
  const now = new Date().toISOString();

  await db.transaction('rw', db.incidents, db.outbox_mutations, async (tx) => {
    await db.incidents.add({
      id: incidentId,
      tenantId: params.tenantId,
      title: params.title,
      description: params.description,
      assetId: params.assetId,
      assetCode: params.assetCode,
      assetName: params.assetName,
      reportedByUserId: '',
      createdAtLocalIso: now,
      createdAtLocalMs: Date.now(),
      syncState: 'pending',
      cachedAtMs: Date.now(),
      photoIds: params.photoIds,
    } as any);

    await enqueue(tx, {
      id: mutationId,
      aggregateType: 'incident',
      aggregateId: incidentId,
      operation: 'incident.create',
      method: 'POST',
      path: '/api/v1/incidents',
      bodyJson: JSON.stringify({
        title: params.title,
        description: params.description,
        assetId: params.assetId,
        taskId: params.taskId,
        latitude: params.latitude,
        longitude: params.longitude,
        photoIds: params.photoIds,
      }),
      tenantId: params.tenantId,
      priority: 100,
      status: 'pending',
    });
  });

  return { incidentId, mutationId };
}
