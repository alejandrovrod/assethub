// order-part.repository.ts — Repository for maintenance order parts
import type { FieldDatabase } from '../db/database';
import type { MaintenanceOrderPartRecord } from '../db/schema';

export class OrderPartRepository {
  constructor(private db: FieldDatabase) {}

  async findByOrder(orderId: string): Promise<MaintenanceOrderPartRecord[]> {
    return this.db.order_parts.where('orderId').equals(orderId).toArray();
  }

  async upsert(record: MaintenanceOrderPartRecord): Promise<void> {
    await this.db.order_parts.put(record);
  }

  async delete(id: string): Promise<void> {
    await this.db.order_parts.delete(id);
  }
}
