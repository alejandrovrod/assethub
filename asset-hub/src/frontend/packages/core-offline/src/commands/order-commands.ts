import type { FieldDatabase } from '../db/database';
import type { MaintenanceOrderRecord } from '../db/schema';
import { enqueueOrCoalesce } from '../outbox/outbox';

export interface StartOrderResult {
  orderId: string;
  mutationId: string;
  state: 'in_progress';
}

export interface CompleteOrderResult {
  orderId: string;
  mutationId: string;
  state: 'done';
}

export async function startOrder(
  db: FieldDatabase,
  orderId: string,
  nowIso?: string,
): Promise<StartOrderResult> {
  const now = nowIso ?? new Date().toISOString();
  const nowMs = Date.now();
  let mutationId = '';

  await db.transaction('rw', [db.maintenance_orders, db.tasks, db.outbox_mutations], async (tx) => {
    const order = await db.maintenance_orders.get(orderId);
    if (!order) {
      throw new Error(`MaintenanceOrder ${orderId} not found`);
    }

    const patch: Partial<MaintenanceOrderRecord> = {
      state: 'in_progress',
      startedAtLocalIso: order.startedAtLocalIso ?? now,
      syncState: 'pending',
      updatedAtLocalMs: nowMs,
    };

    await db.maintenance_orders.update(orderId, patch);

    // Propagate in_progress state to all child tasks reactively
    await db.tasks
      .where('[tenantId+maintenanceOrderId]')
      .equals([order.tenantId, orderId])
      .modify({
        maintenanceOrderState: 'in_progress',
        updatedAtLocalMs: nowMs,
      });

    mutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'order',
      aggregateId: orderId,
      tenantId: order.tenantId,
      operation: 'order.state',
      path: `/api/v1/maintenance-orders/${orderId}/state`,
      method: 'PUT',
      bodyJson: JSON.stringify({ state: 'in_progress' }),
      headersJson: JSON.stringify({ 'If-Match': order.version ?? '' }),
      status: 'pending',
      priority: 80,
    });
  });

  return {
    orderId,
    mutationId,
    state: 'in_progress',
  };
}

export async function completeOrder(
  db: FieldDatabase,
  orderId: string,
  nowIso?: string,
): Promise<CompleteOrderResult> {
  const now = nowIso ?? new Date().toISOString();
  const nowMs = Date.now();
  let mutationId = '';

  await db.transaction(
    'rw',
    [db.maintenance_orders, db.tasks, db.incidents, db.workflow_templates, db.outbox_mutations],
    async (tx) => {
    const order = await db.maintenance_orders.get(orderId);
    if (!order) {
      throw new Error(`MaintenanceOrder ${orderId} not found`);
    }

    const patch: Partial<MaintenanceOrderRecord> = {
      state: 'done',
      completedAtLocalIso: now,
      syncState: 'pending',
      updatedAtLocalMs: nowMs,
    };

    await db.maintenance_orders.update(orderId, patch);

    // Propagate done state to all child tasks reactively
    await db.tasks
      .where('[tenantId+maintenanceOrderId]')
      .equals([order.tenantId, orderId])
      .modify({
        maintenanceOrderState: 'done',
        updatedAtLocalMs: nowMs,
      });

    // Propagate to parent Incident locally (mirroring backend MaintenanceOrderCompletedEventHandler)
    if (order.incidentId) {
      const incident = await db.incidents.get(order.incidentId);
      if (incident) {
        let targetState = 'resolved';
        if (incident.workflowTemplateId) {
          const wf = await db.workflow_templates.get(incident.workflowTemplateId);
          if (wf?.lifecycleStatesJson) {
            try {
              const cfg = JSON.parse(wf.lifecycleStatesJson) as {
                states?: Record<string, { isTerminal?: boolean }>;
              };
              if (cfg?.states) {
                const terminals = Object.entries(cfg.states)
                  .filter(([, v]) => v.isTerminal)
                  .map(([k]) => k);
                const successTerminal = terminals.find(
                  (s) =>
                    !s.toLowerCase().includes('cancel') &&
                    !s.toLowerCase().includes('rechaz'),
                );
                if (successTerminal) targetState = successTerminal;
                else if (terminals.length > 0) targetState = terminals[0];
              }
            } catch {
              // Fallback to 'resolved'
            }
          }
        }
        await db.incidents.update(order.incidentId, {
          state: targetState as any,
          cachedAtMs: nowMs,
        });
      }
    }

    mutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'order',
      aggregateId: orderId,
      tenantId: order.tenantId,
      operation: 'order.state',
      path: `/api/v1/maintenance-orders/${orderId}/state`,
      method: 'PUT',
      bodyJson: JSON.stringify({ state: 'done' }),
      headersJson: JSON.stringify({ 'If-Match': order.version ?? '' }),
      status: 'pending',
      priority: 80,
    });
  });

  return {
    orderId,
    mutationId,
    state: 'done',
  };
}

