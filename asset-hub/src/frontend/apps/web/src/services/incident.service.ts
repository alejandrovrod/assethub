import { api } from '@/lib/api'

export interface IncidentAttachment {
  id: string
  fileUrl: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface IncidentSummary {
  id: string
  title: string
  state: string
  assetId: string
  assetName: string
  createdAt: string
  resolvedAt?: string
  closedAt?: string
}

export interface IncidentDetail {
  id: string
  title: string
  description?: string
  assetId: string
  assetName: string
  typeId: string
  priorityId?: string
  incidentTemplateId?: string
  propertiesJson: string
  state: string
  createdAt: string
  resolvedAt?: string
  closedAt?: string
  attachments: IncidentAttachment[]
}

export interface ReportIncidentDto {
  title: string
  description?: string
  assetId: string
  typeId: string
  priorityId?: string
  incidentTemplateId?: string
  propertiesJson?: string
  geoJson?: string
  attachments: {
    fileUrl: string
    fileName: string
    contentType: string
    sizeBytes: number
  }[]
}

export interface ChangeIncidentStateDto {
  targetState: string
  propertiesJson?: string
}

export interface AdvancedSearchIncidentsDto {
  searchTerm?: string
  state?: string
  catalogFilters?: Record<string, string>
}

export const incidentService = {
  search: async (q?: string, state?: string) => {
    const params = new URLSearchParams()
    if (q) params.append('q', q)
    if (state) params.append('state', state)
    
    const { data } = await api.get<{ items: IncidentSummary[] }>(`/v1/incidents?${params.toString()}`)
    return data.items
  },

  advancedSearch: async (payload: AdvancedSearchIncidentsDto) => {
    const { data } = await api.post<{ items: IncidentSummary[] }>('/v1/incidents/search', payload)
    return data.items
  },

  getById: async (id: string) => {
    const { data } = await api.get<IncidentDetail>(`/v1/incidents/${id}`)
    return data
  },

  report: async (payload: ReportIncidentDto) => {
    const { data } = await api.post<{ id: string }>('/v1/incidents', payload)
    return data.id
  },

  changeState: async (id: string, payload: ChangeIncidentStateDto) => {
    await api.patch(`/v1/incidents/${id}/state`, payload)
  }
}
