import Dexie, { type Table } from 'dexie';
import type {
  TaskRecord,
  MaintenanceOrderRecord,
  MaintenanceOrderPartRecord,
  AssetRecord,
  AssetMaterialRecord,
  IncidentRecord,
  MaterialStockRecord,
  WorkflowTemplateRecord,
  CatalogItemRecord,
  DirectoryEntryRecord,
  OutboxMutation,
  MediaQueueItem,
  SyncMetaRecord,
  AuthSessionRecord,
} from './schema';

export const FIELD_DB_NAME = 'assethub-field';

export class FieldDatabase extends Dexie {
  tasks!: Table<TaskRecord, string>;
  maintenance_orders!: Table<MaintenanceOrderRecord, string>;
  order_parts!: Table<MaintenanceOrderPartRecord, string>;
  assets!: Table<AssetRecord, string>;
  asset_bom_materials!: Table<AssetMaterialRecord, string>;
  incidents!: Table<IncidentRecord, string>;
  materials_stock!: Table<MaterialStockRecord, string>;
  workflow_templates!: Table<WorkflowTemplateRecord, string>;
  catalog_items!: Table<CatalogItemRecord, string>;
  directory_entries!: Table<DirectoryEntryRecord, string>;
  outbox_mutations!: Table<OutboxMutation, string>;
  media_queue!: Table<MediaQueueItem, string>;
  sync_meta!: Table<SyncMetaRecord, string>;
  auth_session!: Table<AuthSessionRecord, string>;

  constructor(name: string = FIELD_DB_NAME) {
    super(name);

    this.version(1).stores({
      tasks:
        'id, tenantId, assignedToId, assignedEmployeeId, assignedTeamId, ' +
        '[tenantId+assignedToId], [tenantId+assignedEmployeeId], [tenantId+assignedTeamId], ' +
        '[tenantId+state], [tenantId+maintenanceOrderId], maintenanceOrderId, incidentId, ' +
        'state, dueAtMs, syncState, [tenantId+syncState], assetId, updatedAtLocalMs, cachedAtMs',

      maintenance_orders:
        'id, tenantId, assignedEmployeeId, assignedTeamId, ' +
        '[tenantId+assignedEmployeeId], [tenantId+assignedTeamId], [tenantId+state], ' +
        'state, kind, assetId, incidentId, syncState, [tenantId+syncState], scheduledStartMs, cachedAtMs',

      order_parts:
        'id, tenantId, [tenantId+orderId], orderId, catalogItemId, warehouseId, sourceType, syncState, cachedAtMs',

      assets:
        'id, tenantId, [tenantId+code], code, parentId, templateId, state, criticality, ' +
        'syncState, [tenantId+syncState], *searchCodes, searchText, cachedAtMs',

      asset_bom_materials:
        'id, tenantId, [tenantId+assetId], assetId, catalogItemId, catalogItemCode, isCritical, syncState, cachedAtMs',

      incidents:
        'id, tenantId, assignedEmployeeId, assignedTeamId, ' +
        '[tenantId+assignedEmployeeId], [tenantId+assignedTeamId], [tenantId+state], ' +
        '[tenantId+syncState], syncState, state, assetId, taskId, ' +
        'createdAtLocalMs, severity, cachedAtMs',

      materials_stock:
        'id, tenantId, [tenantId+warehouseId], warehouseId, materialId, sku, cachedAtMs',

      workflow_templates:
        'id, tenantId, [tenantId+entityType], entityType, cachedAtMs',

      catalog_items:
        'id, tenantId, [tenantId+catalogCode], catalogCode, code, cachedAtMs',

      directory_entries:
        'id, tenantId, [tenantId+kind], kind, name, cachedAtMs',

      outbox_mutations:
        'id, tenantId, [tenantId+status], status, nextAttemptAtMs, ' +
        '[aggregateType+aggregateId+createdAtMs], aggregateId, createdAtMs',

      media_queue:
        'id, tenantId, [tenantId+status], status, nextAttemptAtMs, ' +
        '[ownerType+ownerId], &sha256, createdAtMs',

      sync_meta: 'key, updatedAtMs',

      auth_session: 'key',
    });
  }
}

export function createFieldDatabase(name: string = FIELD_DB_NAME): FieldDatabase {
  return new FieldDatabase(name);
}

export const db = createFieldDatabase();
