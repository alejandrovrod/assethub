// asset-material.repository.ts — Repository for asset BOM materials
import type { FieldDatabase } from '../db/database';
import type { AssetMaterialRecord } from '../db/schema';

export class AssetMaterialRepository {
  constructor(private db: FieldDatabase) {}

  async findByAsset(assetId: string): Promise<AssetMaterialRecord[]> {
    return this.db.asset_bom_materials.where('assetId').equals(assetId).toArray();
  }

  async upsert(record: AssetMaterialRecord): Promise<void> {
    await this.db.asset_bom_materials.put(record);
  }

  async delete(id: string): Promise<void> {
    await this.db.asset_bom_materials.delete(id);
  }
}
