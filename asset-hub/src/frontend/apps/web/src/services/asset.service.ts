import { apiClient } from '../lib/api-client'
import { AssetTemplate } from './asset-template.service'

export interface Asset {
  id: string
  assetTemplateId: string
  parentId?: string
  code: string
  name: string
  state: string
  stateColor?: string
  path?: string
  pathNames?: string
  installedAt?: string
  commissionedAt?: string
  conditionIndex?: number
  propertiesJson: string
  geoJson?: string
  createdAt: string
  updatedAt: string
  
  // Includes
  assetTemplate?: AssetTemplate
  children?: AssetSummaryDto[]
  lifecycleStates?: any // Or import LifecycleConfig and use it
}

export interface AssetSummaryDto {
  id: string
  code: string
  name: string
  state: string
  stateColor?: string
}

export interface AdvancedSearchRequest {
  searchTerm?: string
  templateId?: string
  state?: string
  ancestorId?: string
  catalogFilters?: Record<string, string>
  rootOnly?: boolean
}

export interface CatalogItemFilterDto {
  catalogItemId: string
  code: string
  label: string
}

export interface SearchFilterDto {
  attributeKey: string
  attributeLabel: string
  options: CatalogItemFilterDto[]
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
  code: string
  name: string
  installedAt?: string
  commissionedAt?: string
  conditionIndex?: number
  propertiesJson: string
  geoJson?: string
}

export interface AssetDetail {
  id: string
  templateId: string
  templateName: string
  schemaJson: string
  lifecycleStates: any
  parentId?: string
  path: string
  code: string
  name: string
  state: string
  stateColor?: string
  conditionIndex?: number
  propertiesJson: string
  commissionedAt?: string
  installedAt?: string
}

export interface AssetAttachment {
  id: string
  fileName: string
  blobUri: string
  contentType: string
  sizeBytes: number
  kind: string
  createdAt: string
}

export interface AssetEvent {
  id: string
  assetId: string
  eventType: string
  fromState: string
  toState: string
  notes?: string
  at: string
  userId: string
}

export const assetService = {
  getAssets: async (q?: string, templateId?: string, state?: string, ancestorId?: string) => {
    const { data } = await apiClient.get<{ items: Asset[] }>('/assets', {
      params: { q, templateId, state, ancestorId }
    })
    return data.items
  },
  
  advancedSearch: async (request: AdvancedSearchRequest) => {
    const { data } = await apiClient.post<{ items: Asset[] }>('/assets/search', request)
    return data.items
  },

  getSearchFilters: async () => {
    const { data } = await apiClient.get<SearchFilterDto[]>('/assets/search-filters')
    return data
  },
  
  createAsset: async (request: CreateAssetRequest) => {
    const { data } = await apiClient.post<{ id: string }>('/assets', request)
    return data
  },
  
  updateAsset: async (id: string, request: UpdateAssetRequest) => {
    const { data } = await apiClient.put<{ id: string }>(`/assets/${id}`, request)
    return data
  },

  getAssetById: async (id: string) => {
    const { data } = await apiClient.get<AssetDetail>(`/assets/${id}`)
    return data
  },

  deleteAsset: async (id: string) => {
    await apiClient.delete(`/assets/${id}`)
  },

  changeState: async (id: string, toState: string, transitionData?: Record<string, string>): Promise<void> => {
    await apiClient.patch(`/assets/${id}/state`, { toState, transitionData })
  },

  getAssetEvents: async (id: string): Promise<AssetEvent[]> => {
    const { data } = await apiClient.get<AssetEvent[]>(`/assets/${id}/events`)
    return data
  },

  getAssetAttachments: async (id: string) => {
    const { data } = await apiClient.get<{ items: AssetAttachment[] }>(`/assets/${id}/attachments`)
    return data.items
  },

  uploadAttachment: async (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await apiClient.post<{ id: string }>(`/assets/${id}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return data
  },

  moveAsset: async (id: string, newParentId: string | null) => {
    const { data } = await apiClient.patch(`/assets/${id}/move`, { newParentId })
    return data
  }
}
