import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { createDrainer, type HttpClient } from './drainer';
import type { OutboxMutation } from '../db/schema';
import { uuidv7 } from '../util/uuidv7';

describe('drainer idempotency (T048)', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-idempotency-${Date.now()}-${Math.random()}`);
  });

  it('guarantees identical Idempotency-Key across multiple retry attempts without duplicates', async () => {
    const fixedId = uuidv7();
    const mutation: OutboxMutation = {
      id: fixedId,
      tenantId: 'tenant-1',
      aggregateType: 'task',
      aggregateId: 'task-100',
      operation: 'task.state',
      method: 'POST',
      path: '/api/v1/work-tasks/state',
      bodyJson: JSON.stringify({ state: 'in_progress' }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: Date.now(),
    };
    await db.outbox_mutations.put(mutation);

    const capturedKeys: string[] = [];
    let callCount = 0;

    const mockHttp: HttpClient = {
      post: vi.fn().mockImplementation(async (_path, _body, opts) => {
        capturedKeys.push(opts?.idempotencyKey);
        callCount++;
        if (callCount < 3) {
          // Fail the first 2 calls with 503
          return { status: 503, body: { error: 'Temporarily unavailable' }, headers: {} };
        }
        // 3rd call succeeds
        return { status: 200, body: { ok: true, replay: false }, headers: {} };
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);

    // Run 1: fails (503) -> attempts = 1, nextAttemptAtMs updated
    await drainer.drainOnce();
    expect(callCount).toBe(1);

    // Reset nextAttemptAtMs to 0 so drainer can re-claim immediately for test
    await db.outbox_mutations.update(fixedId, { nextAttemptAtMs: 0 });

    // Run 2: fails (503) -> attempts = 2
    await drainer.drainOnce();
    expect(callCount).toBe(2);

    // Reset again
    await db.outbox_mutations.update(fixedId, { nextAttemptAtMs: 0 });

    // Run 3: succeeds (200)
    await drainer.drainOnce();
    expect(callCount).toBe(3);

    // Invariant: all 3 attempts sent the EXACT SAME idempotency key (mutation.id)
    expect(capturedKeys).toEqual([fixedId, fixedId, fixedId]);

    // Mutation is marked done exactly once, not duplicated
    const count = await db.outbox_mutations.where('id').equals(fixedId).count();
    expect(count).toBe(1);

    const stored = await db.outbox_mutations.get(fixedId);
    expect(stored?.status).toBe('done');
    expect(stored?.attempts).toBe(3);
  });

  it('rotates the mutation id on 409 idempotency_key_reuse so the retry is not poisoned', async () => {
    const poisonedId = uuidv7();
    const mutation: OutboxMutation = {
      id: poisonedId,
      tenantId: 'tenant-1',
      aggregateType: 'task',
      aggregateId: 'task-200',
      operation: 'task.state',
      method: 'PUT',
      path: '/api/v1/work-tasks/task-200/state',
      bodyJson: JSON.stringify({ state: 'done' }),
      headersJson: JSON.stringify({ 'If-Match': '"etag-1"' }),
      status: 'pending',
      priority: 100,
      attempts: 2,
      nextAttemptAtMs: 0,
      createdAtMs: Date.now(),
    };
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn(),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };
    // No `put` on the mock: the drainer falls back to post and still forwards the etag.
    (mockHttp as any).put = vi.fn().mockResolvedValue({
      status: 409,
      body: { code: 'idempotency_key_reuse', detail: 'Key reused with a different payload' },
      headers: {},
    });

    await createDrainer(db, mockHttp).drainOnce();

    // The poisoned row is gone; exactly one replacement exists.
    expect(await db.outbox_mutations.get(poisonedId)).toBeUndefined();
    const all = await db.outbox_mutations.toArray();
    expect(all).toHaveLength(1);

    const rotated = all[0];
    expect(rotated.id).not.toBe(poisonedId);
    expect(rotated.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // Same intent, fresh key, retryable.
    expect(rotated.status).toBe('pending');
    expect(rotated.attempts).toBe(0);
    expect(rotated.path).toBe(mutation.path);
    expect(rotated.bodyJson).toBe(mutation.bodyJson);
    expect(rotated.headersJson).toBe(mutation.headersJson);

    // Not claimable in the same cycle: otherwise drain() would hot-loop on the 409.
    expect(rotated.nextAttemptAtMs).toBeGreaterThan(Date.now());
  });
});

