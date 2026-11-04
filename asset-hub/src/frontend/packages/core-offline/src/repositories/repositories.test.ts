import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFieldDatabase, FieldDatabase } from '../db/database';
import {
  TaskRepository,
  AssetRepository,
  IncidentRepository,
  StockRepository,
  SyncMetaRepository,
} from './index';

describe('Core Repositories Integration Tests', () => {
  let db: FieldDatabase;
  let taskRepo: TaskRepository;
  let assetRepo: AssetRepository;
  let incidentRepo: IncidentRepository;
  let stockRepo: StockRepository;
  let syncMetaRepo: SyncMetaRepository;

  beforeEach(() => {
    db = createFieldDatabase(`test-repo-${Date.now()}-${Math.random()}`);
    taskRepo = new TaskRepository(db);
    assetRepo = new AssetRepository(db);
    incidentRepo = new IncidentRepository(db);
    stockRepo = new StockRepository(db);
    syncMetaRepo = new SyncMetaRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  describe('TaskRepository (T036)', () => {
    it('creates, queries by assigned technician, updates state and counts by syncState', async () => {
      const tenantId = 't-1';
      const techId = 'tech-1';

      await taskRepo.upsert({
        id: 'task-1',
        tenantId,
        assignedToId: techId,
        title: 'Mantenimiento Preventivo',
        priority: 'high',
        state: 'todo',
        serverState: 'todo',
        dueAtMs: 100,
        cachedAtMs: Date.now(),
        updatedAtLocalMs: Date.now(),
        syncState: 'pending',
      });

      const assigned = await taskRepo.findAssignedTo(tenantId, techId);
      expect(assigned).toHaveLength(1);
      expect(assigned[0].id).toBe('task-1');

      // Update state to in_progress with geo
      await taskRepo.updateState('task-1', 'in_progress', 'pending', 1234.56, {
        latitude: 19.4326,
        longitude: -99.1332,
        accuracyM: 5,
        capturedAtIso: new Date().toISOString(),
        capturedAtMs: Date.now(),
        status: 'ok',
      });

      const updated = await taskRepo.getById('task-1');
      expect(updated?.state).toBe('in_progress');
      expect(updated?.monotonicMs).toBe(1234.56);
      expect(updated?.startedAtLocalIso).toBeDefined();
      expect(updated?.geoStart?.latitude).toBe(19.4326);

      const counts = await taskRepo.countBySyncState(tenantId);
      expect(counts.pending).toBe(1);
      expect(counts.synced).toBe(0);
    });

    it('purges old synced tasks', async () => {
      const oldTime = Date.now() - 35 * 24 * 60 * 60 * 1000; // 35 days ago
      await taskRepo.upsert({
        id: 'old-task',
        tenantId: 't-1',
        assignedToId: 'tech-1',
        title: 'Old Task',
        priority: 'low',
        state: 'done',
        serverState: 'done',
        dueAtMs: 0,
        cachedAtMs: oldTime,
        updatedAtLocalMs: oldTime,
        syncState: 'synced',
      });

      const purged = await taskRepo.purgeOldSynced();
      expect(purged).toBe(1);
      expect(await taskRepo.getById('old-task')).toBeUndefined();
    });
  });

  describe('AssetRepository (T037)', () => {
    it('handles search with prefix match and fallback substring', async () => {
      await assetRepo.upsert({
        id: 'a-1',
        tenantId: 't-1',
        code: 'COMP-01',
        name: 'Compresor Industrial',
        state: 'Operativo',
        criticality: 'high',
        searchCodes: ['COMP-01', 'QR-COMP-01'],
        searchText: 'comp 01 compresor industrial',
        historyCachedAtMs: Date.now(),
        cachedAtMs: Date.now(),
        isStale: 0,
      });

      // Search by code QR/barcode
      const byBarcode = await assetRepo.findBySearchCode('qr-comp-01');
      expect(byBarcode?.id).toBe('a-1');

      // Search prefix
      const prefixResult = await assetRepo.search('comp');
      expect(prefixResult).toHaveLength(1);

      // Search substring
      const subResult = await assetRepo.search('industrial');
      expect(subResult).toHaveLength(1);
    });
  });

  describe('IncidentRepository (T038)', () => {
    it('saves draft and isolates pending incidents', async () => {
      await incidentRepo.saveDraft({
        id: 'inc-draft',
        tenantId: 't-1',
        title: 'Borrador de Falla',
        description: 'Detalles sin confirmar',
        severity: 'low',
        affectsOperation: false,
        geoStatus: 'ok',
        photoIds: [],
        reportedByUserId: 'tech-1',
        createdAtLocalIso: new Date().toISOString(),
        createdAtLocalMs: Date.now(),
        syncState: 'draft',
        cachedAtMs: Date.now(),
      });

      const drafts = await incidentRepo.findDrafts('t-1');
      expect(drafts).toHaveLength(1);
      expect(drafts[0].id).toBe('inc-draft');

      const pending = await incidentRepo.findPending('t-1');
      expect(pending).toHaveLength(0);
    });
  });

  describe('StockRepository (T039)', () => {
    it('calculates available quantity dynamically and reserves stock', async () => {
      await stockRepo.upsert({
        id: 'wh-1:mat-1',
        tenantId: 't-1',
        warehouseId: 'wh-1',
        materialId: 'mat-1',
        sku: 'OIL-10W40',
        name: 'Aceite 10W40',
        unit: 'L',
        qtyAvailableServer: 10,
        qtyReservedLocal: 0,
        qtyConsumedLocal: 0,
        allowNegativeStock: false,
        rowVersion: 'RV-1',
        cachedAtMs: Date.now(),
      });

      expect(await stockRepo.getAvailable('wh-1', 'mat-1')).toBe(10);

      await stockRepo.reserve('wh-1', 'mat-1', 4);
      expect(await stockRepo.getAvailable('wh-1', 'mat-1')).toBe(6);

      // Exceeding stock when allowNegativeStock is false throws
      await expect(stockRepo.reserve('wh-1', 'mat-1', 7)).rejects.toThrow('Insufficient stock');
    });
  });

  describe('SyncMetaRepository (T040)', () => {
    it('manages cursor tokens and metadata keys', async () => {
      await syncMetaRepo.setCursor('tasks', 'token-tasks-xyz');
      expect(await syncMetaRepo.getCursor('tasks')).toBe('token-tasks-xyz');

      await syncMetaRepo.set('lastFullSync', '1700000000');
      expect(await syncMetaRepo.get('lastFullSync')).toBe('1700000000');

      await syncMetaRepo.delete('lastFullSync');
      expect(await syncMetaRepo.get('lastFullSync')).toBeUndefined();
    });
  });
});
