import { apiClient as api } from '@/lib/api-client'

// ─── Types ──────────────────────────────────────────────────────────────────

export type InventoryOperatingMode = 'external' | 'internal' | 'hybrid'

export interface TenantInventorySettings {
  tenantId: string
  operatingMode: InventoryOperatingMode
  allowNegativeStock: boolean
}

export interface Warehouse {
  id: string
  name: string
  code: string
  description?: string
  isActive: boolean
  createdAt: string
}

export interface StockBalance {
  warehouseId: string
  warehouseName: string
  catalogItemId: string
  catalogItemCode: string
  catalogItemName: string
  quantityOnHand: number
  averageUnitCost: number
  updatedAt: string
}

export interface InventoryTransaction {
  id: string
  warehouseId: string
  catalogItemId: string
  type: string
  state: string
  quantity: number
  unitCost: number
  reason?: string
  createdAt: string
  postedAt?: string
  idempotencyKey: string
}

export interface CreateWarehouseRequest {
  name: string
  code: string
  description?: string
}

export interface PostAdjustmentRequest {
  warehouseId: string
  catalogItemId: string
  quantity: number
  unitCost: number
  type: string
  reason: string
  idempotencyKey: string
}

export interface UpdateInventorySettingsRequest {
  operatingMode: InventoryOperatingMode
  allowNegativeStock: boolean
}

// ─── Service ────────────────────────────────────────────────────────────────

const BASE = '/inventory'

export const inventoryService = {
  // Settings
  getSettings: () =>
    api.get<TenantInventorySettings>(`${BASE}/settings`).then(r => r.data),

  updateSettings: (body: UpdateInventorySettingsRequest) =>
    api.put<TenantInventorySettings>(`${BASE}/settings`, body).then(r => r.data),

  // Warehouses
  getWarehouses: () =>
    api.get<Warehouse[]>(`${BASE}/warehouses`).then(r => r.data),

  createWarehouse: (body: CreateWarehouseRequest) =>
    api.post<Warehouse>(`${BASE}/warehouses`, body).then(r => r.data),

  // Stock
  getStock: (warehouseId?: string) =>
    api
      .get<StockBalance[]>(`${BASE}/stock`, { params: { warehouseId } })
      .then(r => r.data),

  // Transactions
  postAdjustment: (body: PostAdjustmentRequest) =>
    api.post<InventoryTransaction>(`${BASE}/adjustments`, body).then(r => r.data),
}
