import { apiClient } from '../lib/api-client'
import { AssetTemplate } from './asset-template.service'

export interface Asset {
  id: string
  assetTemplateId: string
  parentId?: string
  code: string
  name: string
  installedAt?: string
  commissionedAt?: string
  conditionIndex?: number
  propertiesJson: string
  geoJson?: string
  createdAt: string
  updatedAt: string
  
  // Includes
  assetTemplate?: AssetTemplate
}

export interface CreateAssetRequest {
  assetTemplateId: string
  parentId?: string
  code: string
  name: string
  installedAt?: string
  commissionedAt?: string
  conditionIndex?: number
  propertiesJson: string
  geoJson?: string
}

export interface UpdateAssetRequest {
  name: string
  installedAt?: string
  commissionedAt?: string
  conditionIndex?: number
  propertiesJson: string
  geoJson?: string
}

export const assetService = {
  getAssets: async (q?: string, templateId?: string, state?: string) => {
    const { data } = await apiClient.get<{ items: Asset[] }>('/assets', {
      params: { q, templateId, state }
    })
    return data.items
  },
  
  createAsset: async (request: CreateAssetRequest) => {
    const { data } = await apiClient.post<{ id: string }>('/assets', request)
    return data
  },
  
  updateAsset: async (id: string, request: UpdateAssetRequest) => {
    const { data } = await apiClient.put<{ id: string }>(`/assets/${id}`, request)
    return data
  }
}
