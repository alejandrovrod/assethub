import { apiClient } from '@/lib/api-client'

export type HorizonDays = 30 | 60 | 90

export type ServiceSource = 'preventivePlan' | 'meterBurnRate' | 'healthRisk'
export type BurnRateConfidence = 'High' | 'Medium' | 'Estimated'
export type WarningSeverity = 'Critical' | 'High' | 'Medium'
export type WarningType = 'Stockout' | 'WorkshopOverload' | 'HealthRisk' | 'BudgetSpike'

export interface PredictiveForecastRequest {
  horizonDays: HorizonDays
  assetTemplateId?: string | null
  warehouseId?: string | null
  meterIntervalOverride?: number | null
  meterKeyOverride?: string | null
}

export interface ProjectedService {
  serviceKey: string
  assetId: string
  assetCode: string
  assetName: string
  assetTemplateId?: string | null
  label: string
  source: ServiceSource
  dueDate: string
  daysUntilDue: number
  preventivePlanId?: string | null
  meterKey?: string | null
  currentMeterValue?: number | null
  targetMeterValue?: number | null
  burnRatePerDay?: number | null
  burnRateConfidence?: BurnRateConfidence | null
  riskLevel?: string | null
}

export interface MeterProjection {
  assetId: string
  assetCode: string
  meterKey: string
  currentValue: number
  targetValue?: number | null
  interval?: number | null
  burnRatePerDay?: number | null
  confidence: BurnRateConfidence
  projectedServiceDate?: string | null
}

export interface StockoutForecast {
  catalogItemId: string
  code: string
  label: string
  requiredQuantity: number
  availableQuantity: number
  shortfallQuantity: number
  daysUntilStockout?: number | null
  stockoutDate?: string | null
  estimatedRestockCost: number
  currency: string
  affectedAssetIds: string[]
  affectedAssetCodes: string[]
}

export interface WeeklyWorkshopLoad {
  isoYear: number
  isoWeek: number
  weekStart: string
  weekEnd: string
  projectedServices: number
  backlogTasks: number
  projectedHours: number
  availableHours: number
  saturationPercent: number
  isOverloaded: boolean
}

export interface BudgetProjection {
  currency: string
  coveredPartsCost: number
  urgentPurchaseCost: number
  estimatedLaborCost: number
  historicalRunRateCost: number
  estimatedTotalCost: number
  projectedServiceCount: number
  averageCostPerService: number
  historicalDailyCost: number
}

export interface PredictiveForecastSnapshot {
  generatedAt: string
  horizonDays: number
  horizonStart: string
  horizonEnd: string
  assetTemplateId?: string | null
  warehouseId?: string | null
  currency: string
  projectedServices: ProjectedService[]
  stockoutForecasts: StockoutForecast[]
  weeklyWorkshopLoad: WeeklyWorkshopLoad[]
  budgetProjection: BudgetProjection
  meterProjections: MeterProjection[]
}

export interface PredictiveEarlyWarning {
  severity: WarningSeverity
  type: WarningType
  message: string
  daysAhead: number
  affectedAssetIds: string[]
  affectedCatalogItemIds: string[]
}

export interface PredictivePurchaseSuggestion {
  catalogItemId: string
  code: string
  quantityToBuy: number
  estimatedCost: number
  neededByDate?: string | null
  affectedAssetIds: string[]
  rationale: string
}

export interface PredictiveScheduleRecommendation {
  recommendation: string
  affectedAssetIds: string[]
  suggestedDate?: string | null
  rationale: string
}

export interface PredictivePlannerAdvisory {
  executiveSummary: string
  earlyWarnings: PredictiveEarlyWarning[]
  purchaseSuggestions: PredictivePurchaseSuggestion[]
  scheduleRecommendations: PredictiveScheduleRecommendation[]
  validationWarnings: string[]
}

export interface PredictivePlannerForecastResponse {
  forecast: PredictiveForecastSnapshot
  advisory?: PredictivePlannerAdvisory | null
  advisoryGenerated: boolean
  warnings: string[]
}

export const predictivePlannerService = {
  async forecast(request: PredictiveForecastRequest): Promise<PredictivePlannerForecastResponse> {
    const response = await apiClient.post<PredictivePlannerForecastResponse>(
      '/predictive-planner/forecast',
      request
    )
    return response.data
  },
}
