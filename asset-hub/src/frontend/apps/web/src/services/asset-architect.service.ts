import { apiClient } from '../lib/api-client'

export interface FieldSummary {
  keyName: string
  title: string
  type: string
  required: boolean
  enumOptions: string[]
  catalogCode?: string | null
}

export interface ChildStateDependencySummary {
  conditionType: string
  childStates: string[]
  targetState: string
}

export interface StateSummary {
  name: string
  color?: string | null
  isTerminal: boolean
  maxHoursInState?: number | null
  transitions: string[]
  onEnterAction?: string | null
  notificationTargetFieldId?: string | null
  associatedModule?: string | null
  requiresFields?: string[] | null
  allowedRoles?: string[] | null
  childStateDependencies?: ChildStateDependencySummary[] | null
}

export interface TemplateDraftResult {
  code: string
  name: string
  description: string
  childTemplateCodes: string[]
  schemaJson: string
  initialState: string
  lifecycleStates: StateSummary[]
  maintenanceChecklistJson: string
  fields: FieldSummary[]
}

export interface AssetArchitectDraftResponse {
  templates: TemplateDraftResult[]
}

export const assetArchitectService = {
  async generateDraft(description: string): Promise<AssetArchitectDraftResponse> {
    const response = await apiClient.post<AssetArchitectDraftResponse>('/asset-architect/draft', {
      description,
    })
    return response.data
  },
}
