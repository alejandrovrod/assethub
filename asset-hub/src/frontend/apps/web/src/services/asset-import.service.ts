import axios from 'axios'
import { apiClient } from '../lib/api-client'

export type ImportTemplateFormat = 'xlsx' | 'csv'

export interface ImportRowError {
  rowNumber: number
  code: string
  field: string
  message: string
}

export interface ImportRowPreview {
  rowNumber: number
  code: string
  name: string
  state: string
  parentCode?: string | null
  properties: Record<string, unknown>
}

export interface ImportValidationResult {
  totalRows: number
  validRows: number
  invalidRows: number
  hasErrors?: boolean
  errors: ImportRowError[]
  preview: ImportRowPreview[]
}

export interface ImportExecutionResult {
  success: boolean
  totalProcessed: number
  importedCount: number
  failedCount: number
  importedAssetIds: string[]
}

export interface ImportValidationFailed {
  validationError: ImportValidationResult
}

export type ImportExecutionOutcome = ImportExecutionResult | ImportValidationFailed

export function isValidationFailed(
  outcome: ImportExecutionOutcome
): outcome is ImportValidationFailed {
  return 'validationError' in outcome
}

const toColumnMappingsJson = (columnMappings?: Record<string, string>) => {
  if (!columnMappings) return undefined
  const filtered = Object.fromEntries(
    Object.entries(columnMappings).filter(([, v]) => v && v.trim().length > 0)
  )
  return Object.keys(filtered).length > 0 ? JSON.stringify(filtered) : undefined
}

export const assetImportService = {
  downloadTemplate: async (templateId: string, format: ImportTemplateFormat = 'xlsx') => {
    const { data } = await apiClient.get<Blob>(`/assets/import/template/${templateId}`, {
      params: { format },
      responseType: 'blob'
    })
    const extension = format === 'csv' ? 'csv' : 'xlsx'
    const url = window.URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `plantilla-importacion-${templateId}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  validateImport: async (
    file: File,
    templateId: string,
    columnMappings?: Record<string, string>
  ): Promise<ImportValidationResult> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('assetTemplateId', templateId)
    const mappingsJson = toColumnMappingsJson(columnMappings)
    if (mappingsJson) formData.append('columnMappingsJson', mappingsJson)
    const { data } = await apiClient.post<ImportValidationResult>('/assets/import/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  },

  executeImport: async (
    file: File,
    templateId: string,
    continueOnError: boolean,
    columnMappings?: Record<string, string>
  ): Promise<ImportExecutionOutcome> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('assetTemplateId', templateId)
    formData.append('continueOnError', String(continueOnError))
    const mappingsJson = toColumnMappingsJson(columnMappings)
    if (mappingsJson) formData.append('columnMappingsJson', mappingsJson)
    try {
      const { data } = await apiClient.post<ImportExecutionResult>('/assets/import/execute', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 422 && error.response.data) {
        return { validationError: error.response.data as ImportValidationResult }
      }
      throw error
    }
  }
}
