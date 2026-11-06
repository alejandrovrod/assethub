import type { FieldDatabase } from '../db/database';
import type { IncidentRecord } from '../db/schema';
import type { AssignmentFilter } from './task.repository';
import { matchesActorInProperties, parseProperties } from './assignment';

export class IncidentRepository {
  constructor(private db: FieldDatabase) {}

  async getById(id: string): Promise<IncidentRecord | undefined> {
    return this.db.incidents.get(id);
  }

  async findDrafts(tenantId: string): Promise<IncidentRecord[]> {
    return this.db.incidents
      .where('[tenantId+syncState]')
      .equals([tenantId, 'draft'])
      .toArray();
  }

  async findPending(tenantId: string): Promise<IncidentRecord[]> {
    return this.db.incidents
      .where('[tenantId+syncState]')
      .equals([tenantId, 'pending'])
      .toArray();
  }

  async findByAssetId(assetId: string): Promise<IncidentRecord[]> {
    return this.db.incidents
      .where('assetId')
      .equals(assetId)
      .toArray();
  }

  /**
   * Returns incidents reported by the user OR assigned to their employeeId / teamIds.
   */
  async findForActor(filter: AssignmentFilter): Promise<IncidentRecord[]> {
    const teamSet = new Set((filter.teamIds ?? []).map((id) => id.toLowerCase()));
    const empId = filter.employeeId?.toLowerCase();
    const userId = filter.userId?.toLowerCase();

    const allIncidents = await this.db.incidents
      .where('tenantId')
      .equals(filter.tenantId)
      .toArray();

    return allIncidents
      .filter((inc) => {
        // Sin actor no hay jornada. El backend devuelve el conjunto vacío en el mismo
        // caso; mostrar "todo el tenant" por no saber quién está logueado sería una fuga.
        if (!empId && !userId && teamSet.size === 0) {
          return false;
        }

        // The properties are the source of truth for assignment (see repositories/assignment.ts).
        if (matchesActorInProperties(inc.propertiesJson, [empId, userId])) return true;

        const teamId = inc.assignedTeamId?.toLowerCase();
        if (teamId && teamSet.has(teamId)) return true;

        if (userId && inc.reportedByUserId?.toLowerCase() === userId) return true;

        // Legacy rows only: once a row carries dynamic properties, the properties decide
        // who executes it and the column must not resurrect an old owner.
        if (parseProperties(inc.propertiesJson) !== undefined) return false;

        const incEmp = inc.assignedEmployeeId?.toLowerCase();
        if (empId && incEmp === empId) return true;

        return false;
      })
      .sort((a, b) => b.createdAtLocalMs - a.createdAtLocalMs);
  }

  async saveDraft(incident: IncidentRecord): Promise<string> {
    const draft: IncidentRecord = {
      ...incident,
      syncState: 'draft',
      cachedAtMs: Date.now(),
    };
    await this.db.incidents.put(draft);
    return draft.id;
  }

  async upsert(incident: IncidentRecord): Promise<string> {
    await this.db.incidents.put(incident);
    return incident.id;
  }

  async upsertMany(incidents: IncidentRecord[]): Promise<void> {
    await this.db.incidents.bulkPut(incidents);
  }
}
