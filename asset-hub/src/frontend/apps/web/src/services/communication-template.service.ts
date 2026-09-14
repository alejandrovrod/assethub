import { apiClient as api } from '@/lib/api-client'

export type CommunicationEntityScope = 'incident' | 'maintenanceOrder' | 'workTask' | 'asset'
export type CommunicationTemplateType = 'email' | 'document'

export interface CommunicationTemplateSummary {
  id: string
  code: string
  name: string
  entityScope: CommunicationEntityScope
  templateType: CommunicationTemplateType
  activeVersionId: string | null
  activeVersionNumber: number | null
  versionCount: number
  locales: string[]
  createdAt: string
}

export interface CommunicationTemplatesResult {
  items: CommunicationTemplateSummary[]
  totalCount: number
  page: number
  pageSize: number
}

export interface CommunicationTemplateTranslation {
  id: string
  locale: string
  subject: string | null
  content: string
  designJson?: string
}

export interface CommunicationTemplateVersion {
  id: string
  versionNumber: number
  createdAt: string
  translations: CommunicationTemplateTranslation[]
}

export interface CommunicationTemplateDetail {
  id: string
  code: string
  name: string
  entityScope: CommunicationEntityScope
  templateType: CommunicationTemplateType
  activeVersionId: string | null
  versions: CommunicationTemplateVersion[]
}

export interface TranslationInput {
  locale: string
  subject?: string | null
  content: string
  designJson?: string
}

export interface CreateCommunicationTemplateRequest {
  code: string
  name: string
  entityScope: CommunicationEntityScope
  templateType: CommunicationTemplateType
  translations: TranslationInput[]
}

export interface AddVersionRequest {
  translations: TranslationInput[]
}

export interface RenderTemplateRequest {
  locale: string
  variables?: Record<string, string>
}

export interface TestTranslationInput {
  locale: string
  subject?: string | null
  content: string
}

export interface SendTestEmailRequest {
  to: string
  locale: string
  translations?: TestTranslationInput[]
}

export interface RenderedTemplate {
  subject: string | null
  body: string
  availableVariables: string[]
}

export const communicationTemplateService = {
  getTemplates: async (params?: {
    entityScope?: CommunicationEntityScope
    templateType?: CommunicationTemplateType
    search?: string
  }): Promise<CommunicationTemplatesResult> => {
    const query = new URLSearchParams()
    if (params?.entityScope) query.append('EntityScope', params.entityScope.charAt(0).toUpperCase() + params.entityScope.slice(1))
    if (params?.templateType) query.append('TemplateType', params.templateType.charAt(0).toUpperCase() + params.templateType.slice(1))
    if (params?.search) query.append('Search', params.search)
    const { data } = await api.get<CommunicationTemplatesResult>(
      `/templates?${query.toString()}`
    )
    return data
  },

  getTemplateById: async (id: string): Promise<CommunicationTemplateDetail> => {
    const { data } = await api.get<CommunicationTemplateDetail>(`/templates/${id}`)
    return data
  },

  createTemplate: async (
    request: CreateCommunicationTemplateRequest
  ): Promise<{ id: string }> => {
    const { data } = await api.post<{ id: string }>('/templates', request)
    return data
  },

  addVersion: async (
    id: string,
    request: AddVersionRequest
  ): Promise<{ id: string }> => {
    const { data } = await api.post<{ id: string }>(`/templates/${id}/versions`, request)
    return data
  },

  updateVersion: async (
    id: string,
    versionId: string,
    request: AddVersionRequest
  ): Promise<{ id: string }> => {
    const { data } = await api.put<{ id: string }>(`/templates/${id}/versions/${versionId}`, request)
    return data
  },

  activateVersion: async (id: string, versionId: string): Promise<void> => {
    await api.put(`/templates/${id}/versions/${versionId}/activate`)
  },

  renderTemplate: async (
    id: string,
    request: RenderTemplateRequest
  ): Promise<RenderedTemplate> => {
    const { data } = await api.post<RenderedTemplate>(`/templates/${id}/render`, request)
    return data
  },

  sendTestEmail: async (id: string, request: SendTestEmailRequest): Promise<void> => {
    await api.post(`/templates/${id}/test-email`, request)
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await api.delete(`/templates/${id}`)
  },
}
