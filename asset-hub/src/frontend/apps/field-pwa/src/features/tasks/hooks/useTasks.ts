// useTasks.ts — React hook for task list with live query and urgency grouping
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TaskRepository, type SyncState, type TaskRecord } from '@asset-hub/core-offline';

/**
 * Literal translation keys for the task domain. Technical values coming from the
 * API/Dexie ('in_progress', 'pending', …) are never translated: they are mapped
 * to these keys so the UI can render a localized label.
 */
export type TaskStateKey =
  | 'states.draft'
  | 'states.todo'
  | 'states.inProgress'
  | 'states.paused'
  | 'states.done'
  | 'states.verified'
  | 'states.cancelled'
  | 'states.rework';

export const STATE_LABELS: Record<string, TaskStateKey> = {
  draft: 'states.draft',
  todo: 'states.todo',
  ready: 'states.todo',
  in_progress: 'states.inProgress',
  paused: 'states.paused',
  done: 'states.done',
  verified: 'states.verified',
  cancelled: 'states.cancelled',
  rework: 'states.rework',
};

export type OrderStateKey =
  | 'orderStates.draft'
  | 'orderStates.approved'
  | 'orderStates.scheduled'
  | 'orderStates.inProgress'
  | 'orderStates.done'
  | 'orderStates.rescheduled'
  | 'orderStates.verified'
  | 'orderStates.cancelled';

export const ORDER_STATE_LABELS: Record<string, OrderStateKey> = {
  draft: 'orderStates.draft',
  approved: 'orderStates.approved',
  scheduled: 'orderStates.scheduled',
  in_progress: 'orderStates.inProgress',
  done: 'orderStates.done',
  rescheduled: 'orderStates.rescheduled',
  verified: 'orderStates.verified',
  cancelled: 'orderStates.cancelled',
};

export type SyncStateKey =
  | 'syncStates.synced'
  | 'syncStates.pending'
  | 'syncStates.conflict'
  | 'syncStates.blocked'
  | 'syncStates.dead';

export const SYNC_STATE_LABELS: Record<SyncState, SyncStateKey> = {
  synced: 'syncStates.synced',
  pending: 'syncStates.pending',
  conflict: 'syncStates.conflict',
  blocked: 'syncStates.blocked',
  dead: 'syncStates.dead',
};

export type PriorityKey = 'priority.low' | 'priority.medium' | 'priority.high' | 'priority.critical';

/** Priority arrives as a free-form label from the catalog; unknown values render as-is. */
export const PRIORITY_LABELS: Record<string, PriorityKey> = {
  low: 'priority.low',
  medium: 'priority.medium',
  high: 'priority.high',
  critical: 'priority.critical',
};

export interface UrgencyGroups {
  conflicts: TaskRecord[];
  rework: TaskRecord[];
  overdue: TaskRecord[];
  today: TaskRecord[];
  upcoming: TaskRecord[];
  completed: TaskRecord[];
}

export function groupTasksByUrgency(tasks: TaskRecord[]): UrgencyGroups {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000 - 1;

  const conflicts: TaskRecord[] = [];
  const rework: TaskRecord[] = [];
  const overdue: TaskRecord[] = [];
  const today: TaskRecord[] = [];
  const upcoming: TaskRecord[] = [];
  const completed: TaskRecord[] = [];

  for (const t of tasks) {
    if (t.syncState === 'conflict') {
      conflicts.push(t);
    } else if (t.state === 'done' || t.state === 'cancelled') {
      completed.push(t);
    } else if (t.state === 'rework') {
      rework.push(t);
    } else if (t.dueAtMs > 0 && t.dueAtMs < startOfToday) {
      overdue.push(t);
    } else if (t.dueAtMs >= startOfToday && t.dueAtMs <= endOfToday) {
      today.push(t);
    } else {
      upcoming.push(t);
    }
  }

  completed.sort((a, b) => b.dueAtMs - a.dueAtMs);

  return { conflicts, rework, overdue, today, upcoming, completed };
}

export function useTasks(
  assignedToIdOrFilter?: string | { tenantId: string; userId?: string; employeeId?: string; teamIds?: string[] },
) {
  const repo = new TaskRepository(db);

  const tasks = useLiveQuery(
    async () => {
      if (!assignedToIdOrFilter) {
        return db.tasks.toArray();
      }
      if (typeof assignedToIdOrFilter === 'string') {
        return db.tasks.where('assignedToId').equals(assignedToIdOrFilter).sortBy('dueAtMs');
      }
      return repo.findForActor(assignedToIdOrFilter);
    },
    [
      typeof assignedToIdOrFilter === 'string'
        ? assignedToIdOrFilter
        : JSON.stringify(assignedToIdOrFilter),
    ],
  );

  const groups: UrgencyGroups = tasks
    ? groupTasksByUrgency(tasks)
    : { conflicts: [], rework: [], overdue: [], today: [], upcoming: [], completed: [] };

  return {
    tasks: tasks ?? [],
    groups,
    isLoading: tasks === undefined,
  };
}

export function useTask(taskId: string) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId]);
  return {
    task: task ?? null,
    isLoading: task === undefined,
  };
}
