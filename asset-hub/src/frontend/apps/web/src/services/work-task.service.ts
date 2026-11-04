import { apiClient as api } from '@/lib/api-client'

export type WorkTaskState = 'todo' | 'rework' | 'in_progress' | 'paused' | 'done' | 'cancelled'

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
  workflowTemplateId?: string
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
  /**
   * Token de versión (base64url, sin comillas). Se envía en `If-Match` entre comillas
   * al mutar el recurso; el backend responde 412 si la versión ya no es la actual.
   */
  etag?: string
}

export interface WorkTaskDetail extends WorkTaskSummary {
  taskTypeLabel?: string
  propertiesJson?: string
  startedAt?: string
  /** Sólo presente mientras la tarea está pausada. */
  pausedAt?: string
  resumedAt?: string
  completedAt?: string
  /** Segundos acumulados en pausa, sumando todas las pausas. */
  totalPausedSeconds?: number
  /** Duración neta: bruto menos pausas. Nula si la tarea no está completada. */
  durationSeconds?: number | null
  reworkReason?: string
  reworkedAt?: string
  /**
   * Estados alcanzables desde el actual, según el servidor. Es la fuente de verdad de la
   * máquina de estados: el SPA no debe decidir por su cuenta qué botones mostrar.
   */
  allowedTransitions?: WorkTaskState[]
}

export interface WorkTaskEvidence {
  id: string
  type: string
  blobUri?: string
  note?: string
  latitude?: number
  longitude?: number
  capturedByUserId: string
  capturedAt: string
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
  paused: 'Pausada',
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

  changeState: async (id: string, state: WorkTaskState, etag?: string): Promise<WorkTaskDetail> => {
    // Fail-closed: si no hay versión, no se manda el header y el backend responde 428.
    // Mandar `*` convertiría la escritura en un last-write-wins silencioso, que es
    // exactamente lo que If-Match existe para evitar.
    const { data } = await api.put<WorkTaskDetail>(
      `/work-tasks/${id}/state`,
      { state },
      etag ? { headers: { 'If-Match': `"${etag}"` } } : undefined,
    )
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

  getEvidences: async (id: string): Promise<WorkTaskEvidence[]> => {
    const { data } = await api.get<any>(`/work-tasks/${id}/evidences`)
    return Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
  },

  deleteEvidence: async (taskId: string, evidenceId: string): Promise<void> => {
    await api.delete(`/work-tasks/${taskId}/evidences/${evidenceId}`)
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
