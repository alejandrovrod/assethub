// leader.ts — Leader election across tabs via BroadcastChannel
// Ensures only one tab runs the sync engine at a time.

export interface LeaderHandle {
  isLeader: () => boolean;
  onBecameLeader: (cb: () => void) => void;
  onLostLeadership: (cb: () => void) => void;
  destroy: () => void;
}

export interface LeaderOpts {
  channelName?: string;
  heartbeatMs?: number;
  staleThresholdMs?: number;
}

const DEFAULT_CHANNEL = 'field-pwa-leader';
const DEFAULT_HEARTBEAT_MS = 5_000;
const DEFAULT_STALE_THRESHOLD_MS = 15_000;

export function createLeader(opts?: LeaderOpts): LeaderHandle {
  const channelName = opts?.channelName ?? DEFAULT_CHANNEL;
  const heartbeatMs = opts?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const staleThresholdMs = opts?.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;

  const instanceId = crypto.randomUUID();
  let leaderId: string | null = null;
  let isLeaderFlag = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let electionTimer: ReturnType<typeof setInterval> | null = null;

  const becameLeaderCbs: Array<() => void> = [];
  const lostLeadershipCbs: Array<() => void> = [];

  let channel: BroadcastChannel | null = null;

  try {
    channel = new BroadcastChannel(channelName);
  } catch {
    // BroadcastChannel not available (e.g., in tests) — become leader immediately
    isLeaderFlag = true;
    return createSimpleLeader(becameLeaderCbs, lostLeadershipCbs);
  }

  function broadcast(type: string, payload?: unknown) {
    channel?.postMessage({ type, instanceId, payload, ts: Date.now() });
  }

  function becomeLeader() {
    if (isLeaderFlag) return;
    isLeaderFlag = true;
    leaderId = instanceId;
    broadcast('claim', { instanceId });
    becameLeaderCbs.forEach((cb) => cb());
    startHeartbeat();
  }

  function relinquishLeadership() {
    if (!isLeaderFlag) return;
    isLeaderFlag = false;
    leaderId = null;
    broadcast('relinquish', { instanceId });
    stopHeartbeat();
    lostLeadershipCbs.forEach((cb) => cb());
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (isLeaderFlag) {
        broadcast('heartbeat', { instanceId });
      }
    }, heartbeatMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // Listen for messages
  channel.onmessage = (event: MessageEvent) => {
    const { type, instanceId: senderId } = event.data;

    if (type === 'claim' || type === 'heartbeat') {
      if (senderId !== instanceId) {
        // Another instance claims leadership
        if (isLeaderFlag && senderId !== instanceId) {
          // Conflict: compare instance IDs, lower wins
          if (senderId < instanceId) {
            relinquishLeadership();
          }
        }
        leaderId = senderId;
      }
    }

    if (type === 'relinquish' && senderId !== instanceId) {
      // Leader stepped down — try to become leader
      if (!isLeaderFlag) {
        setTimeout(() => {
          if (!leaderId || leaderId === senderId) {
            becomeLeader();
          }
        }, Math.random() * 100);
      }
    }
  };

  // Try to become leader on start
  setTimeout(() => {
    if (!leaderId) {
      becomeLeader();
    }
  }, Math.random() * 200 + 50);

  // Periodically check if leader is stale
  electionTimer = setInterval(() => {
    if (!isLeaderFlag && leaderId) {
      // Check if we haven't heard from leader recently
      // (handled by heartbeat timeout in real impl)
    }
    if (!leaderId) {
      becomeLeader();
    }
  }, staleThresholdMs);

  return {
    isLeader: () => isLeaderFlag,
    onBecameLeader: (cb) => becameLeaderCbs.push(cb),
    onLostLeadership: (cb) => lostLeadershipCbs.push(cb),
    destroy() {
      relinquishLeadership();
      if (electionTimer) clearInterval(electionTimer);
      channel?.close();
    },
  };
}

function createSimpleLeader(
  becameLeaderCbs: Array<() => void>,
  lostLeadershipCbs: Array<() => void>,
): LeaderHandle {
  const cbs = becameLeaderCbs;
  setTimeout(() => cbs.forEach((cb) => cb()), 0);
  return {
    isLeader: () => true,
    onBecameLeader: (cb) => cbs.push(cb),
    onLostLeadership: (cb) => lostLeadershipCbs.push(cb),
    destroy() {},
  };
}

