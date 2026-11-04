export const CORE_OFFLINE_VERSION = '0.1.0';

// Database & Schema
export * from './db/schema';
export { FieldDatabase, createFieldDatabase, db, FIELD_DB_NAME } from './db/database';

// Repositories
export * from './repositories';

// Commands
export * from './commands';

// Dynamic Schema Propagation & Workflow State Machines
export {
  buildPropagatedAndResolvedSchema,
  resolveSchemaFromDexie,
  evaluateWorkflowLifecycle,
} from './propagation/propagated-schema';
export type {
  PropagatedContextIds,
  ResolvedSchemaResult,
  LifecycleTransitionInfo,
} from './propagation/propagated-schema';

// Dynamic Validation Rules Engine (Assets & Workflows)
export {
  validateDynamicRules,
  getDynamicValidationErrors,
  PRESET_PATTERNS,
} from './validation/dynamic-validation-rules';
export type {
  ComparisonOperator,
  DateConstraintType,
  PatternPreset,
  FieldValidationRule,
  ValidationErrorItem,
} from './validation/dynamic-validation-rules';

// Outbox
export * from './outbox/outbox';

// Sync
export { createDrainer, type DrainerHandle, type DrainerOpts, type HttpClient as DrainerHttpClient } from './sync/drainer';
export * from './sync/backoff';
export * from './sync/coalesce';
export * from './sync/conflicts';
export * from './sync/events';
export { createLeader, type LeaderHandle, type LeaderOpts } from './sync/leader';
export * from './sync/pull';
export { createSyncEngine, type SyncEngine, type SyncEngineOpts, type SyncEvent, type SyncSnapshot as SyncEngineSnapshot } from './sync/scheduler';

// Transport
export * from './transport/http-client';

// Auth & Session
export * from './auth/session-store';
export * from './auth/offline-lease';
export * from './auth/session-state';

// Utilities
export { uuidv7 } from './util/uuidv7';
export { monotonicNow } from './util/monotonic';
export { sha256 } from './util/hashing';
export {
  ClockSkewManager,
  defaultClockSkew,
  MAX_SAMPLES,
  CRITICAL_SKEW_THRESHOLD_MS,
} from './util/clock-skew';
export {
  normalize,
  normalizeSearchText,
  normalizeSearchCode,
  removeDiacritics,
} from './util/normalize';
