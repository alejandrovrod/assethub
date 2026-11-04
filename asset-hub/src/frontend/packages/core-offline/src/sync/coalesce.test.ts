import { describe, it, expect } from 'vitest';
import { coalesce } from './coalesce';
import type { OutboxMutation } from '../db/schema';

function makeMutation(
  overrides: Partial<OutboxMutation> & { id: string },
): OutboxMutation {
  return {
    tenantId: 'tenant-1',
    aggregateType: 'task',
    aggregateId: 'agg-1',
    operation: 'task.state',
    method: 'PATCH',
    path: '/api/v1/tasks/agg-1/state',
    status: 'pending',
    priority: 100,
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now(),
    ...overrides,
  };
}

describe('coalesce — task.state', () => {
  it('keeps only the latest state mutation, marks older ones discarded', () => {
    const m1 = makeMutation({ id: 'id-1', operation: 'task.state', createdAtMs: 1000 });
    const m2 = makeMutation({ id: 'id-2', operation: 'task.state', createdAtMs: 2000 });
    const m3 = makeMutation({ id: 'id-3', operation: 'task.state', createdAtMs: 3000 });

    let queue: OutboxMutation[] = [];
    queue = coalesce(queue, m1);
    queue = coalesce(queue, m2);
    queue = coalesce(queue, m3);

    const pending = queue.filter((m) => m.status === 'pending');
    const discarded = queue.filter((m) => m.status === 'discarded');

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('id-3');
    expect(discarded).toHaveLength(2);
    expect(discarded.map((m) => m.id).sort()).toEqual(['id-1', 'id-2']);
  });
});

describe('coalesce — task.checklist', () => {
  it('replaces previous checklist draft, marks older discarded', () => {
    const m1 = makeMutation({ id: 'id-1', operation: 'task.checklist', createdAtMs: 1000 });
    const m2 = makeMutation({ id: 'id-2', operation: 'task.checklist', createdAtMs: 2000 });

    let queue: OutboxMutation[] = [];
    queue = coalesce(queue, m1);
    queue = coalesce(queue, m2);

    const pending = queue.filter((m) => m.status === 'pending');
    const discarded = queue.filter((m) => m.status === 'discarded');

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('id-2');
    expect(discarded).toHaveLength(1);
    expect(discarded[0].id).toBe('id-1');
  });
});

describe('coalesce — incident.create', () => {
  it('never coalesces — both mutations are kept', () => {
    const m1 = makeMutation({
      id: 'id-1',
      aggregateType: 'incident',
      aggregateId: 'inc-1',
      operation: 'incident.create',
      createdAtMs: 1000,
    });
    const m2 = makeMutation({
      id: 'id-2',
      aggregateType: 'incident',
      aggregateId: 'inc-1',
      operation: 'incident.create',
      createdAtMs: 2000,
    });

    let queue: OutboxMutation[] = [];
    queue = coalesce(queue, m1);
    queue = coalesce(queue, m2);

    expect(queue).toHaveLength(2);
    expect(queue.every((m) => m.status === 'pending')).toBe(true);
  });
});

describe('coalesce — cross-aggregate isolation', () => {
  it('does not discard mutations for different aggregates', () => {
    const m1 = makeMutation({ id: 'id-1', aggregateId: 'agg-A', operation: 'task.state' });
    const m2 = makeMutation({ id: 'id-2', aggregateId: 'agg-B', operation: 'task.state' });

    let queue: OutboxMutation[] = [];
    queue = coalesce(queue, m1);
    queue = coalesce(queue, m2);

    expect(queue.every((m) => m.status === 'pending')).toBe(true);
    expect(queue).toHaveLength(2);
  });
});
