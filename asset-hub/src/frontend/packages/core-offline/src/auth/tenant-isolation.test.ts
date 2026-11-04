import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { SessionVault } from './session-store';
import { TaskRepository } from '../repositories/task.repository';
import { MaintenanceOrderRepository } from '../repositories/maintenance-order.repository';
import { IncidentRepository } from '../repositories/incident.repository';
import { AssetRepository } from '../repositories/asset.repository';
import { uuidv7 } from '../util/uuidv7';

describe('Tenant Isolation and Logout Purge (T069 / T070)', () => {
  let db: FieldDatabase;
  let vault: SessionVault;
  let taskRepo: TaskRepository;
  let orderRepo: MaintenanceOrderRepository;
  let incidentRepo: IncidentRepository;
  let assetRepo: AssetRepository;

  beforeEach(() => {
    db = createFieldDatabase(`test-isolation-${Date.now()}-${Math.random()}`);
    vault = new SessionVault(db);
    taskRepo = new TaskRepository(db);
    orderRepo = new MaintenanceOrderRepository(db);
    incidentRepo = new IncidentRepository(db);
    assetRepo = new AssetRepository(db);
  });

  it('purges all tenant data completely on logout without leaking to subsequent sessions', async () => {
    const tenantA = 'tenant-alpha';
    const tenantB = 'tenant-beta';
    const now = Date.now();

    // 1. Populate Tenant A across tables
    await taskRepo.upsert({
      id: 'task-A1',
      tenantId: tenantA,
      assignedToId: 'user-A',
      title: 'Secret Task A',
      priority: 'high',
      state: 'todo',
      serverState: 'todo',
      dueAtMs: now,
      cachedAtMs: now,
      updatedAtLocalMs: now,
      syncState: 'synced',
    });

    await orderRepo.upsert({
      id: 'ord-A1',
      tenantId: tenantA,
      title: 'Confidential Order A',
      kind: 'corrective',
      state: 'in_progress',
      serverState: 'in_progress',
      scheduledStartMs: now,
      scheduledEndMs: 0,
      cachedAtMs: now,
      updatedAtLocalMs: now,
      syncState: 'synced',
    });

    await incidentRepo.upsert({
      id: 'inc-A1',
      tenantId: tenantA,
      title: 'Incident A',
      description: 'Breakdown on site A',
      severity: 'critical',
      affectsOperation: true,
      geoStatus: 'unavailable',
      photoIds: [],
      reportedByUserId: 'user-A',
      createdAtLocalIso: new Date(now).toISOString(),
      createdAtLocalMs: now,
      syncState: 'synced',
      cachedAtMs: now,
    });

    await assetRepo.upsert({
      id: 'asset-A1',
      tenantId: tenantA,
      code: 'GEN-01',
      name: 'Generator Alpha',
      state: 'operational',
      criticality: 'high',
      searchCodes: ['GEN01'],
      searchText: 'gen 01 generator alpha',
      historyCachedAtMs: now,
      cachedAtMs: now,
      isStale: 0,
    });

    await db.outbox_mutations.put({
      id: uuidv7(),
      tenantId: tenantA,
      aggregateType: 'task',
      aggregateId: 'task-A1',
      operation: 'task.state',
      method: 'POST',
      path: '/api/v1/work-tasks/state',
      status: 'pending',
      priority: 100,
      attempts: 0,
      nextAttemptAtMs: 0,
      createdAtMs: now,
    });

    // Verify Tenant A records exist
    expect(await db.tasks.count()).toBe(1);
    expect(await db.maintenance_orders.count()).toBe(1);
    expect(await db.incidents.count()).toBe(1);
    expect(await db.assets.count()).toBe(1);
    expect(await db.outbox_mutations.count()).toBe(1);

    // 2. Perform transactional logout purge
    await vault.purgeAllTenantData();

    // 3. Verify ALL tables are completely empty
    expect(await db.tasks.count()).toBe(0);
    expect(await db.maintenance_orders.count()).toBe(0);
    expect(await db.incidents.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(await db.asset_bom_materials.count()).toBe(0);
    expect(await db.order_parts.count()).toBe(0);
    expect(await db.materials_stock.count()).toBe(0);
    expect(await db.workflow_templates.count()).toBe(0);
    expect(await db.catalog_items.count()).toBe(0);
    expect(await db.directory_entries.count()).toBe(0);
    expect(await db.outbox_mutations.count()).toBe(0);
    expect(await db.media_queue.count()).toBe(0);
    expect(await db.sync_meta.count()).toBe(0);
    expect(await db.auth_session.count()).toBe(0);

    // 4. Populate Tenant B
    await taskRepo.upsert({
      id: 'task-B1',
      tenantId: tenantB,
      assignedToId: 'user-B',
      title: 'Tenant B Task',
      priority: 'low',
      state: 'todo',
      serverState: 'todo',
      dueAtMs: now,
      cachedAtMs: now,
      updatedAtLocalMs: now,
      syncState: 'synced',
    });

    // Zero cross-tenant leakage: Tenant A query returns empty, Tenant B query returns 1
    const tasksA = await taskRepo.findForActor({ tenantId: tenantA, userId: 'user-A' });
    expect(tasksA).toHaveLength(0);

    const tasksB = await taskRepo.findForActor({ tenantId: tenantB, userId: 'user-B' });
    expect(tasksB).toHaveLength(1);
    expect(tasksB[0].title).toBe('Tenant B Task');
  });
});

