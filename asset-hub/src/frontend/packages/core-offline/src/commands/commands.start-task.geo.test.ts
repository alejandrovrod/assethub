import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { startTask } from './start-task';
import type { TaskRecord } from '../db/schema';

function makeTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-geo-100',
    tenantId: 'tenant-test',
    assignedToId: 'user-1',
    title: 'Check electrical cabinet',
    priority: 'medium',
    state: 'todo',
    serverState: 'todo',
    dueAtMs: Date.now() + 86400000,
    cachedAtMs: Date.now(),
    updatedAtLocalMs: Date.now(),
    syncState: 'synced',
    ...overrides,
  };
}

describe('T072 — startTask geolocation fallback', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-start-geo-${Date.now()}-${Math.random()}`);
  });

  it('permission denied sets geoStatus to denied/unavailable and does NOT block execution', async () => {
    const task = makeTaskRecord();
    await db.tasks.add(task);

    // Geolocation denied by user
    const deniedGeo = {
      latitude: 0,
      longitude: 0,
      accuracyM: 0,
      capturedAtIso: '2026-10-29T10:05:00.000Z',
      capturedAtMs: Date.now(),
      status: 'denied' as const,
    };

    const result = await startTask(db, {
      taskId: task.id,
      geo: deniedGeo,
    });

    expect(result.state).toBe('in_progress');
    expect(result.geo.status).toBe('denied');

    // Task state is in_progress
    const updated = await db.tasks.get(task.id);
    expect(updated).toBeDefined();
    expect(updated!.state).toBe('in_progress');
    expect(updated!.geoStart?.status).toBe('denied');

    // Outbox mutation enqueued without blocking
    const mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].operation).toBe('task.state');
  });

  it('null or unavailable geolocation falls back to unavailable status without blocking', async () => {
    const task = makeTaskRecord({ id: 'task-geo-null' });
    await db.tasks.add(task);

    const result = await startTask(db, {
      taskId: task.id,
      geo: null,
    });

    expect(result.state).toBe('in_progress');
    expect(result.geo.status).toBe('unavailable');

    const updated = await db.tasks.get(task.id);
    expect(updated!.state).toBe('in_progress');
    expect(updated!.geoStart?.status).toBe('unavailable');

    const mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(1);
  });
});

