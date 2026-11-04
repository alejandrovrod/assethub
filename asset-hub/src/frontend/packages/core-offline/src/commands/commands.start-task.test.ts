import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { startTask } from './start-task';
import type { TaskRecord, MaintenanceOrderRecord } from '../db/schema';

function makeTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-100',
    tenantId: 'tenant-test',
    assignedToId: 'user-1',
    title: 'Inspect pump bearings',
    priority: 'high',
    state: 'todo',
    serverState: 'todo',
    dueAtMs: Date.now() + 86400000,
    cachedAtMs: Date.now(),
    updatedAtLocalMs: Date.now(),
    syncState: 'synced',
    ...overrides,
  };
}

function makeOrderRecord(overrides: Partial<MaintenanceOrderRecord> = {}): MaintenanceOrderRecord {
  return {
    id: 'order-100',
    tenantId: 'tenant-test',
    title: 'Preventive Overhaul',
    kind: 'preventive',
    state: 'in_progress',
    serverState: 'in_progress',
    scheduledStartMs: Date.now(),
    scheduledEndMs: Date.now() + 86400000,
    cachedAtMs: Date.now(),
    updatedAtLocalMs: Date.now(),
    syncState: 'synced',
    ...overrides,
  };
}

describe('T071 — startTask command', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-start-task-${Date.now()}-${Math.random()}`);
  });

  it('creates transition + geocheck evidence + exactly 1 mutation, all in one transaction', async () => {
    const task = makeTaskRecord();
    await db.tasks.add(task);

    const geoStamp = {
      latitude: 19.4326,
      longitude: -99.1332,
      accuracyM: 12.5,
      capturedAtIso: '2026-10-29T10:00:00.000Z',
      capturedAtMs: 1793268000000,
      status: 'ok' as const,
    };

    const result = await startTask(db, {
      taskId: task.id,
      geo: geoStamp,
      nowIso: '2026-10-29T10:00:00.000Z',
    });

    expect(result.state).toBe('in_progress');
    expect(result.mutationId).toBeDefined();

    // Verify task updated
    const updated = await db.tasks.get(task.id);
    expect(updated).toBeDefined();
    expect(updated!.state).toBe('in_progress');
    expect(updated!.startedAtLocalIso).toBe('2026-10-29T10:00:00.000Z');
    expect(updated!.geoStart).toEqual(geoStamp);
    expect(updated!.syncState).toBe('pending');

    // Verify historyJson contains transition
    expect(updated!.historyJson).toBeDefined();
    const history = JSON.parse(updated!.historyJson!);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromState: 'todo',
      toState: 'in_progress',
      action: 'start',
      geo: geoStamp,
    });

    // Verify outbox has exactly 1 mutation
    const mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      id: result.mutationId,
      aggregateType: 'task',
      aggregateId: task.id,
      operation: 'task.state',
      status: 'pending',
    });
    const body = JSON.parse(mutations[0].bodyJson!);
    expect(body.state).toBe('in_progress');
    expect(body.geo).toMatchObject(geoStamp);
  });

  it('blocks transition when parent maintenance order is not in_progress', async () => {
    const order = makeOrderRecord({ id: 'order-locked', state: 'scheduled' });
    const task = makeTaskRecord({
      id: 'task-child-locked',
      maintenanceOrderId: 'order-locked',
      maintenanceOrderState: 'scheduled',
    });

    await db.maintenance_orders.add(order);
    await db.tasks.add(task);

    await expect(
      startTask(db, { taskId: task.id }),
    ).rejects.toThrow(/Task transition locked/);

    // Verify no mutation was enqueued and task remained in todo
    const unchanged = await db.tasks.get(task.id);
    expect(unchanged!.state).toBe('todo');
    const mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(0);
  });
});

