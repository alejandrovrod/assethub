import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { startTask } from './start-task';
import { pauseTask } from './pause-task';
import type { TaskRecord } from '../db/schema';

function makeTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-coalesce-1',
    tenantId: 'tenant-test',
    assignedToId: 'user-1',
    title: 'Rapid transition test',
    priority: 'low',
    state: 'todo',
    serverState: 'todo',
    dueAtMs: Date.now() + 86400000,
    cachedAtMs: Date.now(),
    updatedAtLocalMs: Date.now(),
    syncState: 'synced',
    ...overrides,
  };
}

describe('T074 — commands coalesce transitions', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-coalesce-${Date.now()}-${Math.random()}`);
  });

  it('iniciar → pausar antes de enviar deja exactamente 1 mutación con estado final paused', async () => {
    const task = makeTaskRecord();
    await db.tasks.add(task);

    // 1. Iniciar tarea
    const startRes = await startTask(db, {
      taskId: task.id,
      nowIso: '2026-10-29T10:00:00.000Z',
    });
    expect(startRes.state).toBe('in_progress');

    // At this moment, 1 pending mutation exists
    let mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].operation).toBe('task.state');
    expect(JSON.parse(mutations[0].bodyJson!).state).toBe('in_progress');

    const originalMutationId = mutations[0].id;

    // 2. Pausar tarea antes de enviar (sin sincronización intermedia)
    const pauseRes = await pauseTask(db, {
      taskId: task.id,
      reason: 'Missing spare parts',
      nowIso: '2026-10-29T10:05:00.000Z',
    });
    expect(pauseRes.state).toBe('paused');

    // Coalescence rule: outbox still has EXACTLY 1 mutation, and its body is paused
    mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].id).toBe(originalMutationId); // Preserved idempotency key
    expect(mutations[0].status).toBe('pending');

    const payload = JSON.parse(mutations[0].bodyJson!);
    expect(payload.state).toBe('paused');
    expect(payload.reason).toBe('Missing spare parts');

    // Local task state is paused
    const updatedTask = await db.tasks.get(task.id);
    expect(updatedTask!.state).toBe('paused');

    // History preserved both start and pause steps
    const history = JSON.parse(updatedTask!.historyJson!);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      fromState: 'todo',
      toState: 'in_progress',
      action: 'start',
    });
    expect(history[1]).toMatchObject({
      fromState: 'in_progress',
      toState: 'paused',
      action: 'pause',
      reason: 'Missing spare parts',
    });
  });
});

