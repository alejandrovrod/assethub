import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { createDrainer, type HttpClient } from './drainer';
import type { OutboxMutation } from '../db/schema';
import { uuidv7 } from '../util/uuidv7';

describe('createDrainer (T046 / T047)', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-drainer-${Date.now()}-${Math.random()}`);
  });

  function createMutation(overrides: Partial<OutboxMutation> = {}): OutboxMutation {
    const id = overrides.id ?? uuidv7();
    return {
      id,
      tenantId: 'tenant-1',
      aggregateType: 'task',
      aggregateId: 'task-1',
      operation: 'task.state',
      method: 'POST',
      path: '/api/v1/work-tasks/state',
      bodyJson: JSON.stringify({ state: 'in_progress' }),
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: Date.now(),
      ...overrides,
    };
  }

  it('marks mutation as done and stores responseJson on 2xx', async () => {
    const mutation = createMutation();
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 200,
        body: { ok: true, taskId: 'task-1' },
        headers: {},
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('done');
    expect(stored?.responseJson).toBe(JSON.stringify({ ok: true, taskId: 'task-1' }));
    expect(stored?.leaseOwner).toBeUndefined();
    expect(stored?.attempts).toBe(1);
    expect(mockHttp.post).toHaveBeenCalledWith(
      '/api/v1/work-tasks/state',
      { state: 'in_progress' },
      expect.objectContaining({ idempotencyKey: mutation.id })
    );
  });

  it('refreshes token on 401 and retries once', async () => {
    const mutation = createMutation();
    await db.outbox_mutations.put(mutation);

    let attempts = 0;
    const mockHttp: HttpClient = {
      post: vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          const err = new Error('Unauthorized');
          (err as any).status = 401;
          throw err;
        }
        return { status: 200, body: { ok: true }, headers: {} };
      }),
      patch: vi.fn(),
      refreshToken: vi.fn().mockResolvedValue(undefined),
    };

    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    expect(mockHttp.refreshToken).toHaveBeenCalledTimes(1);
    expect(mockHttp.post).toHaveBeenCalledTimes(2);

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('done');
  });

  it('marks as discarded on 409 invalid_transition', async () => {
    const mutation = createMutation();
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 409,
        body: { code: 'invalid_transition', detail: 'State cannot transition' },
        headers: {},
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('discarded');
    expect(stored?.leaseOwner).toBeUndefined();
  });

  it('marks as blocked on 412 Precondition Failed (If-Match)', async () => {
    const mutation = createMutation({
      headersJson: JSON.stringify({ 'If-Match': '"old-etag"' }),
    });
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 412,
        body: { title: 'Precondition Failed' },
        headers: {},
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('blocked');
  });

  it('marks as dead on 422 Unprocessable Entity', async () => {
    const mutation = createMutation();
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 422,
        body: { errors: ['Title required'] },
        headers: {},
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('dead');
  });

  it('schedules retry with backoff on 500 error', async () => {
    const mutation = createMutation();
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 500,
        body: { title: 'Server Error' },
        headers: {},
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const now = Date.now();
    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.attempts).toBe(1);
    expect(stored?.nextAttemptAtMs).toBeGreaterThan(now);
  });

  it('respects Retry-After header on 503 response', async () => {
    const mutation = createMutation();
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 503,
        body: { title: 'Service Unavailable' },
        headers: { 'retry-after': '30' }, // 30 seconds
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const now = Date.now();
    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('pending');
    // should be at least 25 seconds in the future
    expect(stored?.nextAttemptAtMs).toBeGreaterThanOrEqual(now + 25_000);
  });

  it('marks mutation as dead after 8 attempts', async () => {
    const mutation = createMutation({ attempts: 7 });
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 500,
        body: { title: 'Server Error' },
        headers: {},
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(mutation.id);
    expect(stored?.status).toBe('dead');
    expect(stored?.attempts).toBe(8);
  });

  it('skips mutation if dependsOn is not done', async () => {
    const depMutation = createMutation({ status: 'pending' });
    const childMutation = createMutation({
      aggregateId: 'task-2',
      dependsOn: depMutation.id,
    });

    await db.outbox_mutations.bulkPut([depMutation, childMutation]);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 200,
        body: { ok: true },
        headers: {},
      }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    // First run processes depMutation
    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const storedDep = await db.outbox_mutations.get(depMutation.id);
    const storedChild = await db.outbox_mutations.get(childMutation.id);

    expect(storedDep?.status).toBe('done');
    // Child was skipped because dep was pending at the time of claim
    expect(storedChild?.status).toBe('pending');

    // Next run processes childMutation now that dep is done
    await drainer.drainOnce();
    const childAfter = await db.outbox_mutations.get(childMutation.id);
    expect(childAfter?.status).toBe('done');
  });

  it('recovers stale leases on drain start', async () => {
    const staleMutation = createMutation({
      status: 'in_flight',
      leaseOwner: 'dead-instance',
      leaseExpiresAtMs: Date.now() - 10_000, // expired 10s ago
    });
    await db.outbox_mutations.put(staleMutation);

    const mockHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({ status: 200, body: {}, headers: {} }),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };

    const drainer = createDrainer(db, mockHttp);
    await drainer.drainOnce();

    const stored = await db.outbox_mutations.get(staleMutation.id);
    expect(stored?.status).toBe('done');
  });

  // ── If-Match formatting ────────────────────────────────────────────────────
  //
  // El backend exige `If-Match` en PUT/PATCH versionados y responde 428 si falta.
  // La regla es: siempre viaja el header, entre comillas, y `*` cuando la mutación
  // no tiene versión previa (tarea creada offline, pull viejo, etc.).

  function mockForEtag(): { http: HttpClient; captured: Array<{ etag?: string }> } {
    const captured: Array<{ etag?: string }> = [];
    const record = async (_path: string, _body: unknown, opts?: { etag?: string }) => {
      captured.push({ etag: opts?.etag });
      return { status: 200, body: {}, headers: {} };
    };
    const http: HttpClient = {
      post: vi.fn().mockImplementation(record),
      patch: vi.fn().mockImplementation(record),
      refreshToken: vi.fn(),
    };
    // `put` no está en la interfaz HttpClient; el drainer lo detecta en runtime.
    (http as any).put = vi.fn().mockImplementation(record);
    return { http, captured };
  }

  it('sends If-Match: * when the mutation carries no version', async () => {
    const mutation = createMutation({ method: 'PUT', headersJson: undefined });
    await db.outbox_mutations.put(mutation);

    const { http, captured } = mockForEtag();
    await createDrainer(db, http).drainOnce();

    expect(captured).toHaveLength(1);
    expect(captured[0].etag).toBe('*');
  });

  it('quotes a bare version token', async () => {
    const mutation = createMutation({
      method: 'PUT',
      headersJson: JSON.stringify({ 'If-Match': 'AAAAAAAAD8E' }),
    });
    await db.outbox_mutations.put(mutation);

    const { http, captured } = mockForEtag();
    await createDrainer(db, http).drainOnce();

    expect(captured[0].etag).toBe('"AAAAAAAAD8E"');
  });

  it('keeps an already quoted version token as-is', async () => {
    const mutation = createMutation({
      method: 'PATCH',
      headersJson: JSON.stringify({ 'If-Match': '"AAAAAAAAD8E"' }),
    });
    await db.outbox_mutations.put(mutation);

    const { http, captured } = mockForEtag();
    await createDrainer(db, http).drainOnce();

    expect(captured[0].etag).toBe('"AAAAAAAAD8E"');
  });

  it('treats an empty If-Match as * instead of omitting the header', async () => {
    const mutation = createMutation({
      method: 'PUT',
      headersJson: JSON.stringify({ 'If-Match': '   ' }),
    });
    await db.outbox_mutations.put(mutation);

    const { http, captured } = mockForEtag();
    await createDrainer(db, http).drainOnce();

    expect(captured[0].etag).toBe('*');
  });

  // ── ETag routing ───────────────────────────────────────────────────────────
  //
  // La tarea y su checklist son dos filas con dos rowversion distintos. El drainer
  // agrupa ambas mutaciones bajo `aggregateType: 'task'`, así que tiene que elegir
  // en qué campo guardar el ETag de la respuesta.

  async function seedTask(): Promise<void> {
    await db.tasks.put({
      id: 'task-1',
      tenantId: 'tenant-1',
      assignedToId: 'user-1',
      title: 'Cambiar filtro',
      priority: 'medium',
      state: 'in_progress',
      serverState: 'in_progress',
      dueAtMs: 0,
      version: 'TASK-OLD',
      checklistVersion: 'CHK-OLD',
      cachedAtMs: Date.now(),
      updatedAtLocalMs: Date.now(),
      syncState: 'synced',
    });
  }

  it('stores the checklist response etag in checklistVersion, not in version', async () => {
    await seedTask();
    const mutation = createMutation({
      method: 'PUT',
      operation: 'task.checklist',
      path: '/api/v1/work-tasks/task-1/checklist',
      bodyJson: JSON.stringify({ responseJson: '{}' }),
      headersJson: JSON.stringify({ 'If-Match': 'CHK-OLD' }),
    });
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn(),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };
    (mockHttp as any).put = vi.fn().mockResolvedValue({
      status: 200,
      body: { taskId: 'task-1', etag: 'CHK-NEW' },
      headers: {},
    });

    await createDrainer(db, mockHttp).drainOnce();

    const task = await db.tasks.get('task-1');
    expect(task?.checklistVersion).toBe('CHK-NEW');
    expect(task?.version).toBe('TASK-OLD');
  });

  it('stores the task state response etag in version', async () => {
    await seedTask();
    const mutation = createMutation({
      method: 'PUT',
      operation: 'task.state',
      path: '/api/v1/work-tasks/task-1/state',
      bodyJson: JSON.stringify({ state: 'done' }),
      headersJson: JSON.stringify({ 'If-Match': 'TASK-OLD' }),
    });
    await db.outbox_mutations.put(mutation);

    const mockHttp: HttpClient = {
      post: vi.fn(),
      patch: vi.fn(),
      refreshToken: vi.fn(),
    };
    (mockHttp as any).put = vi.fn().mockResolvedValue({
      status: 200,
      body: { id: 'task-1', state: 'done', etag: 'TASK-NEW' },
      headers: {},
    });

    await createDrainer(db, mockHttp).drainOnce();

    const task = await db.tasks.get('task-1');
    expect(task?.version).toBe('TASK-NEW');
    expect(task?.checklistVersion).toBe('CHK-OLD');
  });
});

