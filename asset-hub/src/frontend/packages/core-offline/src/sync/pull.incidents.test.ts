import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { HttpClient } from '../transport/http-client';
import { pullIncidents, reconcileIncidentCreates } from './pull';
import type { IncidentRecord, OutboxMutation } from '../db/schema';

const BASE = 'http://pull-incidents-test.local';
const TENANT = 'tenant-1';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let db: FieldDatabase;
let client: HttpClient;

beforeEach(() => {
  db = createFieldDatabase(`test-pull-incidents-${Date.now()}-${Math.random()}`);
  client = new HttpClient({ baseUrl: BASE, getAccessToken: async () => 'test-token' });
});

function incident(overrides: Partial<IncidentRecord> & { id: string }): IncidentRecord {
  return {
    tenantId: TENANT,
    title: 'Incidencia',
    description: '',
    severity: 'medium',
    affectsOperation: false,
    geoStatus: 'unavailable',
    photoIds: [],
    reportedByUserId: '',
    createdAtLocalIso: '2026-11-06T02:38:33.000Z',
    createdAtLocalMs: Date.parse('2026-11-06T02:38:33.000Z'),
    syncState: 'synced',
    cachedAtMs: Date.now(),
    ...overrides,
  };
}

function mutation(overrides: Partial<OutboxMutation> & { id: string; aggregateId: string }): OutboxMutation {
  return {
    tenantId: TENANT,
    aggregateType: 'incident',
    operation: 'incident.create',
    method: 'POST',
    path: '/api/v1/incidents',
    status: 'done',
    priority: 100,
    attempts: 1,
    nextAttemptAtMs: 0,
    createdAtMs: Date.parse('2026-11-06T02:38:33.000Z'),
    ...overrides,
  };
}

/** The server returns an empty "assigned to me" page. */
function mockEmptyIncidentFeed() {
  server.use(
    http.get(`${BASE}/api/v1/incidents`, () =>
      HttpResponse.json({ items: [], totalCount: 0 }),
    ),
  );
}

describe('pullIncidents — pruning', () => {
  it('keeps an incident this device created even though it is not assigned to the user', async () => {
    const local = incident({ id: 'c307c009-572d-4fe5-aebb-c7dace5a8643', origin: 'local' });
    await db.incidents.put(local);
    mockEmptyIncidentFeed();

    await pullIncidents(db, client, TENANT);

    const kept = await db.incidents.get(local.id);
    expect(kept).toBeDefined();
    expect(kept?.title).toBe('Incidencia');
  });

  it('still prunes a synced incident the server no longer returns', async () => {
    await db.incidents.put(incident({ id: 'reassigned-001' }));
    mockEmptyIncidentFeed();

    await pullIncidents(db, client, TENANT);

    expect(await db.incidents.get('reassigned-001')).toBeUndefined();
  });

  it('does not prune a pending local row', async () => {
    await db.incidents.put(incident({ id: 'pending-001', syncState: 'pending' }));
    mockEmptyIncidentFeed();

    await pullIncidents(db, client, TENANT);

    expect(await db.incidents.get('pending-001')).toBeDefined();
  });

  it('keeps the local origin when the server does return the row', async () => {
    const id = 'assigned-later-001';
    await db.incidents.put(incident({ id, origin: 'local' }));
    server.use(
      http.get(`${BASE}/api/v1/incidents`, () =>
        HttpResponse.json({
          items: [{ id, title: 'Actualizada', state: 'in_progress', createdAt: '2026-11-06T02:38:33Z' }],
          totalCount: 1,
        }),
      ),
    );

    await pullIncidents(db, client, TENANT);

    const row = await db.incidents.get(id);
    expect(row?.origin).toBe('local');
    expect(row?.title).toBe('Actualizada');
  });
});

describe('reconcileIncidentCreates', () => {
  it('moves the local row to the id the server generated', async () => {
    const localId = 'local-uuid-001';
    const serverId = 'c307c009-572d-4fe5-aebb-c7dace5a8643';
    await db.incidents.put(incident({ id: localId, syncState: 'synced' }));
    await db.outbox_mutations.put(
      mutation({
        id: 'mut-1',
        aggregateId: localId,
        bodyJson: JSON.stringify({ title: 'hay un perro ahi tirado', assetId: 'asset-1' }),
        responseJson: JSON.stringify({ id: serverId }),
      }),
    );

    const repaired = await reconcileIncidentCreates(db, TENANT);

    expect(repaired).toBe(1);
    expect(await db.incidents.get(localId)).toBeUndefined();
    const moved = await db.incidents.get(serverId);
    expect(moved?.origin).toBe('local');
    expect(moved?.title).toBe('Incidencia');
  });

  it('rebuilds the row when the pull already pruned it', async () => {
    const serverId = 'c307c009-572d-4fe5-aebb-c7dace5a8643';
    await db.outbox_mutations.put(
      mutation({
        id: 'mut-2',
        aggregateId: 'local-uuid-002',
        bodyJson: JSON.stringify({
          title: 'hay un perro ahi tirado',
          description: 'frente al porton',
          assetId: '66B4E578-51FF-4086-B7F8-571C47A115A0',
          photoIds: ['photo-1'],
        }),
        responseJson: JSON.stringify({ id: serverId }),
      }),
    );

    const repaired = await reconcileIncidentCreates(db, TENANT);

    expect(repaired).toBe(1);
    const rebuilt = await db.incidents.get(serverId);
    expect(rebuilt).toMatchObject({
      id: serverId,
      origin: 'local',
      title: 'hay un perro ahi tirado',
      description: 'frente al porton',
      assetId: '66B4E578-51FF-4086-B7F8-571C47A115A0',
      photoIds: ['photo-1'],
      syncState: 'synced',
    });
  });

  it('keeps the server copy when it already exists and drops the duplicate', async () => {
    const localId = 'local-uuid-003';
    const serverId = 'server-uuid-003';
    await db.incidents.put(incident({ id: localId }));
    await db.incidents.put(incident({ id: serverId, title: 'Server copy', state: 'in_progress' }));
    await db.outbox_mutations.put(
      mutation({
        id: 'mut-3',
        aggregateId: localId,
        responseJson: JSON.stringify({ id: serverId }),
      }),
    );

    await reconcileIncidentCreates(db, TENANT);

    expect(await db.incidents.get(localId)).toBeUndefined();
    const kept = await db.incidents.get(serverId);
    expect(kept?.title).toBe('Server copy');
    expect(kept?.state).toBe('in_progress');
    expect(kept?.origin).toBe('local');
  });

  it('remaps mutations still queued for the old id', async () => {
    const localId = 'local-uuid-004';
    const serverId = 'server-uuid-004';
    await db.incidents.put(incident({ id: localId }));
    await db.outbox_mutations.put(
      mutation({ id: 'mut-4', aggregateId: localId, responseJson: JSON.stringify({ id: serverId }) }),
    );
    await db.outbox_mutations.put(
      mutation({
        id: 'mut-5',
        aggregateId: localId,
        operation: 'incident.state',
        method: 'PUT',
        path: `/api/v1/incidents/${localId}/state`,
        status: 'pending',
        responseJson: undefined,
      }),
    );

    await reconcileIncidentCreates(db, TENANT);

    const queued = await db.outbox_mutations.get('mut-5');
    expect(queued?.aggregateId).toBe(serverId);
    expect(queued?.path).toBe(`/api/v1/incidents/${serverId}/state`);
  });

  it('runs once per device', async () => {
    const serverId = 'server-uuid-005';
    await db.outbox_mutations.put(
      mutation({
        id: 'mut-6',
        aggregateId: 'local-uuid-005',
        bodyJson: JSON.stringify({ title: 'una vez' }),
        responseJson: JSON.stringify({ id: serverId }),
      }),
    );

    expect(await reconcileIncidentCreates(db, TENANT)).toBe(1);
    await db.incidents.delete(serverId);
    expect(await reconcileIncidentCreates(db, TENANT)).toBe(0);
    expect(await db.incidents.get(serverId)).toBeUndefined();
  });

  it('ignores creates whose id already matches', async () => {
    const id = 'same-uuid-006';
    await db.incidents.put(incident({ id }));
    await db.outbox_mutations.put(
      mutation({ id: 'mut-7', aggregateId: id, responseJson: JSON.stringify({ id }) }),
    );

    expect(await reconcileIncidentCreates(db, TENANT)).toBe(0);
    expect(await db.incidents.get(id)).toBeDefined();
  });
});
