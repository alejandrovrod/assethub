import { apiClient } from '../lib/api-client'

// ===== ENUMS =====
export type DepreciationMethod = 'StraightLine' | 'DoubleDeclining' | 'WrittenDownValue' | 'Manual'
export type ValueAdjustmentType = 'Revaluation' | 'Impairment'
export type DisposalType = 'Scrapped' | 'Sold' | 'Lost' | 'Donated' | 'Transferred'
export type CustodyTransferType = 'Assignment' | 'Transfer' | 'Return' | 'Relocation'

// ===== FINANCE PROFILE =====
export interface AssetFinanceBookDto {
  id: string
  assetId: string
  acquisitionCost: number
  residualValue: number
  usefulLifeMonths: number
  depreciationMethod: DepreciationMethod
  depreciationRatePct?: number
  frequencyMonths: number
  startDate: string
  currency: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertFinanceBookRequest {
  acquisitionCost: number
  residualValue: number
  usefulLifeMonths: number
  depreciationMethod: DepreciationMethod
  depreciationRatePct?: number
  frequencyMonths: number
  startDate: string
  currency?: string
}

// ===== DEPRECIATION SCHEDULE =====
export interface AssetDepreciationScheduleDto {
  id: string
  periodNumber: number
  periodStartDate: string
  periodEndDate: string
  projectedDepreciationAmount: number
  projectedAccumulatedDepreciation: number
  projectedNetBookValue: number
  isPosted: boolean
  postedEntryId?: string
}

export interface ManualScheduleItemDto {
  periodNumber: number
  periodStartDate: string
  periodEndDate: string
  depreciationAmount: number
}

export interface GenerateScheduleRequest {
  forceRegenerate?: boolean
  manualSchedule?: ManualScheduleItemDto[]
}

export interface GenerateScheduleResponse {
  periodsGenerated: number
  lastPeriodEndDate: string
}

export interface RecalculateScheduleRequest {
  effectiveFromDate: string
  reason: string
}

export interface RecalculateScheduleResponse {
  periodsRecalculated: number
  lastPeriodEndDate: string
}

export interface PagedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

// ===== DEPRECIATION ENTRIES =====
export interface AssetDepreciationEntryDto {
  id: string
  periodNumber: number
  accountingDate: string
  depreciationAmount: number
  accumulatedDepreciation: number
  netBookValue: number
  idempotencyKey: string
  postedBy: string
  postedAt: string
  notes?: string
}

export interface PostDepreciationRequest {
  periodsToPost: number
  accountingDate?: string
  notes?: string
}

export interface PostDepreciationResponse {
  postedEntries: AssetDepreciationEntryDto[]
  periodsPosted: number
  newNetBookValue: number
}

// ===== VALUE ADJUSTMENTS =====
export interface AssetValueAdjustmentDto {
  id: string
  adjustmentType: ValueAdjustmentType
  previousNetBookValue: number
  adjustmentAmount: number
  newNetBookValue: number
  reason: string
  effectiveDate: string
  approvedBy: string
  approvedAt: string
}

export interface CreateValueAdjustmentRequest {
  adjustmentType: ValueAdjustmentType
  adjustmentAmount: number
  reason: string
  effectiveDate: string
}

// ===== DISPOSAL =====
export interface AssetDisposalDto {
  id: string
  disposalType: DisposalType
  disposalDate: string
  netBookValueAtDisposal: number
  proceedsAmount: number
  gainLossAmount: number
  reason: string
  documentReference?: string
  approvedBy: string
  approvedAt: string
}

export interface CreateDisposalRequest {
  disposalType: DisposalType
  disposalDate: string
  proceedsAmount: number
  reason: string
  documentReference?: string
}

// ===== CUSTODY TRANSFERS =====
export interface AssetCustodyTransferDto {
  id: string
  fromEmployeeId?: string
  fromEmployeeName?: string
  toEmployeeId: string
  toEmployeeName: string
  fromDepartmentId?: string
  fromDepartmentName?: string
  toDepartmentId?: string
  toDepartmentName?: string
  transferDate: string
  transferType: CustodyTransferType
  reason: string
  documentUrl?: string
  signedByFrom?: string
  signedByTo?: string
  createdBy: string
  createdAt: string
}

export interface CreateCustodyTransferRequest {
  toEmployeeId: string
  fromDepartmentId?: string
  toDepartmentId?: string
  transferDate: string
  transferType: CustodyTransferType
  reason: string
  documentUrl?: string
  signedByFrom?: string
  signedByTo?: string
}

// ===== MAINTENANCE CAPITALIZATION =====
export interface AssetRepairCapitalizationDto {
  id: string
  maintenanceOrderId: string
  capitalizedAmount: number
  newUsefulLifeMonths?: number
  effectiveDate: string
  approvedBy: string
  approvedAt: string
}

export interface CapitalizeMaintenanceRequest {
  newUsefulLifeMonths?: number
  effectiveDate: string
}

// ===== FINANCE SUMMARY =====
export interface AssetFinanceSummaryDto {
  assetId: string
  assetCode: string
  assetName: string
  acquisitionCost?: number
  residualValue?: number
  usefulLifeMonths?: number
  depreciationMethod?: DepreciationMethod
  currentNetBookValue: number
  accumulatedDepreciation: number
  depreciationThisPeriod: number
  nextDepreciationDate?: string
  remainingPeriods: number
  hasFinanceBook: boolean
  isDisposed: boolean
  disposalType?: string
  disposalDate?: string
}

// ===== SERVICE =====
export const financeService = {
  // Finance Profile
  getFinanceProfile: async (assetId: string): Promise<AssetFinanceBookDto | null> => {
    try {
      const { data } = await apiClient.get<AssetFinanceBookDto>(`/assets/${assetId}/finance-profile`)
      return data
    } catch (error: any) {
      if (error.response?.status === 404) return null
      throw error
    }
  },

  upsertFinanceProfile: async (assetId: string, request: UpsertFinanceBookRequest): Promise<AssetFinanceBookDto> => {
    const { data } = await apiClient.put<AssetFinanceBookDto>(`/assets/${assetId}/finance-profile`, request)
    return data
  },

  deleteFinanceProfile: async (assetId: string): Promise<void> => {
    await apiClient.delete(`/assets/${assetId}/finance-profile`)
  },

  // Depreciation Schedules
  getDepreciationSchedules: async (assetId: string, params?: { page?: number; pageSize?: number; onlyPending?: boolean }): Promise<PagedResult<AssetDepreciationScheduleDto>> => {
    const { data } = await apiClient.get<PagedResult<AssetDepreciationScheduleDto>>(`/assets/${assetId}/depreciation-schedules`, { params })
    return data
  },

  generateDepreciationSchedule: async (assetId: string, request: GenerateScheduleRequest): Promise<GenerateScheduleResponse> => {
    const { data } = await apiClient.post<GenerateScheduleResponse>(`/assets/${assetId}/depreciation-schedules/generate`, request)
    return data
  },

  recalculateDepreciationSchedule: async (assetId: string, request: RecalculateScheduleRequest): Promise<RecalculateScheduleResponse> => {
    const { data } = await apiClient.post<RecalculateScheduleResponse>(`/assets/${assetId}/depreciation-schedules/recalculate`, request)
    return data
  },

  // Depreciation Entries (Posting)
  getDepreciationEntries: async (assetId: string, params?: { page?: number; pageSize?: number }): Promise<PagedResult<AssetDepreciationEntryDto>> => {
    const { data } = await apiClient.get<PagedResult<AssetDepreciationEntryDto>>(`/assets/${assetId}/depreciation-entries`, { params })
    return data
  },

  postDepreciationEntries: async (assetId: string, request: PostDepreciationRequest): Promise<PostDepreciationResponse> => {
    const { data } = await apiClient.post<PostDepreciationResponse>(`/assets/${assetId}/depreciation-entries/post`, request)
    return data
  },

  // Value Adjustments
  getValueAdjustments: async (assetId: string, params?: { page?: number; pageSize?: number }): Promise<PagedResult<AssetValueAdjustmentDto>> => {
    const { data } = await apiClient.get<PagedResult<AssetValueAdjustmentDto>>(`/assets/${assetId}/value-adjustments`, { params })
    return data
  },

  createValueAdjustment: async (assetId: string, request: CreateValueAdjustmentRequest): Promise<AssetValueAdjustmentDto> => {
    const { data } = await apiClient.post<AssetValueAdjustmentDto>(`/assets/${assetId}/value-adjustments`, request)
    return data
  },

  // Disposal
  getDisposal: async (assetId: string): Promise<AssetDisposalDto | null> => {
    try {
      const { data } = await apiClient.get<AssetDisposalDto>(`/assets/${assetId}/disposal`)
      return data
    } catch (error: any) {
      if (error.response?.status === 404) return null
      throw error
    }
  },

  createDisposal: async (assetId: string, request: CreateDisposalRequest): Promise<AssetDisposalDto> => {
    const { data } = await apiClient.post<AssetDisposalDto>(`/assets/${assetId}/disposal`, request)
    return data
  },

  // Custody Transfers
  getCustodyTransfers: async (assetId: string, params?: { page?: number; pageSize?: number }): Promise<PagedResult<AssetCustodyTransferDto>> => {
    const { data } = await apiClient.get<PagedResult<AssetCustodyTransferDto>>(`/assets/${assetId}/custody-transfers`, { params })
    return data
  },

  createCustodyTransfer: async (assetId: string, request: CreateCustodyTransferRequest): Promise<AssetCustodyTransferDto> => {
    const { data } = await apiClient.post<AssetCustodyTransferDto>(`/assets/${assetId}/custody-transfers`, request)
    return data
  },

  // Maintenance Capitalization
  capitalizeMaintenanceOrder: async (maintenanceOrderId: string, request: CapitalizeMaintenanceRequest): Promise<AssetRepairCapitalizationDto> => {
    const { data } = await apiClient.post<AssetRepairCapitalizationDto>(`/maintenance-orders/${maintenanceOrderId}/capitalize`, request)
    return data
  },

  // Finance Summary
  getFinanceSummary: async (assetId: string): Promise<AssetFinanceSummaryDto | null> => {
    try {
      const { data } = await apiClient.get<AssetFinanceSummaryDto>(`/assets/${assetId}/finance-summary`)
      return data
    } catch (error: any) {
      if (error.response?.status === 404) return null
      throw error
    }
  }
}

// ===== HELPERS =====
export const getDepreciationMethodLabel = (method: DepreciationMethod): string => {
  switch (method) {
    case 'StraightLine': return 'Línea Recta'
    case 'DoubleDeclining': return 'Doble Saldo Decreciente'
    case 'WrittenDownValue': return 'Valor en Libros (WDV)'
    case 'Manual': return 'Manual'
  }
}

export const getValueAdjustmentTypeLabel = (type: ValueAdjustmentType): string => {
  return type === 'Revaluation' ? 'Revaluación' : 'Deterioro (Impairment)'
}

export const getDisposalTypeLabel = (type: DisposalType): string => {
  switch (type) {
    case 'Scrapped': return 'Chatarrización'
    case 'Sold': return 'Venta'
    case 'Lost': return 'Pérdida/Robo'
    case 'Donated': return 'Donación'
    case 'Transferred': return 'Transferencia'
  }
}

export const getCustodyTransferTypeLabel = (type: CustodyTransferType): string => {
  switch (type) {
    case 'Assignment': return 'Asignación Inicial'
    case 'Transfer': return 'Transferencia'
    case 'Return': return 'Devolución'
    case 'Relocation': return 'Reubicación'
  }
}

export const getAdjustmentTypeColor = (type: ValueAdjustmentType): string => {
  return type === 'Revaluation' ? 'text-emerald-600 bg-emerald-50' : 'text-destructive bg-destructive/10'
}

export const getDisposalTypeColor = (type: DisposalType): string => {
  switch (type) {
    case 'Scrapped': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    case 'Sold': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'Lost': return 'bg-destructive/10 text-destructive'
    case 'Donated': return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'Transferred': return 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  }
}