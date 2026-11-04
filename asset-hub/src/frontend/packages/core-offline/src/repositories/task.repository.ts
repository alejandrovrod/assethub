import type { FieldDatabase } from '../db/database';
import type { TaskRecord, TaskState, SyncState, GeoStamp } from '../db/schema';
import { matchesActorInProperties, parseProperties } from './assignment';

export interface AssignmentFilter {
  tenantId: string;
  userId?: string;
  employeeId?: string;
  teamIds?: string[];
}

export const DEFAULT_TASK_ALLOWED_TRANSITIONS: Record<TaskState, TaskState[]> = {
  todo: ['in_progress', 'cancelled'],
  rework: ['in_progress', 'cancelled'],
  in_progress: ['paused', 'done', 'cancelled'],
  paused: ['in_progress', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};

export class TaskRepository {
  constructor(private db: FieldDatabase) { }

  async getById(id: string): Promise<TaskRecord | undefined> {
    return this.db.tasks.get(id);
  }

  async findAssignedTo(tenantId: string, assignedToId: string): Promise<TaskRecord[]> {
    return this.db.tasks
      .where('[tenantId+assignedToId]')
      .equals([tenantId, assignedToId])
      .sortBy('dueAtMs');
  }

  /**
   * Returns only tasks the actor EXECUTES.
   *
   * The assignee lives in `propertiesJson` (`asignar_a` / `asignado_a`), not in the
   * `AssignedEmployeeId` column. `reportar_a` and friends are follow-up, never assignment.
   * Rows without any dynamic properties predate the template model and still use the column.
   * Without an identified actor we return nothing: showing the whole tenant would leak
   * everybody's work into "Mi Jornada".
   */
  async findForActor(filter: AssignmentFilter): Promise<TaskRecord[]> {
    const teamSet = new Set((filter.teamIds ?? []).map((id) => id.toLowerCase()));
    const empId = filter.employeeId?.toLowerCase();
    const userId = filter.userId?.toLowerCase();

    if (!empId && !userId && teamSet.size === 0) {
      return [];
    }

    const allTenantTasks = await this.db.tasks
      .where('tenantId')
      .equals(filter.tenantId)
      .toArray();

    return allTenantTasks
      .filter((t) => {
        if (matchesActorInProperties(t.propertiesJson, [empId, userId])) return true;

        const teamId = (t.assignedTeamId ?? t.teamId)?.toLowerCase();
        if (teamId && teamSet.has(teamId)) return true;

        // Legacy rows only: once a row carries dynamic properties, the properties decide
        // who executes it and the column must not resurrect an old owner.
        if (parseProperties(t.propertiesJson) !== undefined) return false;

        const columnEmployee = (t.assignedEmployeeId ?? t.assignedToId)?.toLowerCase();
        if (empId && columnEmployee === empId) return true;
        if (userId && t.assignedToId?.toLowerCase() === userId) return true;

        return false;
      })
      .sort((a, b) => a.dueAtMs - b.dueAtMs);
  }

  async findByMaintenanceOrderId(tenantId: string, maintenanceOrderId: string): Promise<TaskRecord[]> {
    const targetOrderId = maintenanceOrderId.toLowerCase();
    const allTasks = await this.db.tasks.toArray();
    return allTasks
      .filter((t) => {
        if (tenantId && t.tenantId && t.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
          return false;
        }
        return t.maintenanceOrderId?.toLowerCase() === targetOrderId;
      })
      .sort((a, b) => a.dueAtMs - b.dueAtMs);
  }

  /**
   * Parity with apps/web WorkTaskDetail:
   * A task cannot change state if its parent MaintenanceOrder is not in 'in_progress'.
   */
  isStateChangeBlocked(task: TaskRecord): boolean {
    return Boolean(
      task.maintenanceOrderState && task.maintenanceOrderState !== 'in_progress'
    );
  }

  /**
   * Parity with apps/web WorkTaskDetail:
   * Info/properties editing is blocked when task is done/cancelled or parent order is done/verified/cancelled.
   */
  isEditBlocked(task: TaskRecord): boolean {
    if (task.state === 'done' || task.state === 'cancelled') return true;
    if (
      task.maintenanceOrderState &&
      ['done', 'verified', 'cancelled'].includes(task.maintenanceOrderState)
    ) {
      return true;
    }
    return false;
  }

  getAllowedTransitions(task: TaskRecord): TaskState[] {
    if (this.isStateChangeBlocked(task)) return [];
    return task.allowedTransitions ?? DEFAULT_TASK_ALLOWED_TRANSITIONS[task.state] ?? [];
  }

  async countBySyncState(tenantId: string): Promise<Record<SyncState, number>> {
    const records = await this.db.tasks
      .where('tenantId')
      .equals(tenantId)
      .toArray();

    const counts: Record<SyncState, number> = {
      synced: 0,
      pending: 0,
      conflict: 0,
      blocked: 0,
      dead: 0,
    };

    for (const r of records) {
      if (counts[r.syncState] !== undefined) {
        counts[r.syncState]++;
      }
    }
    return counts;
  }

  async purgeOldSynced(retentionMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const thresholdMs = Date.now() - retentionMs;
    const toDelete = await this.db.tasks
      .where('state')
      .equals('done')
      .filter((t) => t.syncState === 'synced' && t.cachedAtMs < thresholdMs)
      .primaryKeys();

    await this.db.tasks.bulkDelete(toDelete);
    return toDelete.length;
  }

  async upsert(task: TaskRecord): Promise<string> {
    await this.db.tasks.put(task);
    return task.id;
  }

  async upsertMany(tasks: TaskRecord[]): Promise<void> {
    await this.db.tasks.bulkPut(tasks);
  }

  async updateState(
    id: string,
    state: TaskState,
    syncState: SyncState = 'pending',
    monotonicMs?: number,
    geo?: GeoStamp
  ): Promise<void> {
    const current = await this.db.tasks.get(id);
    if (current && this.isStateChangeBlocked(current)) {
      throw new Error(
        `Cannot transition task ${id} while parent maintenance order is in state '${current.maintenanceOrderState}'`
      );
    }

    const now = Date.now();
    const updatePayload: Partial<TaskRecord> = {
      state,
      syncState,
      updatedAtLocalMs: now,
    };

    if (monotonicMs !== undefined) {
      updatePayload.monotonicMs = monotonicMs;
    }

    if (state === 'in_progress') {
      updatePayload.startedAtLocalIso = new Date().toISOString();
      if (geo) updatePayload.geoStart = geo;
    } else if (state === 'done') {
      updatePayload.completedAtLocalIso = new Date().toISOString();
      if (geo) updatePayload.geoEnd = geo;
    }

    await this.db.tasks.update(id, updatePayload);
  }
}
