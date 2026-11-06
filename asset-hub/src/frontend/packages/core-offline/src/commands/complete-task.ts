import type { FieldDatabase } from '../db/database';
import type { GeoStamp, TaskRecord } from '../db/schema';
import { enqueueOrCoalesce } from '../outbox/outbox';

export class ChecklistIncompleteError extends Error {
  constructor(public readonly missingFields: string[]) {
    super(`Checklist is incomplete. Missing fields: ${missingFields.join(', ')}`);
    this.name = 'ChecklistIncompleteError';
  }
}

export function validateChecklistCompleteness(
  schemaJson?: string,
  responseJson?: string,
): { valid: boolean; missingFields: string[] } {
  if (!schemaJson) return { valid: true, missingFields: [] };

  let schema: Record<string, unknown> = {};
  try {
    schema = JSON.parse(schemaJson);
  } catch {
    return { valid: true, missingFields: [] };
  }

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  if (required.length === 0) {
    return { valid: true, missingFields: [] };
  }

  let response: Record<string, unknown> = {};
  if (responseJson) {
    try {
      response = JSON.parse(responseJson);
    } catch {
      response = {};
    }
  }

  const missingFields: string[] = [];
  for (const field of required) {
    const val = response[field];
    if (val === undefined || val === null || val === '') {
      missingFields.push(field);
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

export interface CompleteTaskParams {
  taskId: string;
  geo?: GeoStamp | null;
  nowIso?: string;
}

export interface CompleteTaskResult {
  taskId: string;
  stateMutationId: string;
  checklistMutationId?: string;
  state: 'done';
  geo?: GeoStamp;
}

export async function completeTask(
  db: FieldDatabase,
  params: CompleteTaskParams,
): Promise<CompleteTaskResult> {
  const { taskId, geo, nowIso } = params;
  const now = nowIso ?? new Date().toISOString();
  const nowMs = Date.now();

  const resolvedGeo: GeoStamp | undefined = geo
    ? {
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracyM: geo.accuracyM,
        capturedAtIso: geo.capturedAtIso || now,
        capturedAtMs: geo.capturedAtMs || nowMs,
        status: geo.status ?? 'ok',
      }
    : undefined;

  let stateMutationId = '';
  let checklistMutationId: string | undefined;

  await db.transaction(
    'rw',
    [db.tasks, db.maintenance_orders, db.incidents, db.workflow_templates, db.outbox_mutations],
    async (tx) => {
    const task = await db.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.maintenanceOrderState && task.maintenanceOrderState !== 'in_progress') {
      throw new Error(
        `Task transition locked: parent maintenance order is in "${task.maintenanceOrderState}" (must be in_progress)`,
      );
    }

    // Checklist completeness validation
    if (task.checklistSchemaJson) {
      const answersJson = task.checklistDraftJson ?? task.checklistResponseJson;
      const validation = validateChecklistCompleteness(task.checklistSchemaJson, answersJson);
      if (!validation.valid) {
        throw new ChecklistIncompleteError(validation.missingFields);
      }

      // If there is an active draft or response, enqueue checklist mutation
      if (answersJson) {
        checklistMutationId = await enqueueOrCoalesce(tx, {
          aggregateType: 'task',
          aggregateId: taskId,
          tenantId: task.tenantId,
          operation: 'task.checklist',
          path: `/api/v1/work-tasks/${taskId}/checklist`,
          method: 'PUT',
          bodyJson: JSON.stringify({ responseJson: answersJson }),
          headersJson: JSON.stringify({ 'If-Match': task.checklistVersion ?? '' }),
          status: 'pending',
          priority: 90, // Checklist before state
        });
      }
    }

    // Update history
    let history: Array<Record<string, unknown>> = [];
    if (task.historyJson) {
      try {
        history = JSON.parse(task.historyJson);
      } catch {
        history = [];
      }
    }
    history.push({
      timestampIso: now,
      fromState: task.state,
      toState: 'done',
      action: 'complete',
      geo: resolvedGeo,
    });

    const patch: Partial<TaskRecord> = {
      state: 'done',
      completedAtLocalIso: now,
      geoEnd: resolvedGeo,
      checklistResponseJson: task.checklistDraftJson ?? task.checklistResponseJson,
      historyJson: JSON.stringify(history),
      syncState: 'pending',
      updatedAtLocalMs: nowMs,
    };

    await db.tasks.update(taskId, patch);

    // Propagate state to parent order ONLY if ALL tasks of the order are strictly completed ('done')
    if (task.maintenanceOrderId) {
      const orderTasks = await db.tasks
        .where('maintenanceOrderId')
        .equals(task.maintenanceOrderId)
        .toArray();
      const allDone = orderTasks.length > 0 && orderTasks.every(
        (t) => t.id === taskId || t.state === 'done',
      );
      if (allDone) {
        await db.maintenance_orders.update(task.maintenanceOrderId, {
          state: 'done',
          completedAtLocalIso: now,
          updatedAtLocalMs: nowMs,
        });
        for (const t of orderTasks) {
          await db.tasks.update(t.id, { maintenanceOrderState: 'done' });
        }

        // Propagate to parent Incident locally (mirroring backend MaintenanceOrderCompletedEventHandler)
        const parentOrder = await db.maintenance_orders.get(task.maintenanceOrderId);
        const incidentId = task.incidentId ?? parentOrder?.incidentId;
        if (incidentId) {
          const incident = await db.incidents.get(incidentId);
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
            await db.incidents.update(incidentId, {
              state: targetState as any,
              cachedAtMs: nowMs,
            });
          }
        }
      }
    }

    stateMutationId = await enqueueOrCoalesce(tx, {
      aggregateType: 'task',
      aggregateId: taskId,
      tenantId: task.tenantId,
      operation: 'task.state',
      path: `/api/v1/work-tasks/${taskId}/state`,
      method: 'PUT',
      bodyJson: JSON.stringify({ state: 'done', geo: resolvedGeo }),
      headersJson: JSON.stringify({ 'If-Match': task.version ?? '' }),
      status: 'pending',
      priority: 100,
    });
  });

  return {
    taskId,
    stateMutationId,
    checklistMutationId,
    state: 'done',
    geo: resolvedGeo,
  };
}

