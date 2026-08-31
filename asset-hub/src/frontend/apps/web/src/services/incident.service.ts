import { apiClient as api } from '@/lib/api-client'

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

export interface PagedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface IncidentDetail {
  id: string
  title: string
  description?: string
  assetId: string
  assetName: string
  typeId: string
  priorityId?: string
  workflowTemplateId?: string
  propertiesJson: string
  state: string
  createdAt: string
  resolvedAt?: string
  closedAt?: string
  attachments: IncidentAttachment[]
  maintenanceOrder?: {
    id: string
    title: string
    state: string
    assignedEmployeeId?: string
    assignedEmployeeName?: string
    scheduledStart?: string
    scheduledEnd?: string
  }
  workTasks?: {
    id: string
    title: string
    state: string
    assignedEmployeeId?: string
    assignedEmployeeName?: string
    dueAt?: string
  }[]
}

export interface ReportIncidentDto {
  title: string
  description?: string
  assetId: string
  typeId: string
  priorityId?: string
  workflowTemplateId?: string
  propertiesJson?: string
  geoJson?: string
  targetAssetState?: string
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

export interface IncidentTimelineEvent {
  id: string
  eventType: string
  fromState: string
  toState: string
  notes?: string
  propertiesJson?: string
  at: string
  userId: string
}

export interface AdvancedSearchIncidentsDto {
  searchTerm?: string
  state?: string
  catalogFilters?: Record<string, string>
  assetId?: string
  page?: number
  pageSize?: number
}

export const incidentService = {
  search: async (q?: string, state?: string, assetId?: string, page: number = 1, pageSize: number = 50) => {
    const params = new URLSearchParams()
    if (q) params.append('q', q)
    if (state) params.append('state', state)
    if (assetId) params.append('assetId', assetId)
    params.append('page', page.toString())
    params.append('pageSize', pageSize.toString())
    
    const { data } = await api.get<PagedResult<IncidentSummary>>(`/incidents?${params.toString()}`)
    return data
  },

  advancedSearch: async (payload: AdvancedSearchIncidentsDto) => {
    const { data } = await api.post<PagedResult<IncidentSummary>>('/incidents/search', payload)
    return data
  },

  getById: async (id: string) => {
    const { data } = await api.get<IncidentDetail>(`/incidents/${id}`)
    return data
  },

  report: async (payload: ReportIncidentDto) => {
    const { data } = await api.post<{ id: string }>('/incidents', payload)
    return data.id
  },

  changeState: async (id: string, payload: ChangeIncidentStateDto) => {
    await api.patch(`/incidents/${id}/state`, payload)
  },

  getTimeline: async (id: string) => {
    const { data } = await api.get<{ items: IncidentTimelineEvent[] }>(`/incidents/${id}/timeline`)
    return data.items
  }
}
