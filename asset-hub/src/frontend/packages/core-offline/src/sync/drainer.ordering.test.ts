import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { createDrainer, type HttpClient } from './drainer';
import type { OutboxMutation } from '../db/schema';
import { uuidv7 } from '../util/uuidv7';

describe('drainer ordering (T049)', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-ordering-${Date.now()}-${Math.random()}`);
  });

  it('guarantees strict FIFO delivery per aggregate and enables parallel delivery across different aggregates', async () => {
    const now = Date.now();

    // 3 mutations for Aggregate A (task-A)
    const m_A1: OutboxMutation = {
      id: uuidv7(),
      tenantId: 'tenant-1',
      aggregateType: 'task',
      aggregateId: 'task-A',
      operation: 'task.state',
      method: 'POST',
      path: '/api/v1/work-tasks/state',
      bodyJson: JSON.stringify({ seq: 'A1' }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: now + 1,
    };

    const m_A2: OutboxMutation = {
      id: uuidv7(),
      tenantId: 'tenant-1',
      aggregateType: 'task',
      aggregateId: 'task-A',
      operation: 'task.checklist',
      method: 'POST',
      path: '/api/v1/work-tasks/checklist',
      bodyJson: JSON.stringify({ seq: 'A2' }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: now + 2,
    };

    const m_A3: OutboxMutation = {
      id: uuidv7(),
      tenantId: 'tenant-1',
      aggregateType: 'task',
      aggregateId: 'task-A',
      operation: 'task.state',
      method: 'POST',
      path: '/api/v1/work-tasks/state',
      bodyJson: JSON.stringify({ seq: 'A3' }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: now + 3,
    };

    // 2 mutations for Aggregate B (order-B)
    const m_B1: OutboxMutation = {
      id: uuidv7(),
      tenantId: 'tenant-1',
      aggregateType: 'order',
      aggregateId: 'order-B',
      operation: 'order.state',
      method: 'POST',
      path: '/api/v1/orders/state',
      bodyJson: JSON.stringify({ seq: 'B1' }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: now + 1,
    };

    const m_B2: OutboxMutation = {
      id: uuidv7(),
      tenantId: 'tenant-1',
      aggregateType: 'order',
      aggregateId: 'order-B',
      operation: 'order.properties',
      method: 'POST',
      path: '/api/v1/orders/properties',
      bodyJson: JSON.stringify({ seq: 'B2' }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: now + 2,
    };

    await db.outbox_mutations.bulkPut([m_A1, m_A2, m_A3, m_B1, m_B2]);

    const executionOrder: string[] = [];
    const mockHttp: HttpClient = {
      post: vi.fn().mockImplementation(async (_path, body) => {
        executionOrder.push(body.seq);
        return { status: 200, body: { ok: true }, headers: {} };
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);

    // Iteration 1: Claims 1 from A (A1) and 1 from B (B1) in parallel
    await drainer.drainOnce();
    // A1 and B1 executed
    expect(executionOrder).toContain('A1');
    expect(executionOrder).toContain('B1');
    expect(executionOrder).not.toContain('A2');
    expect(executionOrder).not.toContain('B2');

    // Iteration 2: Claims next from A (A2) and next from B (B2)
    await drainer.drainOnce();
    expect(executionOrder).toContain('A2');
    expect(executionOrder).toContain('B2');
    expect(executionOrder).not.toContain('A3');

    // Iteration 3: Claims next from A (A3)
    await drainer.drainOnce();
    expect(executionOrder).toContain('A3');

    // Intra-aggregate ordering for A: A1 -> A2 -> A3 strictly
    const indexA1 = executionOrder.indexOf('A1');
    const indexA2 = executionOrder.indexOf('A2');
    const indexA3 = executionOrder.indexOf('A3');
    expect(indexA1).toBeLessThan(indexA2);
    expect(indexA2).toBeLessThan(indexA3);

    // Intra-aggregate ordering for B: B1 -> B2 strictly
    const indexB1 = executionOrder.indexOf('B1');
    const indexB2 = executionOrder.indexOf('B2');
    expect(indexB1).toBeLessThan(indexB2);
  });
});

