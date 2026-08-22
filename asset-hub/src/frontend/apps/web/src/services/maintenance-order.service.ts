import { apiClient as api } from '@/lib/api-client'

export type MaintenanceOrderState = 'draft' | 'approved' | 'scheduled' | 'in_progress' | 'done' | 'verified' | 'cancelled' | 'rescheduled'
export type MaintenanceOrderKind = string

export interface MaintenanceOrderSummary {
  id: string
  kind: MaintenanceOrderKind
  state: MaintenanceOrderState
  title: string
  scheduledStart?: string
  scheduledEnd?: string
  completedAt?: string
  laborCost: number
  partsCount: number
  assetId: string
  assetName?: string
  preventivePlanId?: string
  preventivePlanName?: string
  incidentId?: string
  incidentTitle?: string
  assignedEmployeeId?: string
  assignedEmployeeName?: string
}

export interface MaintenanceOrderPart {
  id: string
  catalogItemId: string
  catalogItemLabel?: string
  quantity: number
  unitCost: number
  totalCost: number
}

export interface MaintenanceOrderTask {
  id: string
  title: string
  state: string
  assignedEmployeeId?: string
  assignedEmployeeName?: string
}

export interface MaintenanceOrderDetail extends MaintenanceOrderSummary {
  description?: string
  parts: MaintenanceOrderPart[]
  tasks: MaintenanceOrderTask[]
  propertiesJson?: string
}

export interface CreateMaintenanceOrderDto {
  kind: MaintenanceOrderKind
  title: string
  description?: string
  assetId: string
  preventivePlanId?: string
  incidentId?: string
  propertiesJson?: string
}

export interface UpdateMaintenanceOrderDto {
  title?: string
  description?: string
  assignedEmployeeId?: string
  scheduledStart?: string
  scheduledEnd?: string
  removePreventivePlan?: boolean
  propertiesJson?: string
}

export interface AddPartDto {
  catalogItemId: string
  quantity: number
  unitCost: number
}

export interface MaintenanceOrdersQueryParams {
  state?: MaintenanceOrderState
  kind?: MaintenanceOrderKind
  assetId?: string
  preventivePlanId?: string
  incidentId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface MaintenanceOrdersResult {
  items: MaintenanceOrderSummary[]
  totalCount: number
  page: number
  pageSize: number
}

const STATE_LABELS: Record<MaintenanceOrderState, string> = {
  draft: 'Borrador',
  approved: 'Aprobada',
  scheduled: 'Programada',
  in_progress: 'En progreso',
  done: 'Completada',
  rescheduled: 'Reprogramada',
  verified: 'Verificada',
  cancelled: 'Cancelada',
}

const KIND_LABELS: Record<string, string> = {
  corrective: 'Correctiva',
  preventive: 'Preventiva',
}

const ALLOWED_TRANSITIONS: Record<MaintenanceOrderState, MaintenanceOrderState[]> = {
  draft: ['approved', 'scheduled'],
  approved: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: ['verified', 'rescheduled'],
  rescheduled: ['scheduled', 'in_progress', 'cancelled'],
  verified: [],
  cancelled: [],
}

export const maintenanceOrderService = {
  getAll: async (params?: MaintenanceOrdersQueryParams): Promise<MaintenanceOrdersResult> => {
    const searchParams = new URLSearchParams()
    if (params?.state) searchParams.append('state', params.state)
    if (params?.kind) searchParams.append('kind', params.kind)
    if (params?.assetId) searchParams.append('assetId', params.assetId)
    if (params?.preventivePlanId) searchParams.append('preventivePlanId', params.preventivePlanId)
    if (params?.incidentId) searchParams.append('incidentId', params.incidentId)
    if (params?.search) searchParams.append('search', params.search)
    if (params?.page) searchParams.append('page', String(params.page))
    if (params?.pageSize) searchParams.append('pageSize', String(params.pageSize))

    const { data } = await api.get<MaintenanceOrdersResult>(`/maintenance-orders?${searchParams.toString()}`)
    return data
  },

  getById: async (id: string): Promise<MaintenanceOrderDetail> => {
    const { data } = await api.get<MaintenanceOrderDetail>(`/maintenance-orders/${id}`)
    return data
  },

  create: async (payload: CreateMaintenanceOrderDto): Promise<{ id: string }> => {
    const { data } = await api.post<{ id: string }>('/maintenance-orders', payload)
    return data
  },

  update: async (id: string, payload: UpdateMaintenanceOrderDto): Promise<MaintenanceOrderSummary> => {
    const { data } = await api.put<MaintenanceOrderSummary>(`/maintenance-orders/${id}`, payload)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/maintenance-orders/${id}`)
  },

  approve: async (id: string): Promise<void> => {
    await api.patch(`/maintenance-orders/${id}/approve`)
  },

  schedule: async (id: string, payload: { assignedEmployeeId?: string; scheduledStart?: string; scheduledEnd?: string }): Promise<void> => {
    const body: Record<string, unknown> = {}
    if (payload.assignedEmployeeId) body.assignedEmployeeId = payload.assignedEmployeeId
    if (payload.scheduledStart) body.scheduledStart = payload.scheduledStart
    if (payload.scheduledEnd) body.scheduledEnd = payload.scheduledEnd
    await api.patch(`/maintenance-orders/${id}/schedule`, body)
  },

  verify: async (id: string): Promise<void> => {
    await api.patch(`/maintenance-orders/${id}/verify`)
  },

  reject: async (id: string, approvedTaskIds: string[]): Promise<void> => {
    await api.patch(`/maintenance-orders/${id}/reject`, approvedTaskIds)
  },

  start: async (id: string): Promise<void> => {
    await api.patch(`/maintenance-orders/${id}/start`)
  },

  complete: async (id: string): Promise<void> => {
    await api.patch(`/maintenance-orders/${id}/complete`)
  },

  cancel: async (id: string): Promise<void> => {
    await api.patch(`/maintenance-orders/${id}/cancel`)
  },

  recordCosts: async (id: string, payload: { laborCost: number; parts: Array<{ catalogItemId: string; quantity: number; unitCost: number }> }): Promise<void> => {
    await api.put(`/maintenance-orders/${id}/costs`, payload)
  },

  getTasks: async (id: string): Promise<MaintenanceOrderTask[]> => {
    const { data } = await api.get<MaintenanceOrderTask[]>(`/maintenance-orders/${id}/tasks`)
    return data
  },

  addPart: async (id: string, payload: AddPartDto): Promise<{ id: string }> => {
    const { data } = await api.post<{ id: string }>(`/maintenance-orders/${id}/parts`, payload)
    return data
  },

  getParts: async (id: string): Promise<MaintenanceOrderPart[]> => {
    const { data } = await api.get<MaintenanceOrderPart[]>(`/maintenance-orders/${id}/parts`)
    return data
  },

  removePart: async (id: string, partId: string): Promise<void> => {
    await api.delete(`/maintenance-orders/${id}/parts/${partId}`)
  },
}

export { STATE_LABELS, KIND_LABELS, ALLOWED_TRANSITIONS }
