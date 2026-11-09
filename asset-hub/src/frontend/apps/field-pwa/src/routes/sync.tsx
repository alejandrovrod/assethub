// sync.tsx — Sync Center: Clear visibility of synchronized vs pending items
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSync } from '../features/sync/useSync';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@asset-hub/core-offline';
import type { IncidentSyncState, MediaQueueItem, TaskRecord, TaskState } from '@asset-hub/core-offline';
import { TaskConflictDialog } from '../shared/components/TaskConflictDialog';
import { formatDateTime, formatTime } from '../lib/format';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Image as ImageIcon,
  FileText,
  Database,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';

type SyncStateKey =
  | 'states.synced'
  | 'states.pending'
  | 'states.draft'
  | 'states.conflict'
  | 'states.blocked'
  | 'states.dead';

const SYNC_STATE_LABELS = {
  synced: 'states.synced',
  pending: 'states.pending',
  draft: 'states.draft',
  conflict: 'states.conflict',
  blocked: 'states.blocked',
  dead: 'states.dead',
} as const satisfies Record<IncidentSyncState, SyncStateKey>;

type TaskStateKey =
  | 'taskStates.todo'
  | 'taskStates.rework'
  | 'taskStates.inProgress'
  | 'taskStates.paused'
  | 'taskStates.done'
  | 'taskStates.cancelled';

const TASK_STATE_LABELS = {
  todo: 'taskStates.todo',
  rework: 'taskStates.rework',
  in_progress: 'taskStates.inProgress',
  paused: 'taskStates.paused',
  done: 'taskStates.done',
  cancelled: 'taskStates.cancelled',
} as const satisfies Record<TaskState, TaskStateKey>;

type MediaPurposeKey =
  | 'media.purposes.taskPhoto'
  | 'media.purposes.incidentPhoto'
  | 'media.purposes.signature';

const MEDIA_PURPOSE_LABELS = {
  task_photo: 'media.purposes.taskPhoto',
  incident_photo: 'media.purposes.incidentPhoto',
  signature: 'media.purposes.signature',
} as const satisfies Record<MediaQueueItem['purpose'], MediaPurposeKey>;

export function SyncPage() {
  const { t } = useTranslation(['sync', 'common']);
  const { state, drainNow } = useSync();
  const [filter, setFilter] = useState<'pending' | 'synced' | 'all'>('all');
  const [showCacheDetails, setShowCacheDetails] = useState(false);
  const [conflictTask, setConflictTask] = useState<TaskRecord | null>(null);

  // Outbox mutations
  const outboxItems = useLiveQuery(() => db.outbox_mutations.toArray()) ?? [];
  const pendingMutations = outboxItems.filter((m) => m.status === 'pending');
  const deadMutations = outboxItems.filter((m) => m.status === 'dead');

  // Media queue (Offline evidences, photos, signatures)
  const mediaItems = useLiveQuery(() => db.media_queue.reverse().toArray()) ?? [];
  const pendingMedia = mediaItems.filter((m) => m.status === 'pending');
  const uploadedMedia = mediaItems.filter((m) => m.status === 'uploaded');
  const failedMedia = mediaItems.filter((m) => m.status === 'failed');

  // Tasks and their sync states
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const tasksMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const pendingTasks = tasks.filter((t) => t.syncState === 'pending');
  const conflictTasks = tasks.filter((t) => t.syncState === 'conflict');

  // Incidents
  const incidents = useLiveQuery(() => db.incidents.toArray()) ?? [];
  const pendingIncidents = incidents.filter(
    (inc) => inc.syncState === 'pending' || inc.syncState === 'draft',
  );

  // Local IndexedDB storage counts (cache data for offline)
  const tasksCount = tasks.length;
  const ordersCount = useLiveQuery(() => db.maintenance_orders.count()) ?? 0;
  const incidentsCount = incidents.length;
  const catalogCount = useLiveQuery(() => db.catalog_items.count()) ?? 0;

  // Calculate totals
  const totalPending = pendingMedia.length + pendingMutations.length + pendingTasks.length + pendingIncidents.length;
  const totalErrors = failedMedia.length + deadMutations.length;
  const totalSynced = uploadedMedia.length;

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        <button
          onClick={drainNow}
          disabled={!state.isOnline || state.isSyncing}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${state.isSyncing ? 'animate-spin' : ''}`} />
          {state.isSyncing ? t('common:loading.syncing') : t('actions.syncNow')}
        </button>
      </div>

      {/* Main Status Hero Banner */}
      <div
        className={`rounded-xl border p-4 shadow-xs transition-colors ${
          totalErrors > 0
            ? 'border-red-500/30 bg-red-500/5'
            : totalPending > 0
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-emerald-500/30 bg-emerald-500/5'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                totalErrors > 0
                  ? 'border-red-500/30 bg-red-500/10 text-red-600'
                  : totalPending > 0
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
              }`}
            >
              {totalErrors > 0 ? (
                <AlertTriangle className="h-5 w-5" />
              ) : totalPending > 0 ? (
                <Clock className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {totalErrors > 0
                  ? t('hero.errors', { count: totalErrors })
                  : totalPending > 0
                  ? t('hero.pending', { count: totalPending })
                  : t('hero.synced')}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {totalErrors > 0
                  ? t('hero.errorsHint')
                  : totalPending > 0
                  ? t('hero.pendingHint')
                  : t('hero.syncedHint')}
              </p>
            </div>
          </div>

          {/* Online badge */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1 text-[11px] font-medium">
            {state.isOnline ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-700 dark:text-emerald-400">{t('common:app.online')}</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-amber-700 dark:text-amber-400">{t('common:app.offline')}</span>
              </>
            )}
          </div>
        </div>

        {state.lastSyncAt && (
          <p className="mt-3 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
            {t('lastSync.label')}{' '}
            <span className="font-semibold text-foreground">
              {formatDateTime(state.lastSyncAt)}
            </span>
          </p>
        )}
      </div>

      {/* Sync State Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {t('common:state.all')}
          <span className="ml-0.5 rounded-full bg-background/20 px-1.5 py-0.2 text-[10px]">
            {mediaItems.length + pendingTasks.length + pendingIncidents.length + pendingMutations.length}
          </span>
        </button>

        <button
          onClick={() => setFilter('pending')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filter === 'pending'
              ? 'bg-amber-600 text-white'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {t('filters.pending')}
          {totalPending > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              {totalPending}
            </span>
          )}
        </button>

        <button
          onClick={() => setFilter('synced')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filter === 'synced'
              ? 'bg-emerald-600 text-white'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {t('filters.synced')}
          <span className="ml-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            {totalSynced}
          </span>
        </button>
      </div>

      {/* Synchronized vs Pending Items Detailed List */}
      <div className="space-y-3">
        {/* 0. Conflict Tasks (Requires explicit user decision) */}
        {conflictTasks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              {t('conflicts.title', { count: conflictTasks.length })}
            </h4>
            {conflictTasks.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground line-clamp-1">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('conflicts.changedOnServer')}{' '}
                      <span className="font-semibold uppercase text-foreground">{t(TASK_STATE_LABELS[item.state])}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setConflictTask(item)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-xs hover:bg-destructive/90 transition-all active:scale-95"
                >
                  {t('conflicts.resolve')}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 1. Pending Tasks / Task State Changes */}
        {(filter === 'all' || filter === 'pending') && pendingTasks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('pendingTasks.title', { count: pendingTasks.length })}
            </h4>
            {pendingTasks.map((taskItem) => (
              <div
                key={taskItem.id}
                className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground line-clamp-1">{taskItem.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('labels.localState')}{' '}
                      <span className="font-semibold capitalize text-foreground">{t(TASK_STATE_LABELS[taskItem.state])}</span>
                      {taskItem.updatedAtLocalMs && (
                        <span> · {formatTime(taskItem.updatedAtLocalMs)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3" />
                  {t('states.pending')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 1b. Pending Incidents */}
        {(filter === 'all' || filter === 'pending') && pendingIncidents.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('pendingIncidents.title', { count: pendingIncidents.length })}
            </h4>
            {pendingIncidents.map((inc) => (
              <div
                key={inc.id}
                className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground line-clamp-1">{inc.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('labels.localState')}{' '}
                      <span className="font-semibold capitalize text-foreground">{t(SYNC_STATE_LABELS[inc.syncState])}</span>
                      {inc.createdAtLocalIso && (
                        <span> · {formatTime(inc.createdAtLocalIso)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3" />
                  {t('states.pending')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 2. Media Queue Items (Photos & Evidences) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('media.title', { count: mediaItems.length })}
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {t('media.summary', { uploaded: uploadedMedia.length, pending: pendingMedia.length })}
            </span>
          </div>

          {mediaItems.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">
              {t('media.empty')}
            </div>
          ) : (
            <div className="space-y-2">
              {mediaItems
                .filter((item) => {
                  if (filter === 'pending') return item.status === 'pending' || item.status === 'failed';
                  if (filter === 'synced') return item.status === 'uploaded';
                  return true;
                })
                .map((item) => {
                  const previewUrl =
                    !navigator.onLine && item.blob
                      ? URL.createObjectURL(item.blob)
                      : item.remoteUrl || (item.blob ? URL.createObjectURL(item.blob) : '');
                  const parentTask = item.ownerType === 'task_evidence' ? tasksMap.get(item.ownerId) : null;
                  const targetLabel = parentTask
                    ? t('media.targetTask', { title: parentTask.title })
                    : item.ownerType === 'incident'
                    ? t('media.targetIncident')
                    : t('media.targetMaintenance');

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border bg-card p-3 text-xs shadow-xs transition-colors"
                    >
                      {/* Image Thumbnail */}
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted/20">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={t('media.alt')}
                            onError={(e) => {
                              if (item.blob) {
                                e.currentTarget.src = URL.createObjectURL(item.blob);
                              }
                            }}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-6 w-6 opacity-40" />
                          </div>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="font-semibold text-foreground line-clamp-1" title={targetLabel}>
                          {targetLabel}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="capitalize font-medium text-foreground">
                            {t(MEDIA_PURPOSE_LABELS[item.purpose])}
                          </span>
                          {item.bytes && (
                            <span>· {(item.bytes / 1024).toFixed(1)} KB</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(item.createdAtMs)}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {item.status === 'uploaded' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('media.status.uploaded')}
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <Clock className="h-3.5 w-3.5" />
                            {t('states.pending')}
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t('media.status.failed')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* 3. Outbox Technical Mutations */}
        {outboxItems.length > 0 && (
          <div className="space-y-2 pt-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('outbox.title', { count: outboxItems.length })}
            </h4>
            <div className="space-y-1.5">
              {outboxItems
                .filter((m) => {
                  if (filter === 'pending') return m.status === 'pending' || m.status === 'dead';
                  if (filter === 'synced') return m.status === 'done';
                  return true;
                })
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-foreground">{m.operation}</span>
                      <span className="text-[10px] text-muted-foreground">({m.aggregateType})</span>
                    </div>
                    <div>
                      {m.status === 'pending' && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                          {t('outbox.status.pending')}
                        </span>
                      )}
                      {m.status === 'done' && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                          {t('outbox.status.done')}
                        </span>
                      )}
                      {m.status === 'dead' && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
                          {t('outbox.status.dead')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Local Offline Cache Data (Read-only reference) */}
      <div className="rounded-xl border bg-card p-3.5 shadow-xs">
        <button
          type="button"
          onClick={() => setShowCacheDetails((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold text-foreground">
                {t('cache.title')}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {t('cache.subtitle')}
              </p>
            </div>
          </div>
          {showCacheDetails ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showCacheDetails && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
            <div className="rounded-lg bg-muted/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">{t('cache.tasks')}</p>
              <p className="text-sm font-bold text-foreground">{tasksCount}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">{t('cache.orders')}</p>
              <p className="text-sm font-bold text-foreground">{ordersCount}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">{t('cache.incidents')}</p>
              <p className="text-sm font-bold text-foreground">{incidentsCount}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">{t('cache.catalogs')}</p>
              <p className="text-sm font-bold text-foreground">{catalogCount}</p>
            </div>
          </div>
        )}
      </div>

      {state.lastError != null && (
        <div className="rounded-xl bg-destructive/10 p-3.5 text-xs text-destructive border border-destructive/20">
          {t('error.label', { error: String(state.lastError) })}
        </div>
      )}

      {/* Modal de resolución explícita de conflicto */}
      {conflictTask && (
        <TaskConflictDialog
          task={conflictTask}
          db={db}
          onClose={() => setConflictTask(null)}
          onResolved={() => {
            setConflictTask(null);
            drainNow();
          }}
        />
      )}
    </div>
  );
}
