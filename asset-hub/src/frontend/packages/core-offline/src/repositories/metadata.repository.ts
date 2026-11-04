import type { FieldDatabase } from '../db/database';
import type {
  WorkflowTemplateRecord,
  CatalogItemRecord,
  DirectoryEntryRecord,
} from '../db/schema';

export class WorkflowTemplateRepository {
  constructor(private db: FieldDatabase) {}

  async getById(id: string): Promise<WorkflowTemplateRecord | undefined> {
    return this.db.workflow_templates.get(id);
  }

  async getByIds(ids: string[]): Promise<WorkflowTemplateRecord[]> {
    const results = await this.db.workflow_templates.bulkGet(ids);
    return results.filter((r): r is WorkflowTemplateRecord => Boolean(r));
  }

  async findByEntityType(
    tenantId: string,
    entityType: string
  ): Promise<WorkflowTemplateRecord[]> {
    return this.db.workflow_templates
      .where('[tenantId+entityType]')
      .equals([tenantId, entityType])
      .toArray();
  }

  async upsertMany(templates: WorkflowTemplateRecord[]): Promise<void> {
    await this.db.workflow_templates.bulkPut(templates);
  }
}

export class CatalogRepository {
  constructor(private db: FieldDatabase) {}

  async getItemsByCatalogCode(
    tenantId: string,
    catalogCode: string
  ): Promise<CatalogItemRecord[]> {
    const items = await this.db.catalog_items
      .where('[tenantId+catalogCode]')
      .equals([tenantId, catalogCode])
      .toArray();
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async upsertMany(items: CatalogItemRecord[]): Promise<void> {
    await this.db.catalog_items.bulkPut(items);
  }
}

export class DirectoryRepository {
  constructor(private db: FieldDatabase) {}

  async findByKind(
    tenantId: string,
    kind: 'employee' | 'team'
  ): Promise<DirectoryEntryRecord[]> {
    const items = await this.db.directory_entries
      .where('[tenantId+kind]')
      .equals([tenantId, kind])
      .toArray();
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsertMany(entries: DirectoryEntryRecord[]): Promise<void> {
    await this.db.directory_entries.bulkPut(entries);
  }
}
