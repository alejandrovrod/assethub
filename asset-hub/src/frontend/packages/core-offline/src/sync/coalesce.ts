import type { OutboxMutation } from '../db/schema';

/**
 * Operations that deduplicate (keep only latest per aggregate).
 */
const DEDUPLICATE_OPS = new Set<OutboxMutation['operation']>([
  'task.state',
  'task.checklist',
]);

/**
 * Operations that are NEVER coalesced — always append.
 */
const ALWAYS_APPEND_OPS = new Set<OutboxMutation['operation']>([
  'incident.create',
  'material.consume',
  'evidence.create',
]);

/**
 * Coalesce an incoming mutation against an existing queue.
 *
 * - `task.state` / `task.checklist`: mark previous mutations for the same
 *   aggregate as 'discarded' and keep only the latest.
 * - `incident.create`, `material.consume`, `evidence.create`: always append.
 * - Everything else: always append.
 *
 * The returned array is a NEW array; the originals are not mutated.
 */
export function coalesce(
  existing: OutboxMutation[],
  incoming: OutboxMutation,
): OutboxMutation[] {
  if (ALWAYS_APPEND_OPS.has(incoming.operation)) {
    return [...existing, incoming];
  }

  if (DEDUPLICATE_OPS.has(incoming.operation)) {
    const updated = existing.map((m) => {
      if (
        m.operation === incoming.operation &&
        m.aggregateId === incoming.aggregateId &&
        m.status === 'pending'
      ) {
        return { ...m, status: 'discarded' as const };
      }
      return m;
    });
    return [...updated, incoming];
  }

  // Default: always append
  return [...existing, incoming];
}
