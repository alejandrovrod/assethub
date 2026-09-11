import { apiClient as api } from '@/lib/api-client'

export interface ReliabilityMetrics {
  scope: 'asset' | 'global'
  assetId?: string | null
  correctiveOrderCount: number
  mtbfHours?: number | null
  mttrRestoreHours?: number | null
  mttrRepairHours?: number | null
  mtbfMessage?: string | null
  mttrMessage?: string | null
  calculatedAt: string
}

export interface AssetTco {
  scope: 'asset' | 'global'
  assetId?: string | null
  totalCost: number
  currency: string
  costByType: Record<string, number>
  entryCount: number
  annualizedCost?: number | null
  ageDays: number
  annualizationStatus: 'sufficient_data' | 'projected' | 'insufficient_data' | 'not_applicable'
  annualizationMessage?: string | null
  calculatedAt: string
}

export interface DashboardStats {
  assetsByState: Record<string, number>
  incidentsByPriority: Record<string, number>
  taskCompliancePercentage: number
}

export const analyticsService = {
  async getReliability(assetId: string = 'global'): Promise<ReliabilityMetrics> {
    const { data } = await api.get<ReliabilityMetrics>(`/analytics/assets/${assetId}/reliability`)
    return data
  },

  async getTco(assetId: string = 'global', includeSubtree = false): Promise<AssetTco> {
    const { data } = await api.get<AssetTco>(`/analytics/assets/${assetId}/tco`, {
      params: includeSubtree ? { includeSubtree: true } : undefined,
    })
    return data
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const { data } = await api.get<DashboardStats>('/analytics/dashboards/stats')
    return data
  },
}
