import type { FieldDatabase } from '../db/database';
import type { SyncMetaRecord } from '../db/schema';

export class SyncMetaRepository {
  constructor(private db: FieldDatabase) {}

  async getCursor(resource: string): Promise<string | undefined> {
    const record = await this.db.sync_meta.get(`cursor:${resource}`);
    return record?.value;
  }

  async setCursor(resource: string, cursor: string): Promise<void> {
    const meta: SyncMetaRecord = {
      key: `cursor:${resource}`,
      value: cursor,
      updatedAtMs: Date.now(),
    };
    await this.db.sync_meta.put(meta);
  }

  async get(key: string): Promise<string | undefined> {
    const record = await this.db.sync_meta.get(key);
    return record?.value;
  }

  async set(key: string, value: string): Promise<void> {
    const meta: SyncMetaRecord = {
      key,
      value,
      updatedAtMs: Date.now(),
    };
    await this.db.sync_meta.put(meta);
  }

  async delete(key: string): Promise<void> {
    await this.db.sync_meta.delete(key);
  }
}

