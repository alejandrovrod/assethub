import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import { createSyncEngine, type SyncEvent } from './scheduler';
import type { DrainerHandle } from './drainer';

describe('createSyncEngine scheduler (T053)', () => {
  let db: FieldDatabase;

  beforeEach(() => {
    db = createFieldDatabase(`test-scheduler-${Date.now()}-${Math.random()}`);
  });

  function createMockDrainer(): DrainerHandle {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      drainOnce: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('runs pull and push during drainNow when online and emits events', async () => {
    const drainer = createMockDrainer();
    const pullFn = vi.fn().mockResolvedValue({ pulled: 5 });
    const pushFn = vi.fn().mockResolvedValue({ pushed: 2 });
    let onlineState = true;

    const events: SyncEvent[] = [];
    const engine = createSyncEngine({
      db,
      drainer,
      isOnline: () => onlineState,
      pullFn,
      pushFn,
    });

    const unsub = engine.onEvent((e) => events.push(e));

    await engine.drainNow();

    expect(pullFn).toHaveBeenCalledTimes(1);
    expect(drainer.start).toHaveBeenCalledTimes(1);
    expect(pushFn).toHaveBeenCalledTimes(1);

    expect(events.some((e) => e.type === 'sync:start')).toBe(true);
    expect(events.some((e) => e.type === 'sync:complete' && e.pulled === 5 && e.pushed === 2)).toBe(true);
    expect(events.some((e) => e.type === 'outbox:changed')).toBe(true);

    const snapshot = engine.getSnapshot();
    expect(snapshot.isOnline).toBe(true);
    expect(snapshot.lastSyncAt).toBeGreaterThan(0);

    unsub();
  });

  it('skips drainNow when offline', async () => {
    const drainer = createMockDrainer();
    const pullFn = vi.fn();
    const pushFn = vi.fn();

    const engine = createSyncEngine({
      db,
      drainer,
      isOnline: () => false,
      pullFn,
      pushFn,
    });

    await engine.drainNow();

    expect(pullFn).not.toHaveBeenCalled();
    expect(drainer.start).not.toHaveBeenCalled();
    expect(pushFn).not.toHaveBeenCalled();
  });

  it('triggers drain when connectivity changes to online', async () => {
    const drainer = createMockDrainer();
    const pullFn = vi.fn().mockResolvedValue({ pulled: 0 });
    let onlineListener: ((online: boolean) => void) | null = null;
    let isOnline = false;

    const engine = createSyncEngine({
      db,
      drainer,
      isOnline: () => isOnline,
      onOnlineChange: (cb) => {
        onlineListener = cb;
        return () => {
          onlineListener = null;
        };
      },
      pullFn,
    });

    engine.start();

    // Trigger online
    isOnline = true;
    if (onlineListener) {
      (onlineListener as (online: boolean) => void)(true);
    }

    // Give microtask queue time to run drainNow
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(pullFn).toHaveBeenCalled();

    engine.stop();
  });

  it('emits error event when pull fails', async () => {
    const drainer = createMockDrainer();
    const error = new Error('Network error');
    const pullFn = vi.fn().mockRejectedValue(error);

    const events: SyncEvent[] = [];
    const engine = createSyncEngine({
      db,
      drainer,
      isOnline: () => true,
      pullFn,
    });

    engine.onEvent((e) => events.push(e));

    await engine.drainNow();

    const errorEvent = events.find((e) => e.type === 'sync:error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as any)?.error).toBe(error);

    const snapshot = engine.getSnapshot();
    expect(snapshot.lastError).toBe(error);
  });
});
