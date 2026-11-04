import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { completeTask, ChecklistIncompleteError } from './complete-task';
import type { TaskRecord } from '../db/schema';

const SAMPLE_SCHEMA = JSON.stringify({
  type: 'object',
  required: ['pressurePsi', 'leakFound'],
  properties: {
    pressurePsi: { type: 'number', title: 'Pressure (PSI)' },
    leakFound: { type: 'boolean', title: 'Leak detected?' },
    notes: { type: 'string', title: 'Additional notes' },
  },
});

function makeTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-comp-100',
    tenantId: 'tenant-test',
    assignedToId: 'user-1',
    title: 'Pressure Test Checklist',
    priority: 'high',
    state: 'in_progress',
    serverState: 'in_progress',
    dueAtMs: Date.now() + 86400000,
    cachedAtMs: Date.now(),
    updatedAtLocalMs: Date.now(),
    syncState: 'pending',
    checklistSchemaJson: SAMPLE_SCHEMA,
    checklistVersion: '"v1"',
    ...overrides,
  };
}

describe('T073 — completeTask command', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-complete-task-${Date.now()}-${Math.random()}`);
  });

  it('incomplete checklist blocks completion and throws ChecklistIncompleteError with missing fields', async () => {
    // Only 1 of 2 required fields answered
    const task = makeTaskRecord({
      checklistDraftJson: JSON.stringify({ pressurePsi: 45.2 }), // missing leakFound
    });
    await db.tasks.add(task);

    await expect(completeTask(db, { taskId: task.id })).rejects.toThrow(ChecklistIncompleteError);

    // Verify task is still in_progress and nothing enqueued in outbox
    const unchanged = await db.tasks.get(task.id);
    expect(unchanged!.state).toBe('in_progress');
    const mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(0);
  });

  it('completed checklist enqueues exactly 2 mutations: checklist + state in one transaction', async () => {
    const task = makeTaskRecord({
      checklistDraftJson: JSON.stringify({ pressurePsi: 45.2, leakFound: false }),
    });
    await db.tasks.add(task);

    const geoStamp = {
      latitude: 19.4326,
      longitude: -99.1332,
      accuracyM: 8.0,
      capturedAtIso: '2026-10-29T10:30:00.000Z',
      capturedAtMs: 1793269800000,
      status: 'ok' as const,
    };

    const result = await completeTask(db, {
      taskId: task.id,
      geo: geoStamp,
      nowIso: '2026-10-29T10:30:00.000Z',
    });

    expect(result.state).toBe('done');
    expect(result.stateMutationId).toBeDefined();
    expect(result.checklistMutationId).toBeDefined();

    // Verify task state and fields
    const updated = await db.tasks.get(task.id);
    expect(updated!.state).toBe('done');
    expect(updated!.completedAtLocalIso).toBe('2026-10-29T10:30:00.000Z');
    expect(updated!.checklistResponseJson).toBe(task.checklistDraftJson);
    expect(updated!.geoEnd).toEqual(geoStamp);

    // Verify exactly 2 mutations in outbox
    const mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(2);

    const checklistMutation = mutations.find((m) => m.operation === 'task.checklist');
    expect(checklistMutation).toBeDefined();
    expect(checklistMutation!.path).toBe(`/api/v1/work-tasks/${task.id}/checklist`);
    expect(JSON.parse(checklistMutation!.bodyJson!)).toEqual({
      responseJson: task.checklistDraftJson,
    });
    expect(JSON.parse(checklistMutation!.headersJson!)).toEqual({
      'If-Match': '"v1"',
    });

    const stateMutation = mutations.find((m) => m.operation === 'task.state');
    expect(stateMutation).toBeDefined();
    expect(stateMutation!.path).toBe(`/api/v1/work-tasks/${task.id}/state`);
    expect(JSON.parse(stateMutation!.bodyJson!)).toMatchObject({
      state: 'done',
      geo: geoStamp,
    });
  });

  it('task without checklist enqueues only 1 mutation (state)', async () => {
    const task = makeTaskRecord({
      id: 'task-no-checklist',
      checklistSchemaJson: undefined,
      checklistDraftJson: undefined,
    });
    await db.tasks.add(task);

    const result = await completeTask(db, { taskId: task.id });
    expect(result.state).toBe('done');
    expect(result.checklistMutationId).toBeUndefined();

    const mutations = await db.outbox_mutations.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].operation).toBe('task.state');
  });
});

