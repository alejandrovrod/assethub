import { describe, it, expect, vi } from 'vitest';
import { SessionStateMachine } from './session-state';

describe('SessionStateMachine (T066)', () => {
  it('navigates normal offline operational lifecycle', () => {
    const sm = new SessionStateMachine('ACTIVE');
    expect(sm.isOperational()).toBe(true);

    // Go offline with valid lease
    sm.transition('GO_OFFLINE');
    expect(sm.getState()).toBe('OFFLINE_LEASE');
    expect(sm.isOperational()).toBe(true);

    // Lease expires -> read-only
    sm.transition('LEASE_EXPIRED');
    expect(sm.getState()).toBe('OFFLINE_READONLY');
    expect(sm.isOperational()).toBe(false);
    expect(sm.isReadOnly()).toBe(true);

    // Connection restored -> active
    sm.transition('CONNECTION_RESTORED');
    expect(sm.getState()).toBe('ACTIVE');
    expect(sm.isOperational()).toBe(true);
  });

  it('handles device lock and pin unlock flow', () => {
    const sm = new SessionStateMachine('ACTIVE');

    sm.transition('PIN_REQUIRED');
    expect(sm.getState()).toBe('LOCKED');
    expect(sm.isLocked()).toBe(true);

    sm.transition('PIN_VERIFIED');
    expect(sm.getState()).toBe('ACTIVE');
    expect(sm.isLocked()).toBe(false);
  });

  it('wipes session when PIN attempts exceeded or on logout', () => {
    const sm = new SessionStateMachine('LOCKED');

    sm.transition('PIN_FAILED_MAX');
    expect(sm.getState()).toBe('WIPED');
    expect(sm.isWiped()).toBe(true);
  });

  it('triggers listeners on state change', () => {
    const sm = new SessionStateMachine('ACTIVE');
    const listener = vi.fn();
    const unsub = sm.onStateChange(listener);

    sm.transition('GO_OFFLINE');
    expect(listener).toHaveBeenCalledWith('OFFLINE_LEASE');

    unsub();
    sm.transition('CONNECTION_RESTORED');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('throws on invalid transitions', () => {
    const sm = new SessionStateMachine('WIPED');
    expect(() => sm.transition('GO_OFFLINE')).toThrow(/Invalid transition/);
  });
});

