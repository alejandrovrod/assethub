// change-incident-state.ts — Command to change incident state (offline-capable)
import type { FieldDatabase } from '@asset-hub/core-offline';
import i18n from '../i18n';

export interface ChangeIncidentStateInput {
  incidentId: string;
  targetState: string;
  propertiesJson?: string;
}

export async function changeIncidentState(
  db: FieldDatabase,
  input: ChangeIncidentStateInput,
): Promise<void> {
  await db.transaction('rw', db.incidents, db.outbox_mutations, async (tx) => {
    const incident = await tx.incidents.get(input.incidentId);
    if (!incident) throw new Error(i18n.t('incidents:errors.notFound'));

    await tx.incidents.update(input.incidentId, {
      syncState: 'pending',
    });

    await tx.outbox_mutations.add({
      id: crypto.randomUUID(),
      tenantId: incident.tenantId ?? '',
      aggregateType: 'incident',
      aggregateId: input.incidentId,
      operation: 'incident.update',
      method: 'PATCH',
      path: `/api/v1/incidents/${input.incidentId}/state`,
      bodyJson: JSON.stringify({
        targetState: input.targetState,
        propertiesJson: input.propertiesJson,
      }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      createdAtMs: Date.now(),
      nextAttemptAtMs: Date.now(),
    });
  });
}
