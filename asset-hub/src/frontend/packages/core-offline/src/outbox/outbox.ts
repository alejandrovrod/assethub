import { type Transaction } from 'dexie';
import type { OutboxMutation } from '../db/schema';
import { uuidv7 } from '../util/uuidv7';

const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function enqueue(
  tx: Transaction,
  mutation: Omit<OutboxMutation, 'id' | 'attempts' | 'nextAttemptAtMs' | 'createdAtMs'> & {
    id?: string;
  },
): Promise<string> {
  if (!tx.active) {
    throw new Error('enqueue must be called within an active Dexie transaction');
  }

  let id: string;
  if (mutation.id !== undefined) {
    if (!UUID_V7_RE.test(mutation.id)) {
      throw new Error(
        `enqueue: id "${mutation.id}" is not a valid UUIDv7`,
      );
    }
    id = mutation.id;
  } else {
    id = uuidv7();
  }

  const record: OutboxMutation = {
    ...mutation,
    id,
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now(),
    status: mutation.status ?? 'pending',
  };

  await tx.table('outbox_mutations').add(record);
  return id;
}

export async function enqueueOrCoalesce(
  tx: Transaction,
  mutation: Omit<OutboxMutation, 'id' | 'attempts' | 'nextAttemptAtMs' | 'createdAtMs'> & {
    id?: string;
  },
): Promise<string> {
  if (!tx.active) {
    throw new Error('enqueue must be called within an active Dexie transaction');
  }

  const table = tx.table<OutboxMutation, string>('outbox_mutations');
  const isDeduplicating =
    mutation.operation === 'task.state' || mutation.operation === 'task.checklist';

  if (isDeduplicating) {
    const existing = await table
      .where('aggregateId')
      .equals(mutation.aggregateId)
      .filter((m) => m.operation === mutation.operation && m.status === 'pending')
      .first();

    if (existing) {
      if (existing.attempts > 0) {
        await table.delete(existing.id);
        return enqueue(tx, mutation);
      }
      await table.update(existing.id, {
        bodyJson: mutation.bodyJson,
        headersJson: mutation.headersJson,
        path: mutation.path,
        method: mutation.method,
        priority: mutation.priority ?? existing.priority,
      });
      return existing.id;
    }
  }

  return enqueue(tx, mutation);
}
