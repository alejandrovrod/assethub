import { apiClient } from '../lib/api-client'

export interface Catalog {
  id: string
  tenantId?: string
  code: string
  label: string
  isSystem: boolean
  targetModules?: string[]
}

export interface CatalogItem {
  id: string
  catalogId: string
  tenantId?: string
  code: string
  label: string
  parentItemId?: string
  order: number
  metadataJson?: string
  isDeleted: boolean
  translations?: CatalogItemTranslation[]
}

export interface CatalogItemTranslation {
  id: string
  catalogItemId: string
  locale: string
  label: string
}

export interface CreateCatalogRequest {
  code: string
  label: string
  targetModules?: string[]
}

export interface UpdateCatalogRequest {
  label: string
  targetModules?: string[]
}

export interface CreateCatalogItemRequest {
  code: string
  defaultLabel: string
  order: number
  translations: Record<string, string>
}

export interface UpdateCatalogItemRequest {
  newCode?: string
  defaultLabel: string
  order: number
  translations: Record<string, string>
}

export const catalogService = {
  getCatalogs: async (): Promise<Catalog[]> => {
    const { data } = await apiClient.get<{ items: Catalog[] }>('/catalogs')
    return data.items
  },

  createCatalog: async (request: CreateCatalogRequest): Promise<{ id: string }> => {
    const { data } = await apiClient.post<{ id: string }>('/catalogs', request)
    return data
  },

  updateCatalog: async (id: string, request: UpdateCatalogRequest): Promise<void> => {
    await apiClient.put(`/catalogs/${id}`, request)
  },

  getCatalogItems: async (catalogCode: string, locale: string = 'es'): Promise<CatalogItem[]> => {
    const { data } = await apiClient.get<{ items: CatalogItem[] }>(`/catalogs/${catalogCode}/items`, {
      params: { locale }
    })
    return data.items
  },

  createCatalogItem: async (catalogCode: string, request: CreateCatalogItemRequest): Promise<{ id: string }> => {
    const { data } = await apiClient.post<{ id: string }>(`/catalogs/${catalogCode}/items`, request)
    return data
  },

  updateCatalogItem: async (catalogCode: string, itemCode: string, request: UpdateCatalogItemRequest): Promise<void> => {
    await apiClient.put(`/catalogs/${catalogCode}/items/${itemCode}`, request)
  },

  deleteCatalogItem: async (catalogCode: string, itemCode: string): Promise<void> => {
    await apiClient.delete(`/catalogs/${catalogCode}/items/${itemCode}`)
  }
}
