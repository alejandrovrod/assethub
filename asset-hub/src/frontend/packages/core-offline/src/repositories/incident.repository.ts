import type { FieldDatabase } from '../db/database';
import type { IncidentRecord } from '../db/schema';
import type { AssignmentFilter } from './task.repository';
import { matchesActorInProperties } from './assignment';

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
        // Fallback: If no actor filter is provided (e.g. admin or unlinked user), show all tenant incidents
        if (!empId && !userId && teamSet.size === 0) {
          return true;
        }

        // Si la incidencia no tiene asignado explícito, es visible para los técnicos del tenant
        if (!inc.assignedEmployeeId && !inc.assignedTeamId && !inc.reportedByUserId) {
          return true;
        }

        // En campo, los técnicos ven los incidentes del tenant para atenderlos o los que ellos reportaron
        if (userId && inc.reportedByUserId?.toLowerCase() === userId) return true;
        if (empId && inc.assignedEmployeeId?.toLowerCase() === empId) return true;
        if (inc.assignedTeamId && teamSet.has(inc.assignedTeamId.toLowerCase())) return true;
        // The properties are the source of truth for assignment (see repositories/assignment.ts).
        if (matchesActorInProperties(inc.propertiesJson, [empId, userId])) return true;
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
