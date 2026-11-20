import { apiClient } from '@/lib/api-client'

export interface AssetManualStatusDto {
  fileName: string
  mimeType: string
  source: string
  downloadUrl?: string | null
  sizeBytes: number
  fileHash: string
  isIndexed: boolean
  remoteDocumentName?: string | null
}

export interface AssetCopilotManualsResponse {
  assetId: string
  assetCode: string
  assetName: string
  fileSearchStoreName?: string | null
  totalManualsCount: number
  indexedManualsCount: number
  manuals: AssetManualStatusDto[]
}

export interface IndexAssetManualsResponse {
  assetId: string
  fileSearchStoreName?: string | null
  totalManualsCount: number
  indexedManualsCount: number
  newlyIndexedCount: number
  skippedAlreadyIndexedCount: number
  removedOrphanedCount: number
  warnings: string[]
  manuals: AssetManualStatusDto[]
}

export interface CopilotConversationTurn {
  role: 'user' | 'model'
  text: string
}

export interface FieldCopilotCitation {
  fileName: string
  pageNumber?: number | null
  snippet?: string | null
  downloadUrl?: string | null
  documentName?: string | null
  mediaId?: string | null
}

export interface AskFieldCopilotPayload {
  question?: string
  audioBase64?: string
  audioMimeType?: string
  history?: CopilotConversationTurn[]
  preferredLanguage?: string
}

export interface FieldCopilotResponse {
  answer: string
  foundInManuals: boolean
  citations: FieldCopilotCitation[]
  safetyWarnings: string[]
  indexedManualsCount: number
  modelUsed: string
  usedVoiceInput: boolean
}

export function resolveCopilotManualUrl(downloadUrl?: string | null): string {
  if (!downloadUrl) return ''
  if (
    downloadUrl.startsWith('http://') ||
    downloadUrl.startsWith('https://') ||
    downloadUrl.startsWith('data:')
  ) {
    return downloadUrl
  }
  const rootUrl = apiClient.defaults.baseURL?.replace(/\/api\/v1\/?$/, '') || ''
  return `${rootUrl}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`
}

export const fieldCopilotService = {
  getManuals: async (assetId: string): Promise<AssetCopilotManualsResponse> => {
    const { data } = await apiClient.get<AssetCopilotManualsResponse>(
      `/assets/${assetId}/copilot/manuals`
    )
    return data
  },

  indexManuals: async (
    assetId: string,
    forceReindex = false
  ): Promise<IndexAssetManualsResponse> => {
    const { data } = await apiClient.post<IndexAssetManualsResponse>(
      `/assets/${assetId}/copilot/index`,
      { forceReindex }
    )
    return data
  },

  ask: async (
    assetId: string,
    payload: AskFieldCopilotPayload
  ): Promise<FieldCopilotResponse> => {
    const { data } = await apiClient.post<FieldCopilotResponse>(
      `/assets/${assetId}/copilot/ask`,
      payload
    )
    return data
  },
}
