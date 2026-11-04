import type { OutboxMutation } from '../db/schema';
import { defaultClockSkew } from '../util/clock-skew';

/**
 * Sync state snapshot broadcast to subscribers.
 */
export interface SyncSnapshot {
  pending: number;
  conflict: number;
  blocked: number;
  dead: number;
  lastSyncAtMs: number | null;
  isOnline: boolean;
}

/**
 * Reactive store for sync state.
 */
export interface SyncStore {
  getSnapshot(): SyncSnapshot;
  update(patch: Partial<SyncSnapshot>): void;
  subscribe(listener: (snapshot: SyncSnapshot) => void): () => void;
}

export function createSyncStore(): SyncStore {
  let snapshot: SyncSnapshot = {
    pending: 0,
    conflict: 0,
    blocked: 0,
    dead: 0,
    lastSyncAtMs: null,
    isOnline: false,
  };
  const listeners = new Set<(s: SyncSnapshot) => void>();

  return {
    getSnapshot() {
      return { ...snapshot };
    },
    update(patch) {
      snapshot = { ...snapshot, ...patch };
      for (const l of listeners) {
        l({ ...snapshot });
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export { defaultClockSkew };
export type { OutboxMutation };
