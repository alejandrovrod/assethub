import type { FieldDatabase } from '../db/database';
import type { HttpClient } from '../transport/http-client';
import { TaskRepository } from '../repositories/task.repository';
import { parseProperties, resolveAssigneeId } from '../repositories/assignment';
import { AssetRepository } from '../repositories/asset.repository';
import { IncidentRepository } from '../repositories/incident.repository';
import { StockRepository } from '../repositories/stock.repository';
import { SyncMetaRepository } from '../repositories/sync-meta.repository';
import type { TaskRecord, AssetRecord, IncidentRecord, MaterialStockRecord } from '../db/schema';
import { normalizeSearchCode, normalizeSearchText } from '../util/normalize';

export type PullResource = 'tasks' | 'assets' | 'incidents' | 'stock';

export interface PullResult {
  fetched: number;
  conflicts: number;
  cursor: string | null;
}

interface DeltaResponse {
  data: unknown[];
  nextCursor?: string;
}

/**
 * Pull delta changes for a resource from the server and merge them locally.
 *
 * Conflict rule:
 *  - If local record exists AND syncState !== 'synced' AND server record differs
 *    → mark local as 'conflict', do NOT overwrite.
 *  - Otherwise → upsert + mark syncState = 'synced'.
 */
export async function pullDelta(
  resource: PullResource,
  db: FieldDatabase,
  http: HttpClient,
  extraQuery?: Record<string, string>,
): Promise<PullResult> {
  const syncMeta = new SyncMetaRepository(db);
  const cursorKey = `pull:cursor:${resource}`;
  const cursor = await syncMeta.get(cursorKey);

  const query: Record<string, string> = {
    limit: '100',
    // Incidents are filtered server-side by the assignment declared in the template
    // properties: the field device never needs the rest of the tenant's incidents.
    ...(resource === 'incidents' ? { assignedToMe: 'true' } : {}),
    ...(extraQuery ?? {}),
  };
  if (cursor) {
    query['after'] = cursor;
  }

  const resourcePath = resource === 'tasks' ? 'work-tasks' : resource === 'stock' ? 'inventory/stock' : resource;
  const response = await http.get(`/api/v1/${resourcePath}/changes`, query);
  const body = response.body as DeltaResponse & { items?: unknown[] };
  const records = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.items)
      ? body.items
      : [];

  let fetched = 0;
  let conflicts = 0;
  let lastUpdatedAt: string | null = null;

  for (const raw of records) {
    fetched++;
    const serverRecord = raw as Record<string, unknown>;
    if (serverRecord['updatedAt']) {
      lastUpdatedAt = serverRecord['updatedAt'] as string;
    }

    await mergeRecord(resource, db, serverRecord, () => { conflicts++; });
  }

  // Update cursor
  const nextCursor: string | null = body.nextCursor ?? lastUpdatedAt ?? null;
  if (nextCursor) {
    await syncMeta.set(cursorKey, nextCursor);
  }

  return { fetched, conflicts, cursor: nextCursor };
}

async function mergeRecord(
  resource: PullResource,
  db: FieldDatabase,
  serverRecord: Record<string, unknown>,
  onConflict: () => void,
): Promise<void> {
  const id = serverRecord['id'] as string;

  switch (resource) {
    case 'tasks': {
      const repo = new TaskRepository(db);
      const local = await repo.getById(id);
      if (local && local.syncState !== 'synced' && hasChanges(local as unknown as Record<string, unknown>, serverRecord)) {
        await db.tasks.update(id, { syncState: 'conflict' });
        onConflict();
      } else {
        // El delta trae sólo id/updatedAt/deleted/etag: no reconstruye la entidad, pero el
        // ETag sí se guarda porque es lo único que el cliente necesita para escribir.
        const deltaEtag = serverRecord['etag'];
        const record: TaskRecord = {
          ...(local ?? {}),
          ...(serverRecord as Partial<TaskRecord>),
          ...(typeof deltaEtag === 'string' ? { version: deltaEtag } : {}),
          id,
          syncState: 'synced',
          cachedAtMs: Date.now(),
        } as TaskRecord;
        await repo.upsert(record);
      }
      break;
    }

    case 'assets': {
      const repo = new AssetRepository(db);
      const local = await repo.getById(id);
      // Assets don't have a user-editable syncState concept — always upsert
      const record: AssetRecord = {
        ...(local ?? {}),
        ...(serverRecord as Partial<AssetRecord>),
        id,
        cachedAtMs: Date.now(),
      } as AssetRecord;
      await repo.upsert(record);
      break;
    }

    case 'incidents': {
      const repo = new IncidentRepository(db);
      const local = await repo.getById(id);
      if (local && local.syncState !== 'synced' && hasChanges(local as unknown as Record<string, unknown>, serverRecord)) {
        await db.incidents.update(id, { syncState: 'conflict' });
        onConflict();
      } else {
        const record: IncidentRecord = {
          ...(local ?? {}),
          ...(serverRecord as Partial<IncidentRecord>),
          id,
          syncState: 'synced',
          cachedAtMs: Date.now(),
        } as IncidentRecord;
        await repo.upsert(record);
      }
      break;
    }

    case 'stock': {
      const repo = new StockRepository(db);
      const local = await repo.getById(id);
      const record: MaterialStockRecord = {
        ...(local ?? {}),
        ...(serverRecord as Partial<MaterialStockRecord>),
        id,
        cachedAtMs: Date.now(),
      } as MaterialStockRecord;
      await repo.upsert(record);
      break;
    }
  }
}

/** Shallow comparison — checks if any top-level field on server differs from local. */
function hasChanges(local: Record<string, unknown>, server: Record<string, unknown>): boolean {
  for (const key of Object.keys(server)) {
    if (key === 'cachedAtMs') continue;
    if (JSON.stringify(local[key]) !== JSON.stringify(server[key])) {
      return true;
    }
  }
  return false;
}

export async function pullOrders(
  db: FieldDatabase,
  http: HttpClient,
  tenantId: string,
): Promise<{ fetched: number }> {
  try {
    const response = await http.get('/api/v1/maintenance-orders', { pageSize: '100', assignedToMe: 'true' });
    const body = response.body as { items?: any[] };
    const items = Array.isArray(body?.items) ? body.items : [];

    const serverIds = new Set(items.map((raw) => String(raw.id).toLowerCase()));
    const staleIds = (await db.maintenance_orders.where('tenantId').equals(tenantId).toArray())
      .filter((o) => o.syncState === 'synced' && !serverIds.has(o.id.toLowerCase()))
      .map((o) => o.id);
    if (staleIds.length > 0) {
      await db.maintenance_orders.bulkDelete(staleIds);
    }

    const records = items.map((raw) => {
      const propertiesJson = raw.propertiesJson ?? undefined;
      const assigneeId = resolveAssigneeId(propertiesJson);
      return {
        id: raw.id,
        tenantId,
        title: raw.title ?? 'Orden de Mantenimiento',
        state: (raw.state ?? 'in_progress').toLowerCase(),
        kind: raw.kind ?? 'corrective',
        assetId: raw.assetId,
        incidentId: raw.incidentId,
        workflowTemplateId: raw.workflowTemplateId,
        assignedEmployeeId: assigneeId ?? raw.assignedEmployeeId,
        propertiesJson,
        syncState: 'synced',
        cachedAtMs: Date.now(),
      };
    });

    if (records.length > 0) {
      await db.maintenance_orders.bulkPut(records as any);
    }
    return { fetched: items.length };
  } catch (err) {
    console.warn('Failed to pull maintenance orders:', err);
    return { fetched: 0 };
  }
}

const ASSET_PAGE_SIZE = 100;
const ASSET_MAX_PAGES = 50;
const ASSET_DETAIL_CONCURRENCY = 4;

/**
 * Bumped when the local asset row shape changes in a way a delta merge cannot repair.
 * Before this version the asset delta left rows without `code`/`name`/`searchText`
 * (it only carries ids), so a device holding that catalog must re-pull it once.
 */
export const ASSET_CATALOG_VERSION = '2';
const ASSET_CATALOG_META_KEY = 'assets.catalogVersion';

/** True when this device never pulled the current catalog shape (or the pull failed). */
export async function needsAssetCatalogRefresh(db: FieldDatabase): Promise<boolean> {
  const meta = new SyncMetaRepository(db);
  return (await meta.get(ASSET_CATALOG_META_KEY)) !== ASSET_CATALOG_VERSION;
}

/**
 * Pull the full asset catalog into Dexie.
 *
 * `pullDelta('assets')` is not enough for this screen: the delta stream only carries
 * `id / updatedAt / deleted / etag` (see GetAssetChangesQuery), so every local row ends
 * up without `code`, `name` or `searchText` and the field technician sees an empty list.
 * Here we read the search endpoint, which returns the display fields, and then hydrate
 * the template schema + dynamic properties (needed by the inspector and by
 * `buildPropagatedAndResolvedSchema`) once per asset.
 */
export async function pullAssets(
  db: FieldDatabase,
  http: HttpClient,
  tenantId: string,
): Promise<{ fetched: number }> {
  try {
    const repo = new AssetRepository(db);
    const records: AssetRecord[] = [];
    let seen = 0;

    for (let page = 1; page <= ASSET_MAX_PAGES; page++) {
      const response = await http.get('/api/v1/assets', {
        page: String(page),
        pageSize: String(ASSET_PAGE_SIZE),
      });
      const body = response.body as { items?: any[]; totalCount?: number };
      const items = Array.isArray(body?.items) ? body.items : [];

      for (const raw of items) {
        seen++;
        if (!raw?.id) continue;
        const existing = await repo.getById(raw.id);

        // A local edit waiting in the outbox must not be overwritten by the server copy.
        if (existing && existing.syncState && existing.syncState !== 'synced') continue;

        records.push(toAssetRecord(raw, tenantId, existing));
      }

      if (items.length < ASSET_PAGE_SIZE) break;
      if (typeof body?.totalCount === 'number' && seen >= body.totalCount) break;
    }

    if (records.length > 0) {
      await repo.upsertMany(records);
    }

    // The list endpoint does not expose the template schema or the dynamic properties.
    // Hydrate them once: afterwards the inspector works fully offline.
    const toHydrate = records.filter((asset) => !asset.schemaJson || !asset.propertiesJson);
    await runWithConcurrency(toHydrate, ASSET_DETAIL_CONCURRENCY, async (asset) => {
      await hydrateAssetDetail(db, http, asset).catch(() => false);
    });

    // Mark the catalog shape as current so the sync loop can skip the full page next time.
    await new SyncMetaRepository(db).set(ASSET_CATALOG_META_KEY, ASSET_CATALOG_VERSION);

    return { fetched: records.length };
  } catch (err) {
    console.warn('Failed to pull assets:', err);
    return { fetched: 0 };
  }
}

/**
 * Refresh a single asset from `GET /assets/{id}` (schema, properties, ETag, geo).
 * Used on demand by the inspector when a record was cached before the detail pull.
 */
export async function refreshAssetDetail(
  db: FieldDatabase,
  http: HttpClient,
  assetId: string,
): Promise<boolean> {
  const asset = await db.assets.get(assetId);
  if (!asset) return false;
  return hydrateAssetDetail(db, http, asset).catch(() => false);
}

async function hydrateAssetDetail(
  db: FieldDatabase,
  http: HttpClient,
  asset: AssetRecord,
): Promise<boolean> {
  const response = await http.get(`/api/v1/assets/${asset.id}`);
  const body = response.body as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return false;

  const serial = typeof body.serial === 'string' ? body.serial : asset.serial;
  const locationPath =
    typeof body.pathNames === 'string' ? body.pathNames : asset.locationPath;
  const searchCodes = buildSearchCodes([asset.code, asset.name, serial, ...asset.searchCodes]);

  await db.assets.update(asset.id, {
    schemaJson: typeof body.schemaJson === 'string' ? body.schemaJson : asset.schemaJson,
    propertiesJson:
      typeof body.propertiesJson === 'string' ? body.propertiesJson : asset.propertiesJson,
    templateName:
      typeof body.templateName === 'string' ? body.templateName : asset.templateName,
    lifecycleStatesJson: body.lifecycleStates
      ? JSON.stringify(body.lifecycleStates)
      : asset.lifecycleStatesJson,
    serial,
    locationPath,
    latitude: typeof body.latitude === 'number' ? body.latitude : asset.latitude,
    longitude: typeof body.longitude === 'number' ? body.longitude : asset.longitude,
    geoJson: typeof body.geoJson === 'string' ? body.geoJson : asset.geoJson,
    searchCodes,
    searchText: buildSearchText({ ...asset, serial, locationPath, searchCodes }),
    ...(typeof body.etag === 'string' ? { version: body.etag } : {}),
    cachedAtMs: Date.now(),
    isStale: 0,
  });

  return true;
}

function toAssetRecord(
  raw: Record<string, any>,
  tenantId: string,
  existing: AssetRecord | undefined,
): AssetRecord {
  const code = raw.code ?? existing?.code ?? '';
  const name = raw.name ?? existing?.name ?? '';
  const serial = raw.serial ?? existing?.serial;
  const locationPath = raw.pathNames ?? existing?.locationPath;
  const searchCodes = buildSearchCodes([
    code,
    name,
    serial,
    ...(existing?.searchCodes ?? []),
  ]);

  return {
    id: raw.id,
    tenantId,
    code,
    name,
    parentId: raw.parentId ?? undefined,
    templateId: raw.templateId ?? existing?.templateId,
    templateName: raw.templateName ?? existing?.templateName,
    state: raw.state ?? existing?.state ?? 'Activo',
    serverState: raw.state ?? existing?.serverState,
    lifecycleStatesJson: existing?.lifecycleStatesJson,
    criticality: mapCriticality(raw.healthRiskLevel, existing?.criticality),
    locationPath,
    latitude: raw.latitude ?? existing?.latitude,
    longitude: raw.longitude ?? existing?.longitude,
    geoJson: raw.geoJson ?? existing?.geoJson,
    serial,
    propertiesJson: existing?.propertiesJson,
    schemaJson: existing?.schemaJson,
    searchCodes,
    searchText: buildSearchText({ code, name, serial, locationPath, templateName: raw.templateName ?? existing?.templateName, searchCodes }),
    historyJson: existing?.historyJson,
    historyCachedAtMs: existing?.historyCachedAtMs ?? 0,
    version: existing?.version,
    syncState: 'synced',
    cachedAtMs: Date.now(),
    isStale: 0,
  };
}

/**
 * The asset entity has no criticality column. The closest server signal is the health
 * prediction risk level (`Low | Moderate | High | Critical`), so the field app uses it
 * for the color coding and falls back to the previously cached value.
 */
function mapCriticality(raw: unknown, fallback?: AssetRecord['criticality']): AssetRecord['criticality'] {
  switch (String(raw ?? '').toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return fallback ?? 'medium';
  }
}

/** Codes a QR / barcode may carry for this asset: its code, its name and the QR tail. */
function buildSearchCodes(values: Array<string | undefined>): string[] {
  const codes = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeSearchCode(value);
    if (normalized) codes.add(normalized);
    if (value.includes('/')) {
      const tail = normalizeSearchCode(value.split('/').filter(Boolean).pop() ?? '');
      if (tail) codes.add(tail);
    }
  }
  return Array.from(codes);
}

function buildSearchText(asset: {
  code?: string;
  name?: string;
  serial?: string;
  locationPath?: string;
  templateName?: string;
  searchCodes?: string[];
}): string {
  return normalizeSearchText(
    [
      asset.code,
      asset.name,
      asset.serial,
      asset.locationPath,
      asset.templateName,
      ...(asset.searchCodes ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      await worker(items[cursor++]);
    }
  });
  await Promise.all(runners);
}

const INCIDENT_PAGE_SIZE = 100;
const INCIDENT_MAX_PAGES = 50;
const INCIDENT_ID_REPAIR_KEY = 'incidents.idRepair:v1';

/**
 * Adopt the server id of incidents created on this device before the client id was sent.
 *
 * `ReportIncidentCommand` used to generate its own Guid: the local row kept the uuidv7 and
 * the server row was unreachable, so the next pull pruned the local one and the incident
 * vanished from the device. The drainer stored the server response (`{ id }`), which is the
 * only surviving link between both ids. Runs once per device.
 */
export async function reconcileIncidentCreates(
  db: FieldDatabase,
  tenantId: string,
): Promise<number> {
  const meta = new SyncMetaRepository(db);
  if (await meta.get(INCIDENT_ID_REPAIR_KEY)) return 0;

  const mutations = await db.outbox_mutations
    .filter(
      (m) =>
        m.tenantId === tenantId &&
        m.operation === 'incident.create' &&
        m.status === 'done' &&
        !!m.responseJson,
    )
    .toArray();

  let repaired = 0;
  for (const mutation of mutations) {
    let serverId: string | undefined;
    try {
      const response = JSON.parse(mutation.responseJson ?? '{}') as Record<string, unknown>;
      serverId = typeof response['id'] === 'string' ? (response['id'] as string) : undefined;
    } catch {
      continue;
    }
    if (!serverId || serverId.toLowerCase() === mutation.aggregateId.toLowerCase()) continue;

    const local = await db.incidents.get(mutation.aggregateId);
    if (local) {
      const serverRow = await db.incidents.get(serverId);
      if (serverRow) {
        // The pull already materialised the server copy: keep its data, drop the duplicate.
        await db.incidents.update(serverId, { origin: 'local' });
        await db.incidents.delete(mutation.aggregateId);
      } else {
        await db.incidents.put({ ...local, id: serverId, origin: 'local', cachedAtMs: Date.now() });
        await db.incidents.delete(mutation.aggregateId);
      }
    } else {
      // The pull already pruned it: rebuild what the outbox still remembers.
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(mutation.bodyJson ?? '{}') as Record<string, unknown>;
      } catch {
        // Malformed payload: keep the empty object.
      }
      await db.incidents.put({
        id: serverId,
        tenantId,
        title: typeof payload['title'] === 'string' ? payload['title'] : 'Incidencia',
        description: typeof payload['description'] === 'string' ? payload['description'] : '',
        assetId: typeof payload['assetId'] === 'string' ? payload['assetId'] : undefined,
        state: 'reported',
        severity: 'medium',
        affectsOperation: false,
        geoStatus: 'unavailable',
        photoIds: Array.isArray(payload['photoIds']) ? (payload['photoIds'] as string[]) : [],
        reportedByUserId: '',
        origin: 'local',
        createdAtLocalIso: new Date(mutation.createdAtMs).toISOString(),
        createdAtLocalMs: mutation.createdAtMs,
        syncState: 'synced',
        cachedAtMs: Date.now(),
      } as IncidentRecord);
    }

    // Any mutation still queued for the old id must follow the row to the server id.
    const queued = await db.outbox_mutations
      .where('aggregateId')
      .equals(mutation.aggregateId)
      .filter((m) => m.status !== 'done' && m.status !== 'discarded')
      .toArray();
    for (const pending of queued) {
      await db.outbox_mutations.update(pending.id, {
        aggregateId: serverId,
        path: pending.path.replace(new RegExp(mutation.aggregateId, 'ig'), serverId),
      });
    }

    repaired++;
  }

  await meta.set(INCIDENT_ID_REPAIR_KEY, 'done');
  return repaired;
}

export async function pullIncidents(
  db: FieldDatabase,
  http: HttpClient,
  tenantId: string,
): Promise<{ fetched: number }> {
  try {
    const items: any[] = [];
    let complete = false;

    for (let page = 1; page <= INCIDENT_MAX_PAGES; page++) {
      // Field devices only carry the technician's own incidents: the server resolves
      // "me" from the assignment declared in the template properties (asignar_a /
      // asignado_a), with the fallback of an assigned corrective order.
      const response = await http.get('/api/v1/incidents', {
        pageSize: String(INCIDENT_PAGE_SIZE),
        page: String(page),
        assignedToMe: 'true',
      });
      const body = response.body as { items?: any[]; totalCount?: number };
      const pageItems = Array.isArray(body?.items) ? body.items : [];
      items.push(...pageItems);

      if (pageItems.length < INCIDENT_PAGE_SIZE) {
        complete = true;
        break;
      }
      if (typeof body?.totalCount === 'number' && items.length >= body.totalCount) {
        complete = true;
        break;
      }
    }

    const repo = new IncidentRepository(db);

    // Drop synced incidents the server no longer returns for this user (reassigned to
    // someone else, or cached by an older build that pulled the whole tenant). Pending
    // and draft rows are kept: they are the technician's own unsynced work.
    // Only prune after a complete read; a truncated pull would delete valid rows.
    if (complete) {
      const serverIds = new Set(items.map((raw) => String(raw.id).toLowerCase()));
      const staleIds = (await db.incidents.where('tenantId').equals(tenantId).toArray())
        // Rows created on this device are never in the "assigned to me" feed: they are
        // the technician's own reports and must stay visible in the asset inspector.
        .filter((i) => i.syncState === 'synced' && i.origin !== 'local' && !serverIds.has(i.id.toLowerCase()))
        .map((i) => i.id);
      if (staleIds.length > 0) {
        await db.incidents.bulkDelete(staleIds);
      }
    }

    const records: IncidentRecord[] = [];
    for (const raw of items) {
      const existing = await repo.getById(raw.id);
      if (existing && existing.syncState !== 'synced') continue;

      records.push({
        id: raw.id,
        tenantId,
        ...(existing?.origin === 'local' ? { origin: 'local' as const } : {}),
        title: raw.title ?? 'Incidencia',
        description: raw.description ?? '',
        state: (raw.state ?? 'reported').toLowerCase() as any,
        severity: raw.severity ?? 'medium',
        affectsOperation: raw.affectsOperation ?? false,
        geoStatus: 'unavailable',
        photoIds: [],
        reportedByUserId: raw.reportedByUserId ?? '',
        createdAtLocalIso: raw.createdAt ?? raw.reportedAt ?? new Date().toISOString(),
        assetId: raw.assetId,
        workflowTemplateId: raw.workflowTemplateId,
        propertiesJson: raw.propertiesJson,
        syncState: 'synced',
        cachedAtMs: Date.now(),
        createdAtLocalMs: raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now(),
      });
    }

    if (records.length > 0) {
      await db.incidents.bulkPut(records);
    }
    return { fetched: items.length };
  } catch (err) {
    console.warn('Failed to pull incidents:', err);
    return { fetched: 0 };
  }
}

export async function pullTasks(
  db: FieldDatabase,
  http: HttpClient,
  tenantId: string,
): Promise<{ fetched: number }> {
  try {
    // Field devices only carry the technician's own work: the server resolves
    // "me" (user + linked employee + teams) so the client never sees other people's tasks.
    const response = await http.get('/api/v1/work-tasks', { pageSize: '100', assignedToMe: 'true' });
    const body = response.body as { items?: any[] };
    const items = Array.isArray(body?.items) ? body.items : [];
    const repo = new TaskRepository(db);

    // Drop synced local tasks that are no longer assigned to this user (reassigned, or
    // cached by an older build that pulled the whole tenant). Pending ones are kept so
    // offline changes are never lost.
    const serverIds = new Set(items.map((raw) => String(raw.id).toLowerCase()));
    const staleIds = (await db.tasks.where('tenantId').equals(tenantId).toArray())
      .filter((t) => t.syncState === 'synced' && !serverIds.has(t.id.toLowerCase()))
      .map((t) => t.id);
    if (staleIds.length > 0) {
      await db.tasks.bulkDelete(staleIds);
    }

    const taskRecords: TaskRecord[] = [];
    const relatedOrders: any[] = [];
    const checklistsToFetch: string[] = [];

    for (const raw of items) {
      const existing = await repo.getById(raw.id);
      if (existing && existing.syncState !== 'synced') {
        continue;
      }

      // El checklist es una fila aparte con su propio rowversion. La lista sólo dice
      // si existe y cuál es su ETag vigente; hay que traer el formulario aparte para
      // tener el snapshot con el que se responde.
      const hasChecklist = raw.hasChecklist === true;
      const serverChecklistEtag = typeof raw.checklistEtag === 'string' ? raw.checklistEtag : undefined;
      const checklistIsStale =
        hasChecklist &&
        (!existing?.checklistSchemaJson ||
          (serverChecklistEtag !== undefined && existing?.checklistVersion !== serverChecklistEtag));
      if (checklistIsStale) {
        checklistsToFetch.push(raw.id);
      }

      const propertiesJson = raw.propertiesJson ?? existing?.propertiesJson;
      // The properties decide the executor. Only rows with no properties at all fall back to the
      // legacy column: a task that declares a follower but no executor must not inherit the
      // column, or it lands in the wrong person's jornada.
      const parsedProperties = parseProperties(propertiesJson);
      const executorId = resolveAssigneeId(propertiesJson);
      const legacyAssigneeId = parsedProperties
        ? undefined
        : raw.assignedEmployeeId ?? raw.assignedToId;
      const assigneeId = executorId ?? legacyAssigneeId;

      const dueAt = raw.dueAt ? new Date(raw.dueAt).getTime() : 0;
      taskRecords.push({
        id: raw.id,
        tenantId,
        title: raw.title ?? 'Sin título',
        description: raw.description ?? '',
        state: (raw.state ?? 'todo').toLowerCase(),
        serverState: (raw.state ?? 'todo').toLowerCase(),
        dueAtMs: dueAt,
        assetId: raw.assetId,
        assetName: raw.assetName,
        incidentId: raw.incidentId,
        maintenanceOrderId: raw.maintenanceOrderId,
        maintenanceOrderTitle: raw.maintenanceOrderTitle,
        maintenanceOrderState: raw.maintenanceOrderState,
        // The executor comes from `asignar_a`; the legacy column only survives on rows that
        // carry no properties at all (see repositories/assignment.ts).
        assignedEmployeeId: assigneeId,
        assignedToId: assigneeId ?? '',
        assignedTeamId: raw.assignedTeamId,
        priority: raw.priorityLabel ?? raw.priority ?? 'medium',
        workflowTemplateId: raw.workflowTemplateId,
        propertiesJson,
        hasChecklist,
        checklistSchemaJson: existing?.checklistSchemaJson,
        checklistUiSchemaJson: existing?.checklistUiSchemaJson,
        checklistResponseJson: existing?.checklistResponseJson,
        checklistDraftJson: existing?.checklistDraftJson,
        // Se conserva el local a propósito: si el servidor tiene otro, el If-Match
        // viejo produce 412 (conflicto visible) en vez de pisar un formulario que
        // este dispositivo nunca vio. pullTaskChecklists lo actualiza al traerlo.
        checklistVersion: existing?.checklistVersion ?? serverChecklistEtag,
        commentsJson: existing?.commentsJson,
        historyJson: existing?.historyJson,
        evidencesJson: (existing as any)?.evidencesJson,
        startedAtLocalIso: existing?.startedAtLocalIso,
        completedAtLocalIso: existing?.completedAtLocalIso,
        monotonicMs: existing?.monotonicMs,
        geoStart: existing?.geoStart,
        geoEnd: existing?.geoEnd,
        // El ETag es el contrato de concurrencia: sin persistirlo acá, los comandos
        // encolan `If-Match` vacío y el primer PUT /state muere con 428.
        version: raw.etag ?? existing?.version,
        syncState: 'synced',
        cachedAtMs: Date.now(),
        updatedAtLocalMs: Date.now(),
      });

      if (raw.maintenanceOrderId) {
        relatedOrders.push({
          id: raw.maintenanceOrderId,
          tenantId,
          title: raw.maintenanceOrderTitle ?? 'Orden de Mantenimiento',
          state: (raw.maintenanceOrderState ?? 'in_progress').toLowerCase(),
          workflowTemplateId: raw.workflowTemplateId,
          assignedEmployeeId: assigneeId,
          assetId: raw.assetId,
          incidentId: raw.incidentId,
          syncState: 'synced',
          cachedAtMs: Date.now(),
        });
      }
    }

    if (taskRecords.length > 0) {
      await db.tasks.bulkPut(taskRecords);
    }
    if (relatedOrders.length > 0) {
      await db.maintenance_orders.bulkPut(relatedOrders);
    }
    if (checklistsToFetch.length > 0) {
      await pullTaskChecklists(db, http, checklistsToFetch);
    }
    return { fetched: items.length };
  } catch (err) {
    console.warn('Failed to pull work tasks:', err);
    return { fetched: 0 };
  }
}

const CHECKLIST_PULL_CONCURRENCY = 4;

/**
 * Trae el formulario de inspección de las tareas indicadas.
 *
 * Sin `taskIds` recorre la base y pide sólo los que faltan, para poder invocarlo
 * desde un sync completo sin repetir el request por cada tarea del listado.
 *
 * Tres respuestas posibles del endpoint: 200 con el checklist, 204 si la tarea no
 * tiene formulario (no se borra nada local: una tarea no pierde su checklist) y 404
 * si la tarea ya no existe. Ninguna de las dos últimas debe romper el pull.
 */
export async function pullTaskChecklists(
  db: FieldDatabase,
  http: HttpClient,
  taskIds?: string[],
): Promise<{ fetched: number; failed: number }> {
  const ids =
    taskIds ??
    (
      await db.tasks
        .filter((t) => t.syncState === 'synced' && Boolean(t.hasChecklist) && !t.checklistSchemaJson)
        .toArray()
    ).map((t) => t.id);

  let fetched = 0;
  let failed = 0;

  const worker = async (taskId: string): Promise<void> => {
    try {
      const res = await http.get(`/api/v1/work-tasks/${taskId}/checklist`);
      const body = res.body as Record<string, unknown> | null;
      if (res.status !== 200 || !body) return;

      const headerEtag = res.headers?.['etag']?.replace(/^W\//, '').replace(/^"|"$/g, '');
      const etag = typeof body['etag'] === 'string' ? (body['etag'] as string) : headerEtag;

      await db.tasks.update(taskId, {
        checklistSchemaJson:
          typeof body['schemaJson'] === 'string' ? (body['schemaJson'] as string) : undefined,
        checklistUiSchemaJson:
          typeof body['uiSchemaJson'] === 'string' ? (body['uiSchemaJson'] as string) : undefined,
        // El borrador local vive en checklistDraftJson y no se toca: la respuesta
        // confirmada del servidor no debe pisar lo que el técnico está escribiendo.
        checklistResponseJson:
          typeof body['responseJson'] === 'string' ? (body['responseJson'] as string) : undefined,
        ...(etag ? { checklistVersion: etag } : {}),
      });
      fetched++;
    } catch {
      // 204/404 llegan acá como HttpError en algunos transports; no son fatales.
      failed++;
    }
  };

  let cursor = 0;
  const runners = Array.from({ length: Math.min(CHECKLIST_PULL_CONCURRENCY, ids.length) }, async () => {
    while (cursor < ids.length) {
      const index = cursor++;
      await worker(ids[index]);
    }
  });
  await Promise.all(runners);

  return { fetched, failed };
}

export async function pullMetadata(
  db: FieldDatabase,
  http: HttpClient,
  tenantId: string,
): Promise<{ templates: number; directory: number; catalogs: number }> {
  let templates = 0;
  let directory = 0;
  let catalogs = 0;

  // 1. Workflow templates (batch)
  try {
    const res = await http.get('/api/v1/workflow-templates');
    const body = res.body as { items?: any[] };
    const items = Array.isArray(body?.items) ? body.items : [];
    const templateRecords = items.map((item) => ({
      id: item.id,
      tenantId,
      name: item.name ?? '',
      entityType: item.type ?? 'work_task',
      schemaJson: typeof item.schemaJson === 'string' ? item.schemaJson : JSON.stringify(item.schemaJson ?? {}),
      lifecycleStatesJson: item.lifecycleStates ? JSON.stringify(item.lifecycleStates) : undefined,
      cachedAtMs: Date.now(),
    }));

    if (templateRecords.length > 0) {
      await db.workflow_templates.bulkPut(templateRecords);
      templates = templateRecords.length;
    }
  } catch (err) {
    console.warn('Failed to pull workflow templates list:', err);
  }

  // 2. Employees (Directory in batch)
  try {
    const res = await http.get('/api/v1/employees', { pageSize: '100' });
    const body = res.body as { items?: any[] };
    const items = Array.isArray(body?.items) ? body.items : [];
    const empRecords = items
      .filter((emp) => emp.id)
      .map((emp) => ({
        id: emp.id,
        tenantId,
        kind: 'employee' as const,
        name: `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || emp.name || emp.email || 'Empleado',
        code: emp.code,
        cachedAtMs: Date.now(),
      }));
    if (empRecords.length > 0) {
      await db.directory_entries.bulkPut(empRecords);
      directory += empRecords.length;
    }
  } catch (err) {
    console.warn('Failed to pull employees directory:', err);
  }

  // 3. Teams (Directory in batch)
  try {
    const res = await http.get('/api/v1/teams', { pageSize: '100' });
    const body = res.body as { items?: any[] };
    const items = Array.isArray(body?.items) ? body.items : [];
    const teamRecords = items
      .filter((team) => team.id)
      .map((team) => ({
        id: team.id,
        tenantId,
        kind: 'team' as const,
        name: team.name ?? 'Equipo',
        code: team.code,
        cachedAtMs: Date.now(),
      }));
    if (teamRecords.length > 0) {
      await db.directory_entries.bulkPut(teamRecords);
      directory += teamRecords.length;
    }
  } catch (err) {
    console.warn('Failed to pull teams directory:', err);
  }

  // 4. Catalogs & Catalog Items (cached in Dexie)
  // Utiliza el endpoint optimizado /api/v1/catalogs/all-items en una única llamada HTTP.
  // Siempre actualiza los registros con bulkPut para asegurar que nuevos catálogos o cambios se reflejen.
  try {
    const res = await http.get('/api/v1/catalogs/all-items');
    const body = res.body as { items?: any[] };
    const items = Array.isArray(body?.items) ? body.items : [];
    const allRecords = items.map((ci: any) => ({
      id: ci.id,
      tenantId,
      catalogCode: ci.catalogCode ?? '',
      code: ci.code,
      label: ci.label ?? ci.defaultLabel ?? ci.code,
      sortOrder: ci.order ?? 0,
      cachedAtMs: Date.now(),
    }));

    if (allRecords.length > 0) {
      await db.catalog_items.bulkPut(allRecords);
      catalogs = allRecords.length;
    } else {
      catalogs = await db.catalog_items.count();
    }
  } catch (err) {
    console.warn('Failed to pull all catalog items:', err);
    catalogs = await db.catalog_items.count();
  }

  // 5. Inventory Stock (Materials & spare parts in warehouses)
  try {
    const res = await http.get('/api/v1/inventory/stock');
    const items = Array.isArray(res.body)
      ? res.body
      : Array.isArray((res.body as any)?.data)
        ? (res.body as any).data
        : [];

    if (items.length > 0) {
      // Clear legacy/corrupted stock entries with NaN or missing materialId
      await db.materials_stock.filter((s) => !s.name || !s.materialId || isNaN(s.qtyAvailableServer)).delete();

      const stockRecords: MaterialStockRecord[] = items.map((s: any) => ({
        id: `${s.warehouseId}:${s.catalogItemId}`,
        tenantId,
        warehouseId: s.warehouseId,
        warehouseName: s.warehouseName ?? '',
        materialId: s.catalogItemId,
        sku: s.catalogItemCode ?? '',
        name: s.catalogItemName ?? s.catalogItemCode ?? 'Material',
        unit: s.unit ?? 'u',
        qtyAvailableServer: Number(s.quantityOnHand ?? 0),
        qtyReservedLocal: 0,
        qtyConsumedLocal: 0,
        allowNegativeStock: false,
        rowVersion: s.etag ?? '',
        cachedAtMs: Date.now(),
      }));

      // Preserve local reservations if any
      for (const record of stockRecords) {
        const local = await db.materials_stock.get(record.id);
        if (local) {
          record.qtyReservedLocal = local.qtyReservedLocal ?? 0;
          record.qtyConsumedLocal = local.qtyConsumedLocal ?? 0;
        }
      }

      await db.materials_stock.bulkPut(stockRecords);
    }
  } catch (err) {
    console.warn('Failed to pull inventory stock:', err);
  }

  return { templates, directory, catalogs };
}

