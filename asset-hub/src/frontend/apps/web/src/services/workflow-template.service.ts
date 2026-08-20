import { apiClient as api } from '@/lib/api-client'
import { LifecycleConfig } from './asset-template.service'

export interface WorkflowTemplate {
  id: string
  code: string
  name: string
  description: string
  schemaJson: string
  type: string
  lifecycleStates: LifecycleConfig
  isActive: boolean
}

export interface WorkflowTemplateSummary {
  id: string
  code: string
  name: string
  description: string
  type: string
  isActive: boolean
}

export interface CreateWorkflowTemplateDto {
  code: string
  name: string
  description: string
  schemaJson: string
  type: string
  lifecycleStates: LifecycleConfig
}

export interface UpdateWorkflowTemplateDto {
  id: string
  code: string
  name: string
  description: string
  schemaJson: string
  type: string
  lifecycleStates: LifecycleConfig
}

export const WorkflowTemplateService = {
  search: async (q?: string, includeInactive?: boolean) => {
    const params = new URLSearchParams()
    if (q) params.append('q', q)
    if (includeInactive) params.append('includeInactive', 'true')
    
    const { data } = await api.get<{ items: WorkflowTemplateSummary[] }>(`/workflow-templates?${params.toString()}`)
    return data.items
  },

  getById: async (id: string) => {
    const { data } = await api.get<WorkflowTemplate>(`/workflow-templates/${id}`)
    return data
  },

  create: async (payload: CreateWorkflowTemplateDto) => {
    const { data } = await api.post<{ id: string }>('/workflow-templates', payload)
    return data.id
  },

  update: async (id: string, payload: UpdateWorkflowTemplateDto) => {
    await api.put(`/workflow-templates/${id}`, payload)
  },

  delete: async (id: string) => {
    await api.delete(`/workflow-templates/${id}`)
  }
}
