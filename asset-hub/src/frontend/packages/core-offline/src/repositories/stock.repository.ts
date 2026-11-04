import type { FieldDatabase } from '../db/database';
import type { MaterialStockRecord } from '../db/schema';

export class StockRepository {
  constructor(private db: FieldDatabase) {}

  async getById(id: string): Promise<MaterialStockRecord | undefined> {
    return this.db.materials_stock.get(id);
  }

  async findByWarehouse(tenantId: string, warehouseId: string): Promise<MaterialStockRecord[]> {
    return this.db.materials_stock
      .where('[tenantId+warehouseId]')
      .equals([tenantId, warehouseId])
      .toArray();
  }

  /**
   * Available quantity = qtyAvailableServer - qtyReservedLocal (derived dynamically).
   */
  async getAvailable(warehouseId: string, materialId: string): Promise<number> {
    const id = `${warehouseId}:${materialId}`;
    const record = await this.db.materials_stock.get(id);
    if (!record) {
      return 0;
    }
    return record.qtyAvailableServer - record.qtyReservedLocal;
  }

  async reserve(warehouseId: string, materialId: string, qty: number): Promise<void> {
    const id = `${warehouseId}:${materialId}`;
    const record = await this.db.materials_stock.get(id);
    if (!record) {
      throw new Error(`Stock record not found for warehouse ${warehouseId} and material ${materialId}`);
    }

    const newReserved = record.qtyReservedLocal + qty;
    if (!record.allowNegativeStock && record.qtyAvailableServer - newReserved < 0) {
      throw new Error(`Insufficient stock for material ${record.name} (${record.sku})`);
    }

    await this.db.materials_stock.update(id, {
      qtyReservedLocal: newReserved,
    });
  }

  async upsert(record: MaterialStockRecord): Promise<string> {
    await this.db.materials_stock.put(record);
    return record.id;
  }

  async upsertMany(records: MaterialStockRecord[]): Promise<void> {
    await this.db.materials_stock.bulkPut(records);
  }
}

