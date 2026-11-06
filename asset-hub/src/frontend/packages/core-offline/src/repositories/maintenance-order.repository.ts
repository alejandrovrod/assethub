import type { FieldDatabase } from '../db/database';
import type {
  MaintenanceOrderRecord,
  MaintenanceOrderPartRecord,
  MaintenanceOrderState,
  AssetMaterialRecord,
  SyncState,
} from '../db/schema';
import type { AssignmentFilter } from './task.repository';
import { matchesActorInProperties, parseProperties } from './assignment';

export const DEFAULT_ORDER_ALLOWED_TRANSITIONS: Record<
  MaintenanceOrderState,
  MaintenanceOrderState[]
> = {
  draft: ['approved', 'cancelled'],
  approved: ['scheduled', 'in_progress', 'cancelled'],
  scheduled: ['in_progress', 'rescheduled', 'cancelled'],
  rescheduled: ['in_progress', 'cancelled'],
  in_progress: ['done', 'rescheduled', 'cancelled'],
  done: ['verified', 'in_progress'],
  verified: [],
  cancelled: [],
};

export class MaintenanceOrderRepository {
  constructor(private db: FieldDatabase) {}

  async getById(id: string): Promise<MaintenanceOrderRecord | undefined> {
    return this.db.maintenance_orders.get(id);
  }

  /**
   * Returns only maintenance orders assigned to the current employee or any of their teams.
   */
  async findForActor(filter: AssignmentFilter): Promise<MaintenanceOrderRecord[]> {
    const teamSet = new Set((filter.teamIds ?? []).map((id) => id.toLowerCase()));
    const empId = filter.employeeId?.toLowerCase();
    const userId = filter.userId?.toLowerCase();

    const allOrders = await this.db.maintenance_orders
      .where('tenantId')
      .equals(filter.tenantId)
      .toArray();

    return allOrders
      .filter((order) => {
        // Fallback: If no actor filter is provided (e.g. admin or unlinked user), show all tenant orders
        if (!empId && !userId && teamSet.size === 0) {
          return true;
        }

        // The properties are the source of truth for assignment (see repositories/assignment.ts).
        if (matchesActorInProperties(order.propertiesJson, [empId, userId])) return true;

        const teamId = order.assignedTeamId?.toLowerCase();
        if (teamId && teamSet.has(teamId)) return true;

        // Legacy rows only: once a row carries dynamic properties, the properties decide
        // who executes it and the column must not resurrect an old owner.
        if (parseProperties(order.propertiesJson) !== undefined) return false;

        const orderEmp = order.assignedEmployeeId?.toLowerCase();
        if (empId && orderEmp === empId) return true;
        if (userId && (orderEmp === userId || (order as any).assignedToId?.toLowerCase() === userId)) {
          return true;
        }

        return false;
      })
      .sort((a, b) => a.scheduledStartMs - b.scheduledStartMs);
  }

  async findByAssetId(assetId: string): Promise<MaintenanceOrderRecord[]> {
    return this.db.maintenance_orders
      .where('assetId')
      .equals(assetId)
      .toArray();
  }

  getAllowedTransitions(order: MaintenanceOrderRecord): MaintenanceOrderState[] {
    return (
      order.allowedTransitions ??
      DEFAULT_ORDER_ALLOWED_TRANSITIONS[order.state] ??
      []
    );
  }

  isPartsLocked(order: MaintenanceOrderRecord): boolean {
    return order.state === 'verified';
  }

  async upsert(order: MaintenanceOrderRecord): Promise<string> {
    await this.db.maintenance_orders.put(order);
    return order.id;
  }

  async upsertMany(orders: MaintenanceOrderRecord[]): Promise<void> {
    await this.db.maintenance_orders.bulkPut(orders);
  }

  /**
   * Updates the maintenance order state AND propagates `maintenanceOrderState`
   * to all child tasks in the same Dexie transaction so child task state-locks
   * react immediately offline.
   */
  async updateStateAndPropagate(
    id: string,
    newState: MaintenanceOrderState,
    syncState: SyncState = 'pending'
  ): Promise<void> {
    const now = Date.now();
    await this.db.transaction('rw', [this.db.maintenance_orders, this.db.tasks], async () => {
      const order = await this.db.maintenance_orders.get(id);
      if (!order) {
        throw new Error(`MaintenanceOrder ${id} not found`);
      }

      const patch: Partial<MaintenanceOrderRecord> = {
        state: newState,
        syncState,
        updatedAtLocalMs: now,
      };

      if (newState === 'in_progress' && !order.startedAtLocalIso) {
        patch.startedAtLocalIso = new Date(now).toISOString();
      } else if (newState === 'done') {
        patch.completedAtLocalIso = new Date(now).toISOString();
      }

      await this.db.maintenance_orders.update(id, patch);

      // Propagate maintenanceOrderState to all child tasks
      await this.db.tasks
        .where('[tenantId+maintenanceOrderId]')
        .equals([order.tenantId, id])
        .modify({
          maintenanceOrderState: newState,
          updatedAtLocalMs: now,
        });
    });
  }

  // ── Order Parts & BOM Integration (MaintenanceOrderPartsEditor parity) ──
  async getParts(
    tenantId: string,
    orderId: string
  ): Promise<MaintenanceOrderPartRecord[]> {
    const targetOrderId = orderId.toLowerCase();
    const allParts = await this.db.order_parts.toArray();
    return allParts.filter((p) => {
      if (tenantId && p.tenantId && p.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
        return false;
      }
      return p.orderId?.toLowerCase() === targetOrderId;
    });
  }

  /**
   * Returns the compatible BOM spare parts from the order's linked asset.
   */
  async getSuggestedBomPartsForOrder(
    orderId: string
  ): Promise<AssetMaterialRecord[]> {
    const order = await this.db.maintenance_orders.get(orderId);
    if (!order || !order.assetId) return [];
    return this.db.asset_bom_materials
      .where('[tenantId+assetId]')
      .equals([order.tenantId, order.assetId])
      .toArray();
  }

  async addPart(part: MaintenanceOrderPartRecord): Promise<string> {
    const order = await this.db.maintenance_orders.get(part.orderId);
    if (order && this.isPartsLocked(order)) {
      throw new Error(`Cannot add parts to a verified maintenance order (${part.orderId})`);
    }
    if (part.sourceType === 'Internal' && !part.warehouseId) {
      throw new Error('warehouseId is required when sourceType is Internal');
    }
    await this.db.order_parts.put(part);
    return part.id;
  }

  async removePart(orderId: string, partId: string): Promise<void> {
    const order = await this.db.maintenance_orders.get(orderId);
    if (order && this.isPartsLocked(order)) {
      throw new Error(`Cannot remove parts from a verified maintenance order (${orderId})`);
    }
    await this.db.order_parts.delete(partId);
  }
}
