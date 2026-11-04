import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { TaskRepository } from './task.repository';
import { MaintenanceOrderRepository } from './maintenance-order.repository';
import { IncidentRepository } from './incident.repository';

// Regression: the assignee lives in propertiesJson, not in the AssignedEmployeeId column.
// Every row below has `assignedEmployeeId` unset on purpose.
const ALEJANDRO = '848c1db9-5844-4f19-889e-6229b0db5d2e';
const MICHAEL = 'adcdf4de-88f2-47ed-a362-5d226f1704ad';
const ASSET = '6bbec714-67cd-4091-bc35-2f6a15d04407';
const TENANT = 'demo';

describe('findForActor resolves assignment from propertiesJson', () => {
  let db: FieldDatabase;
  let taskRepo: TaskRepository;
  let orderRepo: MaintenanceOrderRepository;
  let incidentRepo: IncidentRepository;
  const now = Date.now();

  beforeEach(() => {
    db = createFieldDatabase(`test-assignment-${Date.now()}-${Math.random()}`);
    taskRepo = new TaskRepository(db);
    orderRepo = new MaintenanceOrderRepository(db);
    incidentRepo = new IncidentRepository(db);
  });

  const baseTask = {
    tenantId: TENANT,
    priority: 'medium',
    state: 'todo' as const,
    serverState: 'todo' as const,
    dueAtMs: now,
    cachedAtMs: now,
    updatedAtLocalMs: now,
    syncState: 'synced' as const,
  };

  it('returns tasks whose only assignment is asignar_a in the properties', async () => {
    await taskRepo.upsert({
      ...baseTask,
      id: 'task-asignar',
      title: 'Assigned through asignar_a',
      assignedToId: '',
      propertiesJson: JSON.stringify({ asignar_a: ALEJANDRO, field_1786753693545: ASSET }),
    });
    await taskRepo.upsert({
      ...baseTask,
      id: 'task-other',
      title: 'Assigned to someone else',
      assignedToId: '',
      propertiesJson: JSON.stringify({ asignar_a: MICHAEL }),
    });

    const forAlejandro = await taskRepo.findForActor({ tenantId: TENANT, employeeId: ALEJANDRO });
    expect(forAlejandro.map((t) => t.id)).toEqual(['task-asignar']);

    const forMichael = await taskRepo.findForActor({ tenantId: TENANT, employeeId: MICHAEL });
    expect(forMichael.map((t) => t.id)).toEqual(['task-other']);
  });

  it('does not return tasks where the actor only follows up', async () => {
    await taskRepo.upsert({
      ...baseTask,
      id: 'task-reportar',
      title: 'Alejandro only follows up here',
      assignedToId: '',
      propertiesJson: JSON.stringify({ reportar_a: ALEJANDRO }),
    });
    await taskRepo.upsert({
      ...baseTask,
      id: 'task-michael-executes',
      title: 'Michael executes, Alejandro follows up',
      assignedToId: MICHAEL,
      assignedEmployeeId: MICHAEL,
      propertiesJson: JSON.stringify({ asignar_a: MICHAEL, reportar_a: ALEJANDRO }),
    });

    const forAlejandro = await taskRepo.findForActor({ tenantId: TENANT, employeeId: ALEJANDRO });
    expect(forAlejandro).toEqual([]);

    const forMichael = await taskRepo.findForActor({ tenantId: TENANT, employeeId: MICHAEL });
    expect(forMichael.map((t) => t.id)).toEqual(['task-michael-executes']);
  });

  it('returns nothing when the actor is unknown instead of leaking the whole tenant', async () => {
    await taskRepo.upsert({
      ...baseTask,
      id: 'task-someone',
      title: 'Belongs to somebody',
      assignedToId: MICHAEL,
      assignedEmployeeId: MICHAEL,
    });

    const result = await taskRepo.findForActor({ tenantId: TENANT });
    expect(result).toEqual([]);
  });

  it('does not depend on the AssignedEmployeeId column', async () => {
    await taskRepo.upsert({
      ...baseTask,
      id: 'task-column-only',
      title: 'Legacy row assigned by column',
      assignedEmployeeId: ALEJANDRO,
      assignedToId: ALEJANDRO,
    });

    const result = await taskRepo.findForActor({ tenantId: TENANT, employeeId: ALEJANDRO });
    expect(result.map((t) => t.id)).toEqual(['task-column-only']);
  });

  it('applies the same rule to maintenance orders', async () => {
    await orderRepo.upsert({
      id: 'order-asignar',
      tenantId: TENANT,
      title: 'Order for Alejandro',
      kind: 'corrective',
      state: 'in_progress',
      serverState: 'in_progress',
      scheduledStartMs: now,
      scheduledEndMs: 0,
      cachedAtMs: now,
      updatedAtLocalMs: now,
      syncState: 'synced',
      propertiesJson: JSON.stringify({ asignar_a: ALEJANDRO }),
    });

    const result = await orderRepo.findForActor({ tenantId: TENANT, employeeId: ALEJANDRO });
    expect(result.map((o) => o.id)).toEqual(['order-asignar']);
  });

  it('applies the same rule to incidents', async () => {
    await incidentRepo.upsert({
      id: 'inc-asignar',
      tenantId: TENANT,
      title: 'Incident for Alejandro',
      description: 'Breakdown',
      severity: 'high',
      affectsOperation: false,
      geoStatus: 'unavailable',
      photoIds: [],
      reportedByUserId: MICHAEL,
      createdAtLocalIso: new Date(now).toISOString(),
      createdAtLocalMs: now,
      syncState: 'synced',
      cachedAtMs: now,
      propertiesJson: JSON.stringify({ asignar_a: ALEJANDRO }),
    });

    const result = await incidentRepo.findForActor({ tenantId: TENANT, employeeId: ALEJANDRO });
    expect(result.map((i) => i.id)).toEqual(['inc-asignar']);
  });
});
