import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { HttpClient } from '../transport/http-client';
import { needsAssetCatalogRefresh, pullAssets, pullDelta, pullTasks } from './pull';
import type { TaskRecord } from '../db/schema';

const BASE = 'http://pull-test.local';

// ── Shared task fixture ───────────────────────────────────────────────────────

const TASK_ID = 'task-server-001';

const serverTask = {
  id: TASK_ID,
  tenantId: 'tenant-1',
  assignedToId: 'user-1',
  title: 'Server Task',
  priority: 'high',
  state: 'done',       // Different from local 'in_progress'
  serverState: 'done',
  dueAtMs: 0,
  cachedAtMs: 0,
  updatedAtLocalMs: 0,
  syncState: 'synced',
  updatedAt: '2026-01-02T00:00:00Z',
};

const localTaskBase: TaskRecord = {
  id: TASK_ID,
  tenantId: 'tenant-1',
  assignedToId: 'user-1',
  title: 'Local Task',
  priority: 'medium',
  state: 'in_progress', // locally modified
  serverState: 'todo',
  dueAtMs: 0,
  cachedAtMs: Date.now(),
  updatedAtLocalMs: Date.now(),
  syncState: 'pending', // locally pending
};

// ── MSW server ────────────────────────────────────────────────────────────────

let mockTasks: unknown[] = [serverTask];

const server = setupServer(
    http.get(`${BASE}/api/v1/work-tasks/changes`, () => {
      return HttpResponse.json({ data: mockTasks, nextCursor: 'cursor-001' });
    }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── Test DB & client ──────────────────────────────────────────────────────────

let testDb: FieldDatabase;
let client: HttpClient;

beforeEach(() => {
  testDb = createFieldDatabase(`test-pull-${Date.now()}-${Math.random()}`);
  client = new HttpClient({
    baseUrl: BASE,
    getAccessToken: async () => 'test-token',
  });
  mockTasks = [serverTask];
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('pullDelta — tasks', () => {
  it('Scenario 1: local task syncState=pending + server returns different state → conflict, local NOT overwritten', async () => {
    // Seed a local pending task
    await testDb.tasks.put({ ...localTaskBase, syncState: 'pending' });

    const result = await pullDelta('tasks', testDb, client);

    expect(result.fetched).toBe(1);
    expect(result.conflicts).toBe(1);

    // Local record must NOT be overwritten
    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.state).toBe('in_progress');   // local state preserved
    expect(local?.syncState).toBe('conflict');   // marked as conflict
  });

  it('Scenario 2: local task syncState=synced + server update → overwritten', async () => {
    // Seed a local synced task
    await testDb.tasks.put({
      ...localTaskBase,
      state: 'todo',
      syncState: 'synced',
    });

    const result = await pullDelta('tasks', testDb, client);

    expect(result.fetched).toBe(1);
    expect(result.conflicts).toBe(0);

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.state).toBe('done');          // updated from server
    expect(local?.syncState).toBe('synced');
  });

  it('stores the cursor in sync_meta after pull', async () => {
    const result = await pullDelta('tasks', testDb, client);
    expect(result.cursor).toBe('cursor-001');

    const meta = await testDb.sync_meta.get('pull:cursor:tasks');
    expect(meta?.value).toBe('cursor-001');
  });

  it('handles empty data array gracefully', async () => {
    server.use(
        http.get(`${BASE}/api/v1/work-tasks/changes`, () => {
          return HttpResponse.json({ data: [] });
        }),
    );

    const result = await pullDelta('tasks', testDb, client);
    expect(result.fetched).toBe(0);
    expect(result.conflicts).toBe(0);
  });

  it('persists the server etag as the task version', async () => {
    server.use(
      http.get(`${BASE}/api/v1/work-tasks/changes`, () =>
        HttpResponse.json({
          data: [{ ...serverTask, etag: 'AAAAAAAAD8E' }],
          nextCursor: 'cursor-001',
        }),
      ),
    );

    await pullDelta('tasks', testDb, client);

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.version).toBe('AAAAAAAAD8E');
  });
});

describe('pullTasks — etag persistence', () => {
  it('stores the list etag as the task version so the first If-Match is not empty', async () => {
    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () =>
        HttpResponse.json({
          items: [
            {
              id: TASK_ID,
              title: 'Server Task',
              state: 'todo',
              etag: 'AAAAAAAAD8E',
            },
          ],
        }),
      ),
    );

    const result = await pullTasks(testDb, client, 'tenant-1');

    expect(result.fetched).toBe(1);
    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.version).toBe('AAAAAAAAD8E');
    expect(local?.syncState).toBe('synced');
  });

  it('keeps the previous version when the server omits the etag', async () => {
    await testDb.tasks.put({ ...localTaskBase, version: 'OLD', syncState: 'synced' });

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () =>
        HttpResponse.json({
          items: [{ id: TASK_ID, title: 'Server Task', state: 'todo' }],
        }),
      ),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.version).toBe('OLD');
  });

  it('derives assignedToId from propertiesJson, not from assignedEmployeeId', async () => {
    const PROP_OWNER = '848c1db9-5844-4f19-889e-6229b0db5d2e';
    const COLUMN_OWNER = 'adcdf4de-88f2-47ed-a362-5d226f1704ad';

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () =>
        HttpResponse.json({
          items: [
            {
              id: TASK_ID,
              title: 'Assigned through the properties',
              state: 'todo',
              assignedEmployeeId: COLUMN_OWNER,
              propertiesJson: JSON.stringify({ asignar_a: PROP_OWNER }),
            },
          ],
        }),
      ),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.assignedToId).toBe(PROP_OWNER);
    // The column value must not win over the properties.
    expect(local?.assignedEmployeeId).toBe(PROP_OWNER);
  });

  it('keeps a task with no column assignee but a properties executor', async () => {
    const PROP_OWNER = '848c1db9-5844-4f19-889e-6229b0db5d2e';

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () =>
        HttpResponse.json({
          items: [
            {
              id: TASK_ID,
              title: 'No column assignee',
              state: 'todo',
              assignedEmployeeId: null,
              propertiesJson: JSON.stringify({ asignar_a: PROP_OWNER }),
            },
          ],
        }),
      ),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.assignedToId).toBe(PROP_OWNER);
    expect(local?.assignedEmployeeId).toBe(PROP_OWNER);
  });

  it('does not assign a task whose properties only declare a follower', async () => {
    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () =>
        HttpResponse.json({
          items: [
            {
              id: TASK_ID,
              title: 'Alejandro only follows up',
              state: 'todo',
              assignedEmployeeId: 'adcdf4de-88f2-47ed-a362-5d226f1704ad',
              propertiesJson: JSON.stringify({ reportar_a: '848c1db9-5844-4f19-889e-6229b0db5d2e' }),
            },
          ],
        }),
      ),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    // The column must not win when the properties exist and declare no executor.
    expect(local?.assignedToId).toBe('');
    expect(local?.assignedEmployeeId).toBeUndefined();
  });

  it('falls back to the column only for rows without properties', async () => {
    const COLUMN_OWNER = 'adcdf4de-88f2-47ed-a362-5d226f1704ad';

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () =>
        HttpResponse.json({
          items: [
            {
              id: TASK_ID,
              title: 'Legacy row',
              state: 'todo',
              assignedEmployeeId: COLUMN_OWNER,
            },
          ],
        }),
      ),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.assignedToId).toBe(COLUMN_OWNER);
  });
});

// ── Checklist pull ────────────────────────────────────────────────────────────
//
// La lista de tareas trae `hasChecklist` + `checklistEtag` (un join), y el
// formulario se pide aparte sólo cuando hace falta. Sin esto el cliente de campo
// manda `If-Match: *` al guardar el checklist, que es exactamente el bug que
// estamos cerrando.

const CHECKLIST_BODY = {
  taskId: TASK_ID,
  schemaJson: '{"type":"object","properties":{"ok":{"type":"boolean"}}}',
  uiSchemaJson: '{"ui:order":["ok"]}',
  responseJson: '{"ok":true}',
  state: 'submitted',
  version: 2,
  etag: 'CHK-1',
};

describe('pullTasks — checklist snapshot', () => {
  function taskWithChecklist(overrides: Record<string, unknown> = {}) {
    return {
      id: TASK_ID,
      title: 'Server Task',
      state: 'todo',
      etag: 'TASK-1',
      hasChecklist: true,
      checklistEtag: 'CHK-1',
      ...overrides,
    };
  }

  it('fetches the checklist for tasks that have one and no cached schema', async () => {
    let checklistCalls = 0;
    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () => HttpResponse.json({ items: [taskWithChecklist()] })),
      http.get(`${BASE}/api/v1/work-tasks/:taskId/checklist`, ({ params }) => {
        checklistCalls++;
        expect(params.taskId).toBe(TASK_ID);
        return HttpResponse.json(CHECKLIST_BODY);
      }),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    expect(checklistCalls).toBe(1);
    expect(local?.hasChecklist).toBe(true);
    expect(local?.checklistSchemaJson).toBe(CHECKLIST_BODY.schemaJson);
    expect(local?.checklistUiSchemaJson).toBe(CHECKLIST_BODY.uiSchemaJson);
    expect(local?.checklistResponseJson).toBe(CHECKLIST_BODY.responseJson);
    // The checklist etag goes to checklistVersion, never to the task version.
    expect(local?.checklistVersion).toBe('CHK-1');
    expect(local?.version).toBe('TASK-1');
  });

  it('does not refetch the checklist when the cached snapshot matches the server etag', async () => {
    let checklistCalls = 0;
    await testDb.tasks.put({
      ...localTaskBase,
      syncState: 'synced',
      hasChecklist: true,
      checklistSchemaJson: CHECKLIST_BODY.schemaJson,
      checklistVersion: 'CHK-1',
    });

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () => HttpResponse.json({ items: [taskWithChecklist()] })),
      http.get(`${BASE}/api/v1/work-tasks/:taskId/checklist`, () => {
        checklistCalls++;
        return HttpResponse.json(CHECKLIST_BODY);
      }),
    );

    await pullTasks(testDb, client, 'tenant-1');

    expect(checklistCalls).toBe(0);
    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.checklistVersion).toBe('CHK-1');
  });

  it('refetches the checklist when the server etag moved', async () => {
    await testDb.tasks.put({
      ...localTaskBase,
      syncState: 'synced',
      hasChecklist: true,
      checklistSchemaJson: '{"type":"object"}',
      checklistVersion: 'CHK-OLD',
    });

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () => HttpResponse.json({ items: [taskWithChecklist()] })),
      http.get(`${BASE}/api/v1/work-tasks/:taskId/checklist`, () => HttpResponse.json(CHECKLIST_BODY)),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.checklistVersion).toBe('CHK-1');
    expect(local?.checklistSchemaJson).toBe(CHECKLIST_BODY.schemaJson);
  });

  it('preserves the local draft while refreshing the confirmed response', async () => {
    await testDb.tasks.put({
      ...localTaskBase,
      syncState: 'synced',
      hasChecklist: true,
      checklistVersion: 'CHK-OLD',
      checklistDraftJson: '{"ok":false}',
    });

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () => HttpResponse.json({ items: [taskWithChecklist()] })),
      http.get(`${BASE}/api/v1/work-tasks/:taskId/checklist`, () => HttpResponse.json(CHECKLIST_BODY)),
    );

    await pullTasks(testDb, client, 'tenant-1');

    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.checklistDraftJson).toBe('{"ok":false}');
    expect(local?.checklistResponseJson).toBe(CHECKLIST_BODY.responseJson);
  });

  it('does not request a checklist for tasks without one', async () => {
    let checklistCalls = 0;
    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () =>
        HttpResponse.json({ items: [{ id: TASK_ID, title: 'Server Task', state: 'todo' }] }),
      ),
      http.get(`${BASE}/api/v1/work-tasks/:taskId/checklist`, () => {
        checklistCalls++;
        return HttpResponse.json(CHECKLIST_BODY);
      }),
    );

    await pullTasks(testDb, client, 'tenant-1');

    expect(checklistCalls).toBe(0);
    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.hasChecklist).toBe(false);
  });

  it('survives a 204 (task without checklist) without losing the pull', async () => {
    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () => HttpResponse.json({ items: [taskWithChecklist()] })),
      http.get(`${BASE}/api/v1/work-tasks/:taskId/checklist`, () => new HttpResponse(null, { status: 204 })),
    );

    const result = await pullTasks(testDb, client, 'tenant-1');

    expect(result.fetched).toBe(1);
    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.syncState).toBe('synced');
    expect(local?.checklistSchemaJson).toBeUndefined();
  });

  it('does not pull the checklist for tasks with local pending changes', async () => {
    let checklistCalls = 0;
    await testDb.tasks.put({ ...localTaskBase, syncState: 'pending', hasChecklist: true });

    server.use(
      http.get(`${BASE}/api/v1/work-tasks`, () => HttpResponse.json({ items: [taskWithChecklist()] })),
      http.get(`${BASE}/api/v1/work-tasks/:taskId/checklist`, () => {
        checklistCalls++;
        return HttpResponse.json(CHECKLIST_BODY);
      }),
    );

    await pullTasks(testDb, client, 'tenant-1');

    expect(checklistCalls).toBe(0);
    const local = await testDb.tasks.get(TASK_ID);
    expect(local?.syncState).toBe('pending');
    expect(local?.checklistSchemaJson).toBeUndefined();
  });
});

// ── pullAssets ────────────────────────────────────────────────────────────────
//
// The asset delta stream only carries ids, so the field list would end up without
// code/name. `pullAssets` reads the search endpoint and then hydrates the template
// schema + properties once per asset.

describe('pullAssets', () => {
  const ASSET_A = '11111111-1111-7111-8111-111111111111';
  const ASSET_B = '22222222-2222-7222-8222-222222222222';

  const listItems = [
    {
      id: ASSET_A,
      templateId: 'tpl-1',
      parentId: null,
      path: `/${ASSET_A}/`,
      pathNames: '/Planta/Bomba/',
      code: 'PUMP-01',
      name: 'Bomba centrífuga',
      state: 'Activo',
      stateColor: '#22c55e',
      healthRiskLevel: 'High',
    },
    {
      id: ASSET_B,
      templateId: 'tpl-1',
      parentId: null,
      path: `/${ASSET_B}/`,
      pathNames: '/Planta/',
      code: 'VALVE-02',
      name: 'Válvula de corte',
      state: 'Falla_Total',
      stateColor: '#ef4444',
      healthRiskLevel: 'Low',
    },
  ];

  function mockAssetsApi(options: { failDetail?: boolean } = {}) {
    server.use(
      http.get(`${BASE}/api/v1/assets`, () =>
        HttpResponse.json({
          items: listItems,
          totalCount: listItems.length,
          page: 1,
          pageSize: 100,
        }),
      ),
      http.get(`${BASE}/api/v1/assets/:assetId`, ({ params }) => {
        if (options.failDetail) return new HttpResponse(null, { status: 500 });
        const assetId = String(params.assetId);
        const source = listItems.find((item) => item.id === assetId);
        return HttpResponse.json({
          id: assetId,
          templateId: source?.templateId,
          templateName: 'Bomba',
          schemaJson: JSON.stringify({
            type: 'object',
            properties: { serial_number: { type: 'string', title: 'Serie' } },
          }),
          propertiesJson: JSON.stringify({ serial_number: `SN-${assetId.slice(0, 4)}` }),
          state: source?.state,
          pathNames: source?.pathNames,
          latitude: 19.4,
          longitude: -99.1,
          etag: 'ETAG-1',
        });
      }),
    );
  }

  it('stores the display fields and hydrates schema/properties per asset', async () => {
    mockAssetsApi();

    const result = await pullAssets(testDb, client, 'tenant-1');

    expect(result.fetched).toBe(2);

    const asset = await testDb.assets.get(ASSET_A);
    expect(asset?.code).toBe('PUMP-01');
    expect(asset?.name).toBe('Bomba centrífuga');
    expect(asset?.state).toBe('Activo');
    expect(asset?.locationPath).toBe('/Planta/Bomba/');
    // healthRiskLevel drives the criticality chip because Asset has no criticality column.
    expect(asset?.criticality).toBe('high');
    expect(asset?.searchCodes).toContain('PUMP-01');
    expect(asset?.searchText).toContain('bomba centrifuga');
    expect(asset?.schemaJson).toBeTruthy();
    expect(asset?.propertiesJson).toContain('SN-1111');
    expect(asset?.templateName).toBe('Bomba');
    expect(asset?.version).toBe('ETAG-1');
    expect(asset?.isStale).toBe(0);

    const failing = await testDb.assets.get(ASSET_B);
    expect(failing?.state).toBe('Falla_Total');
    expect(failing?.criticality).toBe('low');
  });

  it('keeps the list usable when the detail hydration fails', async () => {
    mockAssetsApi({ failDetail: true });

    const result = await pullAssets(testDb, client, 'tenant-1');

    expect(result.fetched).toBe(2);
    const asset = await testDb.assets.get(ASSET_A);
    expect(asset?.code).toBe('PUMP-01');
    expect(asset?.schemaJson).toBeUndefined();
  });

  it('does not overwrite a record with local edits waiting in the outbox', async () => {
    mockAssetsApi();
    await testDb.assets.put({
      id: ASSET_A,
      tenantId: 'tenant-1',
      code: 'LOCAL-EDIT',
      name: 'Nombre local',
      state: 'En_Reparacion',
      criticality: 'medium',
      searchCodes: ['LOCAL-EDIT'],
      searchText: 'local edit',
      historyCachedAtMs: 0,
      syncState: 'pending',
      cachedAtMs: Date.now(),
      isStale: 1,
    });

    const result = await pullAssets(testDb, client, 'tenant-1');

    expect(result.fetched).toBe(1);
    const local = await testDb.assets.get(ASSET_A);
    expect(local?.code).toBe('LOCAL-EDIT');
    expect(local?.syncState).toBe('pending');
  });

  it('stamps the catalog version so the sync loop can skip the full page', async () => {
    mockAssetsApi();

    // A device that synced before this version holds rows without code/name.
    expect(await needsAssetCatalogRefresh(testDb)).toBe(true);

    await pullAssets(testDb, client, 'tenant-1');

    expect(await needsAssetCatalogRefresh(testDb)).toBe(false);
  });
});
