import { describe, it, expect, vi } from 'vitest';
import { createLeader } from './leader';

describe('leader election (T050)', () => {
  it('elects leader and triggers onBecameLeader callback', async () => {
    const leader = createLeader({
      channelName: `test-leader-${Date.now()}-${Math.random()}`,
      heartbeatMs: 100,
      staleThresholdMs: 300,
    });

    const becameLeaderCb = vi.fn();
    leader.onBecameLeader(becameLeaderCb);

    // Wait for election timeout
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(leader.isLeader()).toBe(true);
    expect(becameLeaderCb).toHaveBeenCalled();

    leader.destroy();
  });

  it('notifies onLostLeadership when destroyed or relinquished', async () => {
    const leader = createLeader({
      channelName: `test-leader-loss-${Date.now()}-${Math.random()}`,
      heartbeatMs: 100,
      staleThresholdMs: 300,
    });

    const lostCb = vi.fn();
    leader.onLostLeadership(lostCb);

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(leader.isLeader()).toBe(true);

    leader.destroy();
    expect(leader.isLeader()).toBe(false);
    expect(lostCb).toHaveBeenCalled();
  });
});

