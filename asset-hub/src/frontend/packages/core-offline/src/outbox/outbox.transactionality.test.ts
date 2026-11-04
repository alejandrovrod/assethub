import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { enqueue } from './outbox';
import type { OutboxMutation, TaskRecord } from '../db/schema';

// Fake-indexeddb is auto-installed via test/setup.ts

const VALID_V7_ID = '018f4e2b-6f3a-7a1c-8b2d-000000000001';

function makeTaskRecord(id: string): TaskRecord {
  return {
    id,
    tenantId: 'tenant-1',
    assignedToId: 'user-1',
    title: 'Test Task',
    priority: 'medium',
    state: 'todo',
    serverState: 'todo',
    dueAtMs: 0,
    cachedAtMs: Date.now(),
    updatedAtLocalMs: Date.now(),
    syncState: 'pending',
  };
}

function makeMutationInput(
  overrides: Partial<OutboxMutation> = {},
): Omit<OutboxMutation, 'id' | 'attempts' | 'nextAttemptAtMs' | 'createdAtMs'> & { id?: string } {
  return {
    tenantId: 'tenant-1',
    aggregateType: 'task',
    aggregateId: 'task-1',
    operation: 'task.state',
    method: 'PATCH',
    path: '/api/v1/tasks/task-1/state',
    status: 'pending',
    priority: 100,
    ...overrides,
  };
}

let testDb: FieldDatabase;

beforeEach(() => {
  // Each test gets a fresh database instance with a unique name (fake-indexeddb)
  testDb = createFieldDatabase(`test-outbox-${Date.now()}-${Math.random()}`);
});

describe('enqueue transactionality', () => {
  it('Test 1: writing a task + enqueueing in the same tx commits both', async () => {
    const taskId = 'task-commit-1';

    await testDb.transaction('rw', [testDb.tasks, testDb.outbox_mutations], async (tx) => {
      await tx.table('tasks').add(makeTaskRecord(taskId));
      await enqueue(tx, makeMutationInput({ aggregateId: taskId }));
    });

    const task = await testDb.tasks.get(taskId);
    const mutations = await testDb.outbox_mutations.toArray();

    expect(task).toBeDefined();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].aggregateId).toBe(taskId);
  });

  it('Test 2: enqueue with invalid id rolls back both task write and mutation', async () => {
    const taskId = 'task-rollback-2';

    await expect(
      testDb.transaction('rw', [testDb.tasks, testDb.outbox_mutations], async (tx) => {
        await tx.table('tasks').add(makeTaskRecord(taskId));
        // Invalid id — not a UUIDv7 → should throw → both rolled back
        await enqueue(tx, makeMutationInput({ id: 'not-a-valid-uuid', aggregateId: taskId }));
      }),
    ).rejects.toThrow();

    const task = await testDb.tasks.get(taskId);
    const mutations = await testDb.outbox_mutations.toArray();

    expect(task).toBeUndefined();
    expect(mutations).toHaveLength(0);
  });

  it('Test 3: enqueue alone with invalid id → nothing written', async () => {
    await expect(
      testDb.transaction('rw', [testDb.outbox_mutations], async (tx) => {
        await enqueue(tx, makeMutationInput({ id: 'bad-id', aggregateId: 'task-x' }));
      }),
    ).rejects.toThrow();

    const mutations = await testDb.outbox_mutations.toArray();
    expect(mutations).toHaveLength(0);
  });

  it('accepts a valid UUIDv7 id and stores it', async () => {
    await testDb.transaction('rw', [testDb.outbox_mutations], async (tx) => {
      await enqueue(tx, makeMutationInput({ id: VALID_V7_ID }));
    });

    const mutation = await testDb.outbox_mutations.get(VALID_V7_ID);
    expect(mutation).toBeDefined();
    expect(mutation?.id).toBe(VALID_V7_ID);
  });

  it('generates a UUIDv7 id when none is provided', async () => {
    let generatedId: string | undefined;

    await testDb.transaction('rw', [testDb.outbox_mutations], async (tx) => {
      generatedId = await enqueue(tx, makeMutationInput());
    });

    expect(generatedId).toBeDefined();
    const mutation = await testDb.outbox_mutations.get(generatedId!);
    expect(mutation).toBeDefined();
  });

  it('throws when called outside a transaction', async () => {
    // Simulate a fake inactive transaction
    const fakeTx = { active: false, table: () => null } as unknown as import('dexie').Transaction;
    await expect(enqueue(fakeTx, makeMutationInput())).rejects.toThrow(
      'enqueue must be called within an active Dexie transaction',
    );
  });
});
