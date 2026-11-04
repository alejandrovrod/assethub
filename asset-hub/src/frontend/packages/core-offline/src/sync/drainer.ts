import type { FieldDatabase } from '../db/database';
import type { OutboxMutation } from '../db/schema';
import { resolveConflict } from './conflicts';
import { nextDelayMs } from './backoff';
import { uuidv7 } from '../util/uuidv7';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface HttpClient {
  post(
    path: string,
    body: unknown,
    opts?: { idempotencyKey?: string; etag?: string },
  ): Promise<{ status: number; body: unknown; headers: Record<string, string> }>;
  patch(
    path: string,
    body: unknown,
    opts?: { idempotencyKey?: string; etag?: string },
  ): Promise<{ status: number; body: unknown; headers: Record<string, string> }>;
  refreshToken(): Promise<void>;
}

export interface DrainerHandle {
  start(): void;
  stop(): void;
  drainOnce(): Promise<void>;
}

export interface DrainerOpts {
  instanceId?: string;
  maxParallel?: number;
  leaseDurationMs?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_PARALLEL = 3;
const DEFAULT_LEASE_DURATION_MS = 60_000;
const MAX_ATTEMPTS = 8;

// ── Implementation ────────────────────────────────────────────────────────────

export function createDrainer(
  db: FieldDatabase,
  http: HttpClient,
  opts?: DrainerOpts,
): DrainerHandle {
  const instanceId = opts?.instanceId ?? uuidv7();
  const maxParallel = opts?.maxParallel ?? DEFAULT_MAX_PARALLEL;
  const leaseDurationMs = opts?.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;

  let running = false;

  async function recoverStaleLeases(): Promise<void> {
    const now = Date.now();
    const stale = await db.outbox_mutations
      .where('status')
      .equals('in_flight')
      .filter((m) => (m.leaseExpiresAtMs ?? 0) < now)
      .toArray();

    for (const m of stale) {
      await db.outbox_mutations.update(m.id, {
        status: 'pending',
        leaseOwner: undefined,
        leaseExpiresAtMs: undefined,
      });
    }
  }

  async function claimBatch(): Promise<OutboxMutation[]> {
    const now = Date.now();
    const candidates = await db.outbox_mutations
      .where('status')
      .equals('pending')
      .filter((m) => m.nextAttemptAtMs <= now)
      .toArray();

    // Group by aggregateId, pick up to maxParallel unique aggregates
    const aggregateIds = new Set<string>();
    const claimed: OutboxMutation[] = [];

    for (const m of candidates) {
      const aggKey = `${m.aggregateType}/${m.aggregateId}`;
      if (aggregateIds.size >= maxParallel && !aggregateIds.has(aggKey)) {
        continue;
      }
      aggregateIds.add(aggKey);
    }

    for (const aggKey of aggregateIds) {
      const [aggType, aggId] = aggKey.split('/');
      // Get the first pending mutation (FIFO) for this aggregate
      const aggMutations = candidates
        .filter(
          (m) =>
            m.aggregateType === aggType &&
            m.aggregateId === aggId,
        )
        .sort((a, b) => a.createdAtMs - b.createdAtMs);

      if (aggMutations.length === 0) continue;
      const next = aggMutations[0];

      // Skip if dependsOn is not done
      if (next.dependsOn) {
        const dep = await db.outbox_mutations.get(next.dependsOn);
        if (!dep || dep.status !== 'done') {
          continue;
        }
      }

      // Claim with lease
      const leaseExpiresAtMs = Date.now() + leaseDurationMs;
      await db.outbox_mutations.update(next.id, {
        status: 'in_flight',
        leaseOwner: instanceId,
        leaseExpiresAtMs,
      });

      claimed.push({ ...next, status: 'in_flight', leaseOwner: instanceId, leaseExpiresAtMs });
    }

    return claimed;
  }

  async function processMutation(mutation: OutboxMutation): Promise<void> {
    let response: { status: number; body: unknown; headers: Record<string, string> };
    let retried = false;

    const method = mutation.method ?? 'POST';
    const callHttp = async () => {
      const rawEtag = mutation.headersJson
        ? (JSON.parse(mutation.headersJson) as Record<string, string>)['If-Match']
        : undefined;
      const trimmed = rawEtag?.trim();
      const formattedEtag =
        !trimmed || trimmed === '*'
          ? '*'
          : trimmed.startsWith('"') && trimmed.endsWith('"')
            ? trimmed
            : `"${trimmed}"`;
      const opts = {
        idempotencyKey: mutation.id,
        etag: formattedEtag,
      };
      const body = JSON.parse(mutation.bodyJson ?? 'null');
      if (method === 'PATCH') return http.patch(mutation.path, body, opts);
      if (method === 'PUT') return (http as any).put ? (http as any).put(mutation.path, body, opts) : http.post(mutation.path, body, opts);
      if (method === 'DELETE') return (http as any).delete ? (http as any).delete(mutation.path, opts) : http.post(mutation.path, body, opts);
      return http.post(mutation.path, body, opts);
    };

    try {
      response = await callHttp();
    } catch (err: unknown) {
      // Check for 401 — refresh and retry once
      const status = (err as { status?: number }).status;
      if (status === 401 && !retried) {
        retried = true;
        await http.refreshToken();
        try {
          response = await callHttp();
        } catch (retryErr: unknown) {
          await handleError(mutation, retryErr);
          return;
        }
      } else {
        await handleError(mutation, err);
        return;
      }
    }

    // 2xx success
    if (response!.status >= 200 && response!.status < 300) {
      await db.outbox_mutations.update(mutation.id, {
        status: 'done',
        responseJson: JSON.stringify(response!.body),
        attempts: mutation.attempts + 1,
        lastAttemptAtMs: Date.now(),
        leaseOwner: undefined,
        leaseExpiresAtMs: undefined,
      });

      if (mutation.aggregateType === 'task') {
        try {
          const resBody = response!.body as Record<string, unknown> | null;
          const rawEtag =
            (resBody?.etag as string | undefined) ??
            response!.headers?.['etag']?.replace(/^W\/|"$/g, '').replace(/^"/, '');
          const remainingPending = await db.outbox_mutations
            .where('aggregateId')
            .equals(mutation.aggregateId)
            .filter((m) => m.id !== mutation.id && m.status === 'pending')
            .count();
          await db.tasks.update(mutation.aggregateId, {
            ...(remainingPending === 0 ? { syncState: 'synced' } : {}),
            // The task row and its checklist row have independent rowversions: a checklist
            // response ETag must not overwrite the task ETag (or the next task update 412s).
            ...(rawEtag
              ? mutation.operation === 'task.checklist'
                ? { checklistVersion: rawEtag }
                : { version: rawEtag }
              : {}),
          });
        } catch {
          // Best-effort local state sync
        }
      } else if (mutation.aggregateType === 'incident') {
        try {
          await db.incidents.update(mutation.aggregateId, { syncState: 'synced' });
        } catch {
          // Best-effort local state sync
        }
      } else if (mutation.aggregateType === 'order') {
        try {
          await db.maintenance_orders.update(mutation.aggregateId, { syncState: 'synced' });
        } catch {
          // Best-effort local state sync
        }
      }
      return;
    }

    // Non-2xx — resolve conflict
    await handleNonSuccess(mutation, response!.status, response!.body, response!.headers);
  }

  async function handleError(mutation: OutboxMutation, err: unknown): Promise<void> {
    const status = (err as { status?: number }).status ?? 0;
    const body = (err as { body?: unknown }).body ?? {};
    await handleNonSuccess(mutation, status, body, {});
  }

  async function handleNonSuccess(
    mutation: OutboxMutation,
    status: number,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<void> {
    const errorCode =
      body && typeof body === 'object' && 'code' in body
        ? ((body as Record<string, unknown>)['code'] as string | undefined)
        : undefined;

    // If the Idempotency-Key was previously poisoned (e.g. method or payload changed after a failed attempt),
    // rotate the mutation ID to a fresh UUIDv7 so it can succeed on the next drain cycle.
    if (status === 409 && errorCode === 'idempotency_key_reuse') {
      const freshId = uuidv7();
      await db.outbox_mutations.delete(mutation.id);
      await db.outbox_mutations.add({
        ...mutation,
        id: freshId,
        status: 'pending',
        attempts: 0,
        // Back off one cycle: retrying inside the same drain() would hot-loop on the 409.
        nextAttemptAtMs: Date.now() + nextDelayMs(1),
        leaseOwner: undefined,
        leaseExpiresAtMs: undefined,
      });
      return;
    }
    const newAttempts = mutation.attempts + 1;

    if (newAttempts >= MAX_ATTEMPTS) {
      await db.outbox_mutations.update(mutation.id, {
        status: 'dead',
        attempts: newAttempts,
        lastAttemptAtMs: Date.now(),
        lastErrorCode: `http_${status}`,
        leaseOwner: undefined,
        leaseExpiresAtMs: undefined,
      });
      return;
    }

    const resolution = resolveConflict(mutation, { status, body });
    const retryAfterMs = headers['retry-after']
      ? parseInt(headers['retry-after'], 10) * 1000
      : undefined;
    const delay = nextDelayMs(newAttempts, { retryAfterMs });

    const patch: Partial<OutboxMutation> = {
      attempts: newAttempts,
      lastAttemptAtMs: Date.now(),
      lastErrorCode: `http_${status}`,
      leaseOwner: undefined,
      leaseExpiresAtMs: undefined,
      ...(resolution.patch ?? {}),
    };

    switch (resolution.action) {
      case 'discard':
        patch.status = 'discarded';
        break;
      case 'block':
        patch.status = 'blocked';
        break;
      case 'dead':
        patch.status = 'dead';
        break;
      case 'retry':
      default:
        patch.status = 'pending';
        patch.nextAttemptAtMs = Date.now() + delay;
        break;
    }

    await db.outbox_mutations.update(mutation.id, patch);
  }

  async function drain(): Promise<void> {
    await recoverStaleLeases();

    while (running) {
      const batch = await claimBatch();
      if (batch.length === 0) break;

      await Promise.all(batch.map((m) => processMutation(m)));
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      drain().catch(() => { });
    },

    stop() {
      running = false;
    },

    async drainOnce() {
      await recoverStaleLeases();
      const batch = await claimBatch();
      await Promise.all(batch.map((m) => processMutation(m)));
    },
  };
}
