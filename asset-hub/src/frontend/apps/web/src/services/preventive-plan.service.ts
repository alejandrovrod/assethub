import { apiClient as api } from '@/lib/api-client'

export interface PreventivePlanSummary {
  id: string
  name: string
  description?: string
  targetType: 'Asset' | 'AssetTemplate'
  assetTemplateId?: string
  assetTemplateName?: string
  assetId?: string
  assetName?: string
  workflowTemplateId?: string
  generatedEntityType: string
  cronExpression: string
  dueDateOffsetDays: number
  conditionRuleJson?: string
  autoAssign: boolean
  defaultAssignedEmployeeId?: string
  defaultAssignedTeamId?: string
  nextRunAt?: string
  lastRunAt?: string
  endsAt?: string
  isActive: boolean
}

export interface CreatePreventivePlanDto {
  name: string
  description?: string
  assetTemplateId?: string
  assetId?: string
  workflowTemplateId?: string
  generatedEntityType: string
  cronExpression: string
  dueDateOffsetDays: number
  conditionRuleJson?: string
  autoAssign: boolean
  defaultAssignedEmployeeId?: string
  defaultAssignedTeamId?: string
  endsAt?: string
}

export interface ExecutionLogEntry {
  id: string
  executedAt: string
  occurrence: string
  assetId: string
  assetName?: string
  status: 'success' | 'skipped' | 'failed'
  generatedEntityType?: string
  generatedEntityId?: string
  message?: string
}

export interface EvaluationResult {
  processedPlans: number
  generatedWorkTasks: number
  generatedMaintenanceOrders: number
  skippedAssets: number
  failedAssets?: number
}

export const preventivePlanService = {
  getAll: async (params?: { assetId?: string; templateId?: string; active?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params?.assetId) searchParams.append('assetId', params.assetId)
    if (params?.templateId) searchParams.append('templateId', params.templateId)
    if (params?.active !== undefined) searchParams.append('active', String(params.active))

    const { data } = await api.get<{ items: PreventivePlanSummary[] }>(
      `/preventive-plans?${searchParams.toString()}`
    )
    return data.items
  },

  getById: async (id: string) => {
    const { data } = await api.get<PreventivePlanSummary>(`/preventive-plans/${id}`)
    return data
  },

  create: async (payload: CreatePreventivePlanDto) => {
    const { data } = await api.post<{ id: string; nextRunAt: string }>('/preventive-plans', payload)
    return data
  },

  update: async (id: string, payload: CreatePreventivePlanDto) => {
    const { data } = await api.put<PreventivePlanSummary>(`/preventive-plans/${id}`, payload)
    return data
  },

  delete: async (id: string) => {
    await api.delete(`/preventive-plans/${id}`)
  },

  toggleActive: async (id: string) => {
    const { data } = await api.patch<PreventivePlanSummary>(`/preventive-plans/${id}/toggle-active`)
    return data
  },

  evaluate: async (id: string) => {
    const { data } = await api.post<EvaluationResult>(`/preventive-plans/${id}/evaluate`)
    return data
  },

  getLogs: async (id: string, params?: { assetId?: string; status?: string; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.assetId) searchParams.append('assetId', params.assetId)
    if (params?.status) searchParams.append('status', params.status)
    if (params?.page) searchParams.append('page', String(params.page))
    if (params?.pageSize) searchParams.append('pageSize', String(params.pageSize))

    const { data } = await api.get<{ items: ExecutionLogEntry[]; totalCount: number }>(
      `/preventive-plans/${id}/logs?${searchParams.toString()}`
    )
    return data
  },

  getNextOccurrences: async (id: string, count = 12) => {
    const { data } = await api.get<{ items: string[] }>(
      `/preventive-plans/${id}/next-occurrences?count=${count}`
    )
    return data.items
  },
}
