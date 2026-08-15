import { apiClient as api } from '@/lib/api-client'
import { LifecycleConfig } from './asset-template.service'

export interface IncidentTemplate {
  id: string
  code: string
  name: string
  description: string
  schemaJson: string
  lifecycleStates: LifecycleConfig
  isActive: boolean
}

export interface IncidentTemplateSummary {
  id: string
  code: string
  name: string
  description: string
  isActive: boolean
}

export interface CreateIncidentTemplateDto {
  code: string
  name: string
  description: string
  schemaJson: string
  lifecycleStates: LifecycleConfig
}

export interface UpdateIncidentTemplateDto {
  id: string
  code: string
  name: string
  description: string
  schemaJson: string
  lifecycleStates: LifecycleConfig
}

export const incidentTemplateService = {
  search: async (q?: string, includeInactive?: boolean) => {
    const params = new URLSearchParams()
    if (q) params.append('q', q)
    if (includeInactive) params.append('includeInactive', 'true')
    
    const { data } = await api.get<{ items: IncidentTemplateSummary[] }>(`/incident-templates?${params.toString()}`)
    return data.items
  },

  getById: async (id: string) => {
    const { data } = await api.get<IncidentTemplate>(`/incident-templates/${id}`)
    return data
  },

  create: async (payload: CreateIncidentTemplateDto) => {
    const { data } = await api.post<{ id: string }>('/incident-templates', payload)
    return data.id
  },

  update: async (id: string, payload: UpdateIncidentTemplateDto) => {
    await api.put(`/incident-templates/${id}`, payload)
  },

  delete: async (id: string) => {
    await api.delete(`/incident-templates/${id}`)
  }
}
