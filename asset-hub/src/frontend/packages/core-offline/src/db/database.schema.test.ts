import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFieldDatabase, FieldDatabase } from './database';
import type {
  TaskRecord,
  AssetRecord,
  IncidentRecord,
  MaterialStockRecord,
  OutboxMutation,
  MediaQueueItem,
  SyncMetaRecord,
  AuthSessionRecord,
} from './schema';

describe('FieldDatabase Schema & Indices (T030 & T031)', () => {
  let testDb: FieldDatabase;

  beforeEach(() => {
    testDb = createFieldDatabase(`test-db-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('inserts and queries records across all tables and responds to declared indices (T030)', async () => {
    const tenantId = 'tenant-101';
    const technicianId = 'tech-202';

    // 1. tasks
    const task: TaskRecord = {
      id: 'task-1',
      tenantId,
      assignedToId: technicianId,
      title: 'Revisión Bomba',
      priority: 'high',
      state: 'todo',
      serverState: 'todo',
      dueAtMs: 1700000000000,
      cachedAtMs: Date.now(),
      updatedAtLocalMs: Date.now(),
      syncState: 'synced',
    };
    await testDb.tasks.add(task);

    // Verify compound index [tenantId+assignedToId]
    const foundTasks = await testDb.tasks
      .where('[tenantId+assignedToId]')
      .equals([tenantId, technicianId])
      .toArray();
    expect(foundTasks).toHaveLength(1);
    expect(foundTasks[0].id).toBe('task-1');

    // 2. assets
    const asset: AssetRecord = {
      id: 'asset-1',
      tenantId,
      code: 'PUMP-01',
      name: 'Bomba Centrífuga',
      state: 'Operativo',
      criticality: 'critical',
      searchCodes: ['PUMP-01', 'SN-998877'],
      searchText: 'pump 01 bomba centrifuga sn 998877',
      historyCachedAtMs: Date.now(),
      cachedAtMs: Date.now(),
      isStale: 0,
    };
    await testDb.assets.add(asset);

    // Verify multiEntry index *searchCodes
    const foundAssets = await testDb.assets
      .where('searchCodes')
      .equals('SN-998877')
      .toArray();
    expect(foundAssets).toHaveLength(1);
    expect(foundAssets[0].id).toBe('asset-1');

    // 3. incidents
    const incident: IncidentRecord = {
      id: 'incident-1',
      tenantId,
      title: 'Fuga de aceite',
      description: 'Goteo constante en la base',
      severity: 'medium',
      affectsOperation: false,
      geoStatus: 'ok',
      photoIds: [],
      reportedByUserId: technicianId,
      createdAtLocalIso: new Date().toISOString(),
      createdAtLocalMs: Date.now(),
      syncState: 'pending',
      cachedAtMs: Date.now(),
    };
    await testDb.incidents.add(incident);

    const foundIncidents = await testDb.incidents
      .where('[tenantId+syncState]')
      .equals([tenantId, 'pending'])
      .toArray();
    expect(foundIncidents).toHaveLength(1);

    // 4. materials_stock
    const stock: MaterialStockRecord = {
      id: 'wh-1:mat-1',
      tenantId,
      warehouseId: 'wh-1',
      materialId: 'mat-1',
      sku: 'FILT-OIL',
      name: 'Filtro de Aceite',
      unit: 'PZA',
      qtyAvailableServer: 10,
      qtyReservedLocal: 2,
      qtyConsumedLocal: 0,
      allowNegativeStock: false,
      rowVersion: 'AAAAAAAB==',
      cachedAtMs: Date.now(),
    };
    await testDb.materials_stock.add(stock);

    const foundStock = await testDb.materials_stock
      .where('[tenantId+warehouseId]')
      .equals([tenantId, 'wh-1'])
      .toArray();
    expect(foundStock).toHaveLength(1);

    // 5. outbox_mutations
    const mutation: OutboxMutation = {
      id: 'mut-1',
      tenantId,
      aggregateType: 'task',
      aggregateId: 'task-1',
      operation: 'task.state',
      method: 'POST',
      path: '/api/v1/work-tasks/task-1/state',
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: Date.now(),
    };
    await testDb.outbox_mutations.add(mutation);

    const foundMutations = await testDb.outbox_mutations
      .where('[tenantId+status]')
      .equals([tenantId, 'pending'])
      .toArray();
    expect(foundMutations).toHaveLength(1);

    // 6. media_queue with unique &sha256
    const media: MediaQueueItem = {
      id: 'media-1',
      tenantId,
      ownerType: 'incident',
      ownerId: 'incident-1',
      purpose: 'incident_photo',
      blob: new Blob(['test image'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      bytes: 10,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'pending',
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: Date.now(),
    };
    await testDb.media_queue.add(media);

    const foundMedia = await testDb.media_queue
      .where('sha256')
      .equals('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      .first();
    expect(foundMedia?.id).toBe('media-1');

    // Duplicate sha256 must throw ConstraintError
    await expect(
      testDb.media_queue.add({
        ...media,
        id: 'media-2',
      })
    ).rejects.toThrow();

    // 7. sync_meta
    const meta: SyncMetaRecord = {
      key: 'cursor:tasks',
      value: 'cursor-token-123',
      updatedAtMs: Date.now(),
    };
    await testDb.sync_meta.add(meta);
    expect((await testDb.sync_meta.get('cursor:tasks'))?.value).toBe('cursor-token-123');

    // 8. auth_session
    const session: AuthSessionRecord = {
      key: 'current',
      tenantId,
      userId: technicianId,
      displayName: 'Alejandro Tester',
      rolesJson: '["field-technician"]',
      permissionsJson: '["tasks.read","tasks.write"]',
      encryptedAccessToken: new ArrayBuffer(16),
      accessIv: new Uint8Array(12),
      accessExpiresAtMs: Date.now() + 900000,
      encryptedRefreshToken: new ArrayBuffer(16),
      refreshIv: new Uint8Array(12),
      offlineLeaseJwt: 'header.payload.signature',
      offlineLeaseExpiresAtMs: Date.now() + 86400000,
      jwksJson: '{}',
      clockSkewMs: 0,
      lastRefreshAtMs: Date.now(),
      biometricEnabled: false,
      deviceKeyId: 'device-1',
    };
    await testDb.auth_session.add(session);
    expect((await testDb.auth_session.get('current'))?.displayName).toBe('Alejandro Tester');
  });

  it('validates sentinel convention: undefined/null fields are omitted from index (T031)', async () => {
    // Task with sentinel dueAtMs = 0 (can be queried in indexedDB)
    const taskWithSentinel: TaskRecord = {
      id: 'task-sentinel',
      tenantId: 'tenant-1',
      assignedToId: 'tech-1',
      title: 'Tarea con fecha 0',
      priority: 'low',
      state: 'todo',
      serverState: 'todo',
      dueAtMs: 0, // sentinel value
      cachedAtMs: Date.now(),
      updatedAtLocalMs: Date.now(),
      syncState: 'synced',
    };
    await testDb.tasks.add(taskWithSentinel);

    const foundByZero = await testDb.tasks.where('dueAtMs').equals(0).toArray();
    expect(foundByZero).toHaveLength(1);
    expect(foundByZero[0].id).toBe('task-sentinel');

    // Task with undefined in an indexed property
    // In IndexedDB, if an indexed property is undefined, the key is not generated in the index.
    const taskWithoutAsset = {
      id: 'task-no-asset',
      tenantId: 'tenant-1',
      assignedToId: 'tech-1',
      title: 'Tarea sin activo',
      priority: 'low',
      state: 'todo',
      serverState: 'todo',
      dueAtMs: 0,
      cachedAtMs: Date.now(),
      updatedAtLocalMs: Date.now(),
      syncState: 'synced',
      // assetId is undefined
    } as TaskRecord;
    await testDb.tasks.add(taskWithoutAsset);

    // Querying assetId will not return records where assetId is undefined
    const foundByAsset = await testDb.tasks.where('assetId').equals('').toArray();
    expect(foundByAsset).toHaveLength(0);

    // But it can still be retrieved by PK
    const directFetch = await testDb.tasks.get('task-no-asset');
    expect(directFetch?.id).toBe('task-no-asset');
    expect(directFetch?.assetId).toBeUndefined();
  });
});

