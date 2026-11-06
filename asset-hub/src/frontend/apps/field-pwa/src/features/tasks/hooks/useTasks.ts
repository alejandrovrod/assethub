// useTasks.ts — React hook for task list with live query and urgency grouping
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TaskRepository, type TaskRecord } from '@asset-hub/core-offline';

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
