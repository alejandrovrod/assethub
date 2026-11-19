import { apiClient as api } from '@/lib/api-client'

export interface TriagePriorityOption {
  id: string
  code: string
  label: string
}

export interface TriageTechnicianOption {
  id: string
  fullName: string
  roleLabel: string
  skills: string[]
  teams: string[]
  isAvailableToday: boolean
  activeOrdersCount: number
  activeTasksCount: number
}

export interface TriageReachableStateOption {
  name: string
  triggersWorkOrder: boolean
}

export interface TriageCandidatePartOption {
  catalogItemId: string
  code: string
  label: string
  isBomPart: boolean
  isCritical: boolean
  availableStock: number
  primaryWarehouseId?: string | null
  warehouseName?: string | null
  averageUnitCost: number
}

export interface SuggestedPartResult {
  catalogItemId: string
  code: string
  label: string
  quantity: number
  reason: string
  availableStock: number
  primaryWarehouseId?: string | null
  warehouseName?: string | null
  estimatedUnitCost: number
}

export interface IncidentTriageProposalResponse {
  incidentId: string
  currentState: string
  imagesAnalyzedCount: number
  summary: string
  recommendedSeverity: 'Low' | 'Medium' | 'High' | 'Critical' | string
  severityRationale: string
  confidenceScore: number
  visualFindings?: string | null
  suggestedPriorityId?: string | null
  suggestedTechnicianId?: string | null
  technicianRationale?: string | null
  suggestedTargetState?: string | null
  recommendWorkOrder: boolean
  probableRootCauses: string[]
  diagnosticSteps: string[]
  safetyPrecautions: string[]
  suggestedParts: SuggestedPartResult[]
  validationWarnings: string[]
  availablePriorities: TriagePriorityOption[]
  availableTechnicians: TriageTechnicianOption[]
  reachableStates: TriageReachableStateOption[]
  availableParts: TriageCandidatePartOption[]
  recentAssetIncidentsCount: number
  hasExistingCorrectiveOrder: boolean
}

export interface ApplyTriagePartInput {
  catalogItemId: string
  quantity: number
  warehouseId?: string | null
}

export interface ApplyIncidentTriagePayload {
  priorityId?: string | null
  assignedEmployeeId?: string | null
  targetState?: string | null
  diagnosisSummary?: string | null
  createOrUpdateWorkOrder: boolean
  suggestedParts: ApplyTriagePartInput[]
}

export interface ApplyIncidentTriageResult {
  incidentId: string
  state: string
  priorityId?: string | null
  assignedEmployeeId?: string | null
  maintenanceOrderId?: string | null
  addedPartsCount: number
  eTag?: string | null
  etag?: string | null
}

function formatIfMatch(etag?: string): string {
  if (!etag) return '*'
  return etag.startsWith('"') ? etag : `"${etag}"`
}

export const incidentTriageService = {
  analyze: async (incidentId: string, additionalNotes?: string): Promise<IncidentTriageProposalResponse> => {
    const { data } = await api.post<IncidentTriageProposalResponse>(
      `/incidents/${incidentId}/ai-triage/analyze`,
      additionalNotes ? { additionalNotes } : {}
    )
    return data
  },

  apply: async (
    incidentId: string,
    payload: ApplyIncidentTriagePayload,
    etag?: string
  ): Promise<ApplyIncidentTriageResult> => {
    const res = await api.post<ApplyIncidentTriageResult>(
      `/incidents/${incidentId}/ai-triage/apply`,
      payload,
      {
        headers: { 'If-Match': formatIfMatch(etag) },
      }
    )
    const rawHeader = res.headers ? (res.headers['etag'] || res.headers['ETag']) : undefined
    const cleanedHeader = typeof rawHeader === 'string' ? rawHeader.replace(/^["']|["']$/g, '') : undefined
    const resolvedEtag = res.data.etag || res.data.eTag || cleanedHeader
    return { ...res.data, etag: resolvedEtag }
  },
}
