import type { FieldDatabase } from '../db/database';
import { enqueueOrCoalesce } from '../outbox/outbox';

export async function updateTaskProperties(
  db: FieldDatabase,
  taskId: string,
  propertiesJson: string,
): Promise<string> {
  let mutationId = '';
  await db.transaction('rw', [db.tasks, db.outbox_mutations], async (tx) => {
    const task = await db.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    await db.tasks.update(taskId, {
      propertiesJson,
      syncState: 'pending',
      updatedAtLocalMs: Date.now(),
    });

    mutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'task',
      aggregateId: taskId,
      tenantId: task.tenantId,
      operation: 'task.properties',
      path: `/api/v1/work-tasks/${taskId}/properties`,
      method: 'PUT',
      bodyJson: JSON.stringify({ propertiesJson }),
      headersJson: JSON.stringify({ 'If-Match': task.version ?? '' }),
      status: 'pending',
      priority: 100,
    });
  });
  return mutationId;
}

export async function updateOrderProperties(
  db: FieldDatabase,
  orderId: string,
  propertiesJson: string,
): Promise<string> {
  let mutationId = '';
  await db.transaction('rw', [db.maintenance_orders, db.outbox_mutations], async (tx) => {
    const order = await db.maintenance_orders.get(orderId);
    if (!order) throw new Error(`MaintenanceOrder ${orderId} not found`);

    await db.maintenance_orders.update(orderId, {
      propertiesJson,
      syncState: 'pending',
      updatedAtLocalMs: Date.now(),
    });

    mutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'order',
      aggregateId: orderId,
      tenantId: order.tenantId,
      operation: 'order.properties',
      path: `/api/v1/maintenance-orders/${orderId}/properties`,
      method: 'PUT',
      bodyJson: JSON.stringify({ propertiesJson }),
      headersJson: JSON.stringify({ 'If-Match': order.version ?? '' }),
      status: 'pending',
      priority: 100,
    });
  });
  return mutationId;
}

export async function updateIncidentProperties(
  db: FieldDatabase,
  incidentId: string,
  propertiesJson: string,
): Promise<string> {
  let mutationId = '';
  await db.transaction('rw', [db.incidents, db.outbox_mutations], async (tx) => {
    const incident = await db.incidents.get(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    await db.incidents.update(incidentId, {
      propertiesJson,
      syncState: 'pending',
      cachedAtMs: Date.now(),
    });

    mutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'incident',
      aggregateId: incidentId,
      tenantId: incident.tenantId,
      operation: 'incident.update',
      path: `/api/v1/incidents/${incidentId}/state`,
      method: 'PATCH',
      bodyJson: JSON.stringify({
        targetState: incident.state ?? 'reported',
        propertiesJson,
      }),
      headersJson: JSON.stringify({ 'If-Match': incident.version ?? '' }),
      status: 'pending',
      priority: 100,
    });
  });
  return mutationId;
}


