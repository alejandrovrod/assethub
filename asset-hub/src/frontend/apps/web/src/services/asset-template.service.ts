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
  lifecycleStates: any // We can refine this later if needed
  maintenanceChecklist: string
  version: number
  isActive: boolean
}

export interface CreateAssetTemplateRequest {
  businessEntityTypeId: string
  code: string
  name: string
  description: string
  schemaJson: string
  allowedChildTemplateIds: string[]
  lifecycleStates: any
  maintenanceChecklist: string
}

export interface UpdateAssetTemplateRequest {
  name: string
  description: string
  schemaJson: string
  allowedChildTemplateIds: string[]
  lifecycleStates: any
  maintenanceChecklist: string
}

export const assetTemplateService = {
  getTemplates: async (): Promise<AssetTemplate[]> => {
    const { data } = await apiClient.get<{ items: AssetTemplate[] }>('/asset-templates')
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
  }
}
