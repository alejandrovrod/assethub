import { apiClient as api } from '@/lib/api-client'

export type WorkTaskState = 'todo' | 'rework' | 'in_progress' | 'done' | 'cancelled'

export interface WorkTaskSummary {
  id: string
  title: string
  description?: string
  state: WorkTaskState
  stateLabel?: string
  dueAt?: string
  assetId?: string
  assetName?: string
  incidentId?: string
  incidentTitle?: string
  maintenanceOrderId?: string
  maintenanceOrderTitle?: string
  maintenanceOrderState?: string
  preventivePlanId?: string
  preventivePlanName?: string
  assignedEmployeeId?: string
  assignedEmployeeName?: string
  assignedTeamId?: string
  assignedTeamName?: string
  taskTypeCatalogItemId: string
  priorityCatalogItemId: string
  priorityLabel?: string
  createdAt: string
}

export interface WorkTaskDetail extends WorkTaskSummary {
  taskTypeLabel?: string
  propertiesJson?: string
}

export interface WorkTaskHistoryEntry {
  id: string
  fromState?: string
  toState: string
  changedAt: string
  changedByName?: string
}

export interface WorkTaskComment {
  id: string
  text: string
  createdAt: string
  createdByName?: string
}

export interface CreateWorkTaskRequest {
  title: string
  description?: string
  dueAt?: string
  taskTypeCatalogItemId: string
  priorityCatalogItemId: string
  assetId?: string
  incidentId?: string
  maintenanceOrderId?: string
  preventivePlanId?: string
  taskRecurrenceId?: string
  assignedEmployeeId?: string
  assignedTeamId?: string
  propertiesJson?: string
}

export interface UpdateWorkTaskRequest {
  title: string
  description?: string
  dueAt?: string
  taskTypeCatalogItemId: string
  priorityCatalogItemId: string
  assignedEmployeeId?: string | null
  assignedTeamId?: string | null
  propertiesJson?: string
}

export interface AssignWorkTaskRequest {
  assignedEmployeeId?: string
  assignedTeamId?: string
}

export interface WorkTaskListResponse {
  items: WorkTaskSummary[]
  totalCount: number
  page: number
  pageSize: number
}

export interface WorkTaskHistoryResponse {
  items: WorkTaskHistoryEntry[]
}

export interface WorkTaskCommentsResponse {
  items: WorkTaskComment[]
}

export interface WorkTaskQueryParams {
  state?: WorkTaskState
  search?: string
  assetId?: string
  incidentId?: string
  maintenanceOrderId?: string
  preventivePlanId?: string
  taskRecurrenceId?: string
  dueBefore?: string
  dueAfter?: string
  page?: number
  pageSize?: number
}

export const STATE_LABELS: Record<WorkTaskState, string> = {
  todo: 'Por hacer',
  rework: 'Rehacer',
  in_progress: 'En progreso',
  done: 'Completada',
  cancelled: 'Cancelada',
}

export const workTaskService = {
  getAll: async (params?: WorkTaskQueryParams): Promise<WorkTaskListResponse> => {
    const searchParams = new URLSearchParams()
    if (params?.state) searchParams.append('state', params.state)
    if (params?.search) searchParams.append('search', params.search)
    if (params?.assetId) searchParams.append('assetId', params.assetId)
    if (params?.incidentId) searchParams.append('incidentId', params.incidentId)
    if (params?.maintenanceOrderId) searchParams.append('maintenanceOrderId', params.maintenanceOrderId)
    if (params?.preventivePlanId) searchParams.append('preventivePlanId', params.preventivePlanId)
    if (params?.taskRecurrenceId) searchParams.append('taskRecurrenceId', params.taskRecurrenceId)
    if (params?.dueBefore) searchParams.append('dueBefore', params.dueBefore)
    if (params?.dueAfter) searchParams.append('dueAfter', params.dueAfter)
    if (params?.page !== undefined) searchParams.append('page', String(params.page))
    if (params?.pageSize !== undefined) searchParams.append('pageSize', String(params.pageSize))

    const { data } = await api.get<WorkTaskListResponse>(`/work-tasks?${searchParams.toString()}`)
    return data
  },

  getById: async (id: string): Promise<WorkTaskDetail> => {
    const { data } = await api.get<WorkTaskDetail>(`/work-tasks/${id}`)
    return data
  },

  create: async (payload: CreateWorkTaskRequest): Promise<{ id: string }> => {
    const { data } = await api.post<{ id: string }>('/work-tasks', payload)
    return data
  },

  update: async (id: string, payload: UpdateWorkTaskRequest): Promise<void> => {
    await api.put(`/work-tasks/${id}`, payload)
  },

  changeState: async (id: string, state: WorkTaskState): Promise<WorkTaskDetail> => {
    const { data } = await api.put<WorkTaskDetail>(`/work-tasks/${id}/state`, { state })
    return data
  },

  assign: async (id: string, payload: AssignWorkTaskRequest): Promise<void> => {
    await api.put(`/work-tasks/${id}/assign`, payload)
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/work-tasks/${id}`)
  },

  getHistory: async (id: string): Promise<WorkTaskHistoryEntry[]> => {
    const { data } = await api.get<WorkTaskHistoryResponse>(`/work-tasks/${id}/history`)
    return data.items
  },

  getComments: async (id: string): Promise<WorkTaskComment[]> => {
    const { data } = await api.get<WorkTaskCommentsResponse>(`/work-tasks/${id}/comments`)
    return data.items
  },

  addComment: async (id: string, text: string): Promise<WorkTaskComment> => {
    const { data } = await api.post<WorkTaskComment>(`/work-tasks/${id}/comments`, { text })
    return data
  },
}
