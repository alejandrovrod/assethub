// scheduler.ts — Sync engine scheduler with triggers (plan §6.7)

import type { DrainerHandle } from './drainer';
import type { FieldDatabase } from '../db/database';

export interface SyncEngine {
  start(): void;
  stop(): void;
  drainNow(): Promise<void>;
  onEvent(cb: (event: SyncEvent) => void): () => void;
  getSnapshot(): SyncSnapshot;
}

export type SyncEvent =
  | { type: 'sync:start' }
  | { type: 'sync:complete'; pulled: number; pushed: number }
  | { type: 'sync:error'; error: unknown }
  | { type: 'outbox:changed'; pending: number; dead: number }
  | { type: 'connectivity:changed'; online: boolean };

export interface SyncSnapshot {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  deadCount: number;
  lastSyncAt: number | null;
  lastError: unknown | null;
}

export interface SyncEngineOpts {
  db: FieldDatabase;
  drainer: DrainerHandle;
  isOnline: () => boolean;
  onOnlineChange?: (cb: (online: boolean) => void) => () => void;
  pullFn?: () => Promise<{ pulled: number }>;
  pushFn?: () => Promise<{ pushed: number }>;
  now?: () => number;
}

export function createSyncEngine(opts: SyncEngineOpts): SyncEngine {
  const {
    db,
    drainer,
    isOnline,
    onOnlineChange,
    pullFn,
    pushFn,
    now = () => Date.now(),
  } = opts;

  const listeners: Array<(event: SyncEvent) => void> = [];
  let running = false;
  let isSyncing = false;
  let lastSyncAt: number | null = null;
  let lastError: unknown | null = null;
  let onlineUnsubscribe: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;
  let onlineHandler: (() => void) | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function emit(event: SyncEvent) {
    listeners.forEach((cb) => cb(event));
  }

  async function getPendingCount(): Promise<number> {
    return db.outbox_mutations.where('status').equals('pending').count();
  }

  async function getDeadCount(): Promise<number> {
    return db.outbox_mutations.where('status').equals('dead').count();
  }

  async function drainNow(): Promise<void> {
    if (isSyncing) return;
    if (!isOnline()) return;

    isSyncing = true;
    emit({ type: 'sync:start' });

    try {
      // 1. Push (drain outbox first so backend MediatR publishers propagate state cascades: Task -> Order -> Incident -> Asset)
      let pushed = 0;
      await drainer.drainOnce();
      drainer.start();
      if (pushFn) {
        const result = await pushFn();
        pushed = result.pushed;
      }

      // 2. Pull after push so local IndexedDB immediately receives the cascaded state changes from the server
      let pulled = 0;
      if (pullFn) {
        const result = await pullFn();
        pulled = result.pulled;
      }

      lastSyncAt = now();
      lastError = null;
      emit({ type: 'sync:complete', pulled, pushed });
    } catch (err) {
      lastError = err;
      emit({ type: 'sync:error', error: err });
    } finally {
      isSyncing = false;
      const pending = await getPendingCount();
      const dead = await getDeadCount();
      emit({ type: 'outbox:changed', pending, dead });
    }
  }

  function start() {
    if (running) return;
    running = true;

    // Listen for online/offline changes
    if (onOnlineChange) {
      onlineUnsubscribe = onOnlineChange((online) => {
        emit({ type: 'connectivity:changed', online });
        if (online) {
          drainNow().catch(() => {});
        }
      });
    }

    // Browser online event
    if (typeof window !== 'undefined') {
      onlineHandler = () => {
        emit({ type: 'connectivity:changed', online: true });
        drainNow().catch(() => {});
      };
      window.addEventListener('online', onlineHandler);

      // Visibility change — sync when tab becomes visible
      visibilityHandler = () => {
        if (document.visibilityState === 'visible' && isOnline()) {
          drainNow().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }

    // Periodic sync every 5 minutes
    intervalId = setInterval(() => {
      if (isOnline() && !isSyncing) {
        drainNow().catch(() => {});
      }
    }, 5 * 60 * 1000);
  }

  function stop() {
    if (!running) return;
    running = false;

    drainer.stop();

    if (onlineUnsubscribe) {
      onlineUnsubscribe();
      onlineUnsubscribe = null;
    }

    if (typeof window !== 'undefined') {
      if (onlineHandler) {
        window.removeEventListener('online', onlineHandler);
        onlineHandler = null;
      }
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
      }
    }

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function getSnapshot(): SyncSnapshot {
    return {
      isOnline: isOnline(),
      isSyncing,
      pendingCount: 0, // Will be populated async
      deadCount: 0,
      lastSyncAt,
      lastError,
    };
  }

  return {
    start,
    stop,
    drainNow,
    onEvent(cb) {
      listeners.push(cb);
      return () => {
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    getSnapshot,
  };
}
