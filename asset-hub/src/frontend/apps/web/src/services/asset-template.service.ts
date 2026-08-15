import { apiClient } from '../lib/api-client'

export interface AssetTemplate {
  id: string
  tenantId?: string
  businessEntityTypeId: string
  code: string
  name: string
  description: string
  schemaJson: string
  allowedChildTemplateIds: string[]
  lifecycleStates: LifecycleConfig
  maintenanceChecklist: string
  version: number
  isActive: boolean
}

export interface LifecycleConfig {
  initialState: string
  transitions: Record<string, string[]>
  states: Record<string, StateConfig>
  nodes?: any
  edges?: any
}

export interface ChildStateDependency {
  conditionType: 'Any' | 'All'
  childStates: string[]
  targetState: string
}

export interface StateConfig {
  color?: string
  icon?: string
  allowedRoles?: string[]
  requiresFields?: string[]
  onEnterAction?: string
  associatedModule?: string
  maxHoursInState?: number
  isTerminal?: boolean
  childStateDependencies?: ChildStateDependency[]
}
export interface CreateAssetTemplateRequest {
  businessEntityTypeId: string
  code: string
  name: string
  description: string
  schemaJson: string
  allowedChildTemplateIds: string[]
  lifecycleStates: LifecycleConfig
  maintenanceChecklist: string
}

export interface UpdateAssetTemplateRequest {
  name: string
  description: string
  schemaJson: string
  allowedChildTemplateIds: string[]
  lifecycleStates: LifecycleConfig
  maintenanceChecklist: string
}

export interface CloneAssetTemplateRequest {
  sourceTemplateId: string
  newCode: string
  newName: string
}

export const assetTemplateService = {
  getTemplates: async (search?: string): Promise<AssetTemplate[]> => {
    const params = new URLSearchParams()
    if (search) params.append('SearchTerm', search)
    const { data } = await apiClient.get<{ items: AssetTemplate[] }>(`/asset-templates?${params.toString()}`)
    return data.items
  },

  createTemplate: async (request: CreateAssetTemplateRequest): Promise<{ id: string }> => {
    const { data } = await apiClient.post<{ id: string }>('/asset-templates', request)
    return data
  },

  updateTemplate: async (id: string, request: UpdateAssetTemplateRequest): Promise<{ id: string }> => {
    const { data } = await apiClient.put<{ id: string }>(`/asset-templates/${id}`, request)
    return data
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await apiClient.delete(`/asset-templates/${id}`)
  },

  cloneTemplate: async (request: CloneAssetTemplateRequest): Promise<{ id: string }> => {
    const { data } = await apiClient.post<{ id: string }>('/asset-templates/clone', request)
    return data
  }
}
