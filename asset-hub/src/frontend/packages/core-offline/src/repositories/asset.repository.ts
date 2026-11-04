import type { FieldDatabase } from '../db/database';
import type {
  AssetRecord,
  AssetMaterialRecord,
  SyncState,
} from '../db/schema';
import { normalizeSearchText, normalizeSearchCode } from '../util/normalize';

export class AssetRepository {
  constructor(private db: FieldDatabase) {}

  async getById(id: string): Promise<AssetRecord | undefined> {
    return this.db.assets.get(id);
  }

  async findByCode(tenantId: string, code: string): Promise<AssetRecord | undefined> {
    return this.db.assets
      .where('[tenantId+code]')
      .equals([tenantId, code])
      .first();
  }

  async findBySearchCode(code: string): Promise<AssetRecord | undefined> {
    const normalized = normalizeSearchCode(code);
    return this.db.assets
      .where('searchCodes')
      .equals(normalized)
      .first();
  }

  async findChildren(parentId: string): Promise<AssetRecord[]> {
    return this.db.assets.where('parentId').equals(parentId).toArray();
  }

  /**
   * Search assets using prefix match on searchText, falling back to substring filter.
   */
  async search(query: string, limit: number = 20): Promise<AssetRecord[]> {
    const normalized = normalizeSearchText(query);
    if (!normalized) {
      return this.db.assets.limit(limit).toArray();
    }

    const prefixMatches = await this.db.assets
      .where('searchText')
      .startsWithIgnoreCase(normalized)
      .limit(limit)
      .toArray();

    if (prefixMatches.length >= limit) {
      return prefixMatches;
    }

    const existingIds = new Set(prefixMatches.map((a) => a.id));
    const fallbackMatches = await this.db.assets
      .filter((a) => !existingIds.has(a.id) && a.searchText.includes(normalized))
      .limit(limit - prefixMatches.length)
      .toArray();

    return [...prefixMatches, ...fallbackMatches];
  }

  async upsert(asset: AssetRecord): Promise<string> {
    await this.db.assets.put(asset);
    return asset.id;
  }

  async upsertMany(assets: AssetRecord[]): Promise<void> {
    await this.db.assets.bulkPut(assets);
  }

  /**
   * Updates asset dynamic properties, general fields, or GPS coordinates (`geoJson`) locally.
   * Mirrors `AssetDetailPage.updateMutation` in `apps/web`.
   */
  async updateDetails(
    id: string,
    patch: {
      code?: string;
      name?: string;
      propertiesJson?: string;
      latitude?: number;
      longitude?: number;
      geoJson?: string;
    },
    syncState: SyncState = 'pending'
  ): Promise<void> {
    let geoJson = patch.geoJson;
    if (
      geoJson === undefined &&
      patch.latitude !== undefined &&
      patch.longitude !== undefined
    ) {
      geoJson = JSON.stringify({
        type: 'Point',
        coordinates: [patch.longitude, patch.latitude],
      });
    }

    const updatePayload: Partial<AssetRecord> = {
      ...patch,
      ...(geoJson !== undefined ? { geoJson } : {}),
      syncState,
      cachedAtMs: Date.now(),
    };

    await this.db.assets.update(id, updatePayload);
  }

  async updateState(
    id: string,
    toState: string,
    transitionData?: Record<string, any>,
    syncState: SyncState = 'pending'
  ): Promise<void> {
    const current = await this.db.assets.get(id);
    if (!current) {
      throw new Error(`Asset ${id} not found`);
    }

    let nextPropertiesJson = current.propertiesJson;
    if (transitionData && Object.keys(transitionData).length > 0) {
      let existingProps: Record<string, any> = {};
      if (current.propertiesJson) {
        try {
          existingProps = JSON.parse(current.propertiesJson);
        } catch {
          existingProps = {};
        }
      }
      nextPropertiesJson = JSON.stringify({
        ...existingProps,
        ...transitionData,
      });
    }

    await this.db.assets.update(id, {
      state: toState,
      propertiesJson: nextPropertiesJson,
      syncState,
      cachedAtMs: Date.now(),
    });
  }

  async moveAsset(
    id: string,
    newParentId: string | undefined,
    syncState: SyncState = 'pending'
  ): Promise<void> {
    await this.db.assets.update(id, {
      parentId: newParentId,
      syncState,
      cachedAtMs: Date.now(),
    });
  }

  // ── BOM (Asset Materials / Spare Parts) ─────────────────────────────────
  async getBomMaterials(
    tenantId: string,
    assetId: string
  ): Promise<AssetMaterialRecord[]> {
    return this.db.asset_bom_materials
      .where('[tenantId+assetId]')
      .equals([tenantId, assetId])
      .toArray();
  }

  async upsertBomMaterial(material: AssetMaterialRecord): Promise<string> {
    await this.db.asset_bom_materials.put(material);
    return material.id;
  }

  async upsertBomMaterials(materials: AssetMaterialRecord[]): Promise<void> {
    await this.db.asset_bom_materials.bulkPut(materials);
  }

  async removeBomMaterial(id: string): Promise<void> {
    await this.db.asset_bom_materials.delete(id);
  }

  async markStale(id: string): Promise<void> {
    await this.db.assets.update(id, { isStale: 1 });
  }
}
