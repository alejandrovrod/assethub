export type TaskState = 'todo' | 'rework' | 'in_progress' | 'paused' | 'done' | 'cancelled';
export type SyncState = 'synced' | 'pending' | 'conflict' | 'blocked' | 'dead';

export type MaintenanceOrderState =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'in_progress'
  | 'done'
  | 'rescheduled'
  | 'verified'
  | 'cancelled';

export type MaintenanceOrderKind = 'corrective' | 'preventive';

export interface GeoStamp {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAtIso: string;
  capturedAtMs: number;
  status: 'ok' | 'denied' | 'timeout' | 'unavailable';
}

export interface TaskRecord {
  id: string; // PK · Server Guid
  tenantId: string;
  assignedToId: string;
  assignedEmployeeId?: string;
  assignedTeamId?: string;
  teamId?: string;

  // Parent / propagation relationships (Order -> Task / Incident -> Task / Plan -> Task)
  maintenanceOrderId?: string;
  maintenanceOrderTitle?: string;
  maintenanceOrderState?: MaintenanceOrderState;
  incidentId?: string;
  incidentTitle?: string;
  preventivePlanId?: string;
  preventivePlanName?: string;
  workflowTemplateId?: string;

  assetId?: string;
  assetCode?: string;
  assetName?: string;

  title: string;
  description?: string;
  priority: string;
  priorityCatalogItemId?: string;
  taskTypeCatalogItemId?: string;

  state: TaskState; // Optimistic UI state
  serverState: TaskState; // Last server-confirmed state
  allowedTransitions?: TaskState[];
  reworkReason?: string;
  dueAtMs: number; // 0 = no due date (sentinel for index)

  // Dynamic propagated properties (EAV + WorkflowTemplate)
  propertiesJson?: string;

  // Checklist snapshot
  hasChecklist?: boolean; // The server says this task has a form (avoids blind 204 GETs)
  checklistSchemaJson?: string;
  checklistUiSchemaJson?: string;
  checklistResponseJson?: string; // Confirmed formData
  checklistDraftJson?: string; // Local draft
  checklistVersion?: string; // ETag for If-Match

  // Cached timeline & comments
  commentsJson?: string;
  historyJson?: string;
  evidencesJson?: string;

  // Local timestamps
  startedAtLocalIso?: string;
  completedAtLocalIso?: string;
  monotonicMs?: number;
  geoStart?: GeoStamp;
  geoEnd?: GeoStamp;

  version?: string; // Server ETag
  cachedAtMs: number;
  updatedAtLocalMs: number;
  syncState: SyncState;
  lastSyncError?: string;
}

export interface MaintenanceOrderRecord {
  id: string;
  tenantId: string;
  code?: string;
  title: string;
  description?: string;
  kind: MaintenanceOrderKind;
  state: MaintenanceOrderState;
  serverState: MaintenanceOrderState;
  allowedTransitions?: MaintenanceOrderState[];

  assignedEmployeeId?: string;
  assignedTeamId?: string;

  assetId?: string;
  assetCode?: string;
  assetName?: string;
  incidentId?: string;
  incidentTitle?: string;
  workflowTemplateId?: string;

  propertiesJson?: string;
  partsJson?: string;
  scheduledStartMs: number; // 0 = no date
  scheduledEndMs: number; // 0 = no date
  startedAtLocalIso?: string;
  completedAtLocalIso?: string;

  version?: string; // ETag
  cachedAtMs: number;
  updatedAtLocalMs: number;
  syncState: SyncState;
  lastSyncError?: string;
}

export interface WorkflowTemplateRecord {
  id: string;
  tenantId: string;
  name: string;
  entityType: 'incident' | 'maintenance_order' | 'work_task' | string;
  schemaJson: string;
  lifecycleStatesJson?: string;
  cachedAtMs: number;
}

export interface CatalogItemRecord {
  id: string;
  tenantId: string;
  catalogCode: string;
  code: string;
  label: string;
  sortOrder: number;
  cachedAtMs: number;
}

export interface DirectoryEntryRecord {
  id: string;
  tenantId: string;
  kind: 'employee' | 'team';
  name: string;
  code?: string;
  cachedAtMs: number;
}

export interface AssetRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  parentId?: string;
  templateId?: string;
  templateName?: string;
  state: string;
  serverState?: string;
  lifecycleStatesJson?: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  locationPath?: string;
  latitude?: number;
  longitude?: number;
  geoJson?: string;
  serial?: string;
  propertiesJson?: string; // EAV
  schemaJson?: string; // Template schema
  searchCodes: string[]; // multiEntry normalized QR/barcode
  searchText: string; // normalized lowercase without diacritics
  historyJson?: string;
  historyCachedAtMs: number;
  version?: string;
  syncState?: SyncState;
  cachedAtMs: number;
  isStale: 0 | 1;
}

export interface AssetMaterialRecord {
  id: string;
  tenantId: string;
  assetId: string;
  catalogItemId: string;
  catalogItemCode: string;
  catalogItemLabel: string;
  quantity: number;
  unitOfMeasure: string;
  isCritical: 0 | 1;
  notes?: string;
  syncState: SyncState;
  cachedAtMs: number;
}

export type OrderPartSourceType = 'None' | 'Internal' | 'External';

export interface MaintenanceOrderPartRecord {
  id: string;
  tenantId: string;
  orderId: string;
  catalogItemId: string;
  catalogItemLabel: string;
  quantity: number;
  unitCost: number;
  sourceType: OrderPartSourceType;
  warehouseId?: string;
  externalSupplierName?: string;
  externalReference?: string;
  syncState: SyncState;
  cachedAtMs: number;
}

export type IncidentSyncState = 'draft' | 'pending' | 'synced' | 'conflict' | 'blocked' | 'dead';

export interface IncidentRecord {
  id: string; // Local UUIDv7; replaced or linked via serverId upon confirmation
  tenantId: string;
  serverId?: string;
  assetId?: string;
  assetCode?: string;
  assetName?: string;
  taskId?: string;
  maintenanceOrderId?: string;
  workflowTemplateId?: string;
  assignedEmployeeId?: string;
  assignedTeamId?: string;
  state?: string; // Dynamic state from WorkflowTemplate lifecycleStates
  serverState?: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectsOperation: boolean;
  propertiesJson?: string;
  timelineJson?: string;
  geo?: GeoStamp;
  geoStatus: GeoStamp['status'];
  photoIds: string[]; // references to media_queue.id
  reportedByUserId: string;
  /**
   * `local` marks a row this device created. Field devices only download the incidents
   * they execute, so a row the technician reported is never in the server feed: the pull
   * must not prune it or it disappears from the asset inspector right after syncing.
   */
  origin?: 'local';
  createdAtLocalIso: string;
  createdAtLocalMs: number;
  createdAtServerIso?: string;
  version?: string;
  syncState: IncidentSyncState;
  cachedAtMs: number;
}

export interface MaterialStockRecord {
  id: string; // `${warehouseId}:${materialId}` — natural key
  tenantId: string;
  warehouseId: string;
  warehouseName?: string;
  materialId: string;
  sku: string;
  name: string;
  unit: string;
  qtyAvailableServer: number;
  qtyReservedLocal: number; // local consumption not yet synced
  qtyConsumedLocal: number; // server-confirmed consumption
  allowNegativeStock: boolean;
  rowVersion: string; // base64 RowVersion for If-Match
  cachedAtMs: number;
}

export type OutboxStatus =
  | 'pending'
  | 'in_flight'
  | 'failed'
  | 'blocked'
  | 'dead'
  | 'done'
  | 'discarded';

export interface OutboxMutation {
  id: string; // UUIDv7 · Idempotency-Key
  tenantId: string;
  aggregateType: 'task' | 'order' | 'incident' | 'asset' | 'material' | 'media' | 'evidence';
  aggregateId: string;
  operation:
  | 'task.state'
  | 'task.checklist'
  | 'task.properties'
  | 'task.comment'
  | 'order.state'
  | 'order.properties'
  | 'order.part.add'
  | 'order.part.remove'
  | 'incident.create'
  | 'incident.update'
  | 'incident.state'
  | 'asset.update'
  | 'asset.state'
  | 'asset.move'
  | 'asset.material.add'
  | 'asset.material.update'
  | 'asset.material.delete'
  | 'material.consume'
  | 'evidence.create'
  | 'task.evidence.delete';
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  bodyJson?: string;
  headersJson?: string;
  status: OutboxStatus;
  priority: number; // lower = first (default 100)
  attempts: number;
  nextAttemptAtMs: number;
  createdAtMs: number;
  lastAttemptAtMs?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  dependsOn?: string;
  responseJson?: string;
  leaseOwner?: string;
  leaseExpiresAtMs?: number;
}

export interface MediaQueueItem {
  id: string; // UUIDv7
  tenantId: string;
  ownerType: 'incident' | 'task_evidence';
  ownerId: string;
  purpose: 'incident_photo' | 'task_photo' | 'signature';
  blob: Blob;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  sha256: string; // unique index &sha256 for deduplication
  status: 'pending' | 'uploading' | 'uploaded' | 'failed' | 'dead';
  attempts: number;
  nextAttemptAtMs: number;
  remoteUrl?: string;
  outboxId?: string;
  createdAtMs: number;
}

export interface SyncMetaRecord {
  key: string; // PK: 'cursor:tasks' | 'cursor:assets' | etc.
  value: string;
  updatedAtMs: number;
}

export interface AuthSessionRecord {
  key: 'current';
  tenantId: string;
  userId: string;
  employeeId?: string;
  teamIdsJson?: string;
  displayName: string;
  rolesJson: string;
  permissionsJson: string;
  encryptedAccessToken: ArrayBuffer;
  accessIv: Uint8Array;
  accessExpiresAtMs: number;
  encryptedRefreshToken: ArrayBuffer;
  refreshIv: Uint8Array;
  offlineLeaseJwt: string;
  offlineLeaseExpiresAtMs: number;
  jwksJson: string;
  clockSkewMs: number;
  lastRefreshAtMs: number;
  pinHash?: string;
  biometricEnabled: boolean;
  deviceKeyId: string;
}
