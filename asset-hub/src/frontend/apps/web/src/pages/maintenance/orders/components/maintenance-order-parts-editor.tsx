import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Trash2, Globe, Zap, Minus } from 'lucide-react'
import { maintenanceOrderService, type MaintenanceOrderState, type AddPartDto } from '@/services/maintenance-order.service'
import { inventoryService } from '@/services/inventory.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/handle-server-error'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { apiClient as api } from '@/lib/api-client'
import { assetService } from '@/services/asset.service'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'

interface MaintenanceOrderPartsEditorProps {
  orderId: string
  state: MaintenanceOrderState
  assetId?: string
}

type SourceType = 'None' | 'Internal' | 'External'

interface PartForm {
  catalogItemId: string
  catalogItemLabel: string
  quantity: number
  unitCost: number
  sourceType: SourceType
  warehouseId?: string
  externalSupplierName?: string
  externalReference?: string
}

const DEFAULT_FORM: PartForm = {
  catalogItemId: '',
  catalogItemLabel: '',
  quantity: 1,
  unitCost: 0,
  sourceType: 'None',
}

export function MaintenanceOrderPartsEditor({ orderId, state, assetId }: MaintenanceOrderPartsEditorProps) {
  const { t } = useTranslation(['maintenance', 'common'])
  const { can } = usePermissions()
  const canManageParts = can('maintenance-parts:manage')
  const queryClient = useQueryClient()
  const [newPart, setNewPart] = useState<PartForm>(DEFAULT_FORM)
  const [showForm, setShowForm] = useState(false)

  const isLocked = state === 'verified' || !canManageParts

  const { data: parts = [] } = useQuery({
    queryKey: ['maintenance-order-parts', orderId],
    queryFn: () => maintenanceOrderService.getParts(orderId),
  })

  const { data: bomMaterials = [] } = useQuery({
    queryKey: ['asset-materials', assetId],
    queryFn: () => assetService.getMaterials(assetId!),
    enabled: !!assetId,
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: inventoryService.getWarehouses,
  })

  const { data: inventorySettings } = useQuery({
    queryKey: ['inventory-settings'],
    queryFn: inventoryService.getSettings,
  })

  // Only show source selector when mode is Internal or Hybrid
  const showSourceSelector =
    inventorySettings?.operatingMode === 'internal' ||
    inventorySettings?.operatingMode === 'hybrid'

  const removeMutation = useMutation({
    mutationFn: (partId: string) => maintenanceOrderService.removePart(orderId, partId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order-parts', orderId] })
      toast.success(t('orders.parts.toast.deleted'))
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, t('orders.parts.toast.deleteError'))),
  })

  const addMutation = useMutation({
    mutationFn: (payload: AddPartDto) => maintenanceOrderService.addPart(orderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order-parts', orderId] })
      toast.success(t('orders.parts.toast.added'))
      setNewPart(DEFAULT_FORM)
      setShowForm(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.response?.data?.title || t('orders.parts.toast.addError')
      toast.error(msg)
    },
  })

  const handleAddPart = () => {
    if (!newPart.catalogItemId || newPart.quantity <= 0) {
      toast.error(t('orders.parts.validation.itemAndQuantity'))
      return
    }
    if (newPart.sourceType === 'Internal' && !newPart.warehouseId) {
      toast.error(t('orders.parts.validation.warehouseRequired'))
      return
    }

    addMutation.mutate({
      catalogItemId: newPart.catalogItemId,
      quantity: newPart.quantity,
      unitCost: newPart.unitCost,
      sourceType: newPart.sourceType,
      warehouseId: newPart.sourceType === 'Internal' ? newPart.warehouseId : undefined,
      externalSupplierName: newPart.sourceType === 'External' ? newPart.externalSupplierName : undefined,
      externalReference: newPart.sourceType === 'External' ? newPart.externalReference : undefined,
    })
  }

  const sourceIcon = (s: SourceType) => {
    if (s === 'Internal') return <Zap className="h-3 w-3 text-emerald-500" />
    if (s === 'External') return <Globe className="h-3 w-3 text-sky-500" />
    return <Minus className="h-3 w-3 text-muted-foreground" />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span className="text-muted-foreground">{t('orders.parts.title')}</span>
        </h4>
        {!isLocked && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> {t('common:actions.add')}
          </Button>
        )}
      </div>

      {showForm && !isLocked && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30 mt-2">

          {/* BOM Suggestions */}
          {bomMaterials.length > 0 && (
            <div className="space-y-2 mb-4">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {t('orders.parts.bomSuggested')}
              </Label>
              <div className="flex flex-wrap gap-2">
                {bomMaterials.map(m => (
                  <Badge
                    key={m.id}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80 border-primary/20 text-xs font-normal"
                    onClick={() => {
                      setNewPart(prev => ({
                        ...prev,
                        catalogItemId: m.catalogItemId,
                        catalogItemLabel: m.catalogItemLabel,
                        quantity: m.quantity,
                      }))
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1 opacity-50" />
                    {m.catalogItemLabel}
                    {m.isCritical && <span className="text-destructive ml-1">*</span>}
                  </Badge>
                ))}
              </div>
              <Separator className="mt-3 mb-1" />
            </div>
          )}

          {/* Catalog search */}
          <div className="space-y-2">
            <Label>{t('orders.parts.catalogItem')}</Label>
            <AsyncCombobox<{ id: string; name: string }>
              minSearchChars={1}
              fetcher={async (query) => {
                const params = new URLSearchParams({ locale: 'es', search: query })
                const { data } = await api.get<{ items: Array<{ id: string; label: string }> }>(`/catalogs/parts/items?${params}`)
                return data.items.map(i => ({ id: i.id, name: i.label }))
              }}
              labelKey="name"
              valueKey="id"
              placeholder={t('orders.parts.searchPlaceholder')}
              searchPlaceholder={t('form.searchTypePlaceholder')}
              emptyText={t('orders.parts.noItemsFound')}
              onSelect={(item) => {
                setNewPart(prev => ({ ...prev, catalogItemId: item.id, catalogItemLabel: item.name }))
              }}
              renderTrigger={(onClick) => (
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  onClick={onClick}
                  className="w-full justify-between font-normal text-sm"
                >
                  {newPart.catalogItemLabel || t('orders.parts.searchPlaceholder')}
                  <span className="ml-2 opacity-50">▼</span>
                </Button>
              )}
            />
          </div>

          {/* Quantity & Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('common:labels.quantity')}</Label>
              <Input
                type="number"
                min={1}
                value={newPart.quantity}
                onChange={(e) => setNewPart(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('orders.parts.unitCost')}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={newPart.unitCost}
                onChange={(e) => setNewPart(prev => ({ ...prev, unitCost: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>

          {/* Source selector — only shown in Internal or Hybrid mode */}
          {showSourceSelector && (
            <div className="space-y-3 border-t pt-3 mt-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {t('orders.parts.sourceLabel')}
              </Label>

              <div className="flex gap-2">
                {(['None', 'Internal', 'External'] as SourceType[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNewPart(prev => ({ ...prev, sourceType: s, warehouseId: undefined, externalSupplierName: undefined, externalReference: undefined }))}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all
                      ${newPart.sourceType === s
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                      }
                    `}
                  >
                    {sourceIcon(s)}
                    {s === 'None' ? t('orders.parts.sourceNone') : s === 'Internal' ? t('orders.parts.sourceInternal') : t('orders.parts.sourceExternal')}
                  </button>
                ))}
              </div>

              {newPart.sourceType === 'Internal' && (
                <div className="space-y-2">
                  <Label>{t('orders.parts.warehouse')}</Label>
                  <Select
                    value={newPart.warehouseId}
                    onValueChange={v => setNewPart(prev => ({ ...prev, warehouseId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('orders.parts.selectWarehouse')} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.filter(w => w.isActive).map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {warehouses.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('orders.parts.noWarehouses')} <a href="/inventory/warehouses" className="underline text-primary">{t('orders.parts.createOne')}</a>.
                    </p>
                  )}
                </div>
              )}

              {newPart.sourceType === 'External' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t('common:labels.supplier')}</Label>
                    <Input
                      placeholder={t('orders.parts.supplierNamePlaceholder')}
                      value={newPart.externalSupplierName ?? ''}
                      onChange={e => setNewPart(prev => ({ ...prev, externalSupplierName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('common:labels.reference')}</Label>
                    <Input
                      placeholder={t('orders.parts.referencePlaceholder')}
                      value={newPart.externalReference ?? ''}
                      onChange={e => setNewPart(prev => ({ ...prev, externalReference: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button size="sm" onClick={handleAddPart} disabled={addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {t('common:actions.add')}
            </Button>
          </div>
        </div>
      )}

      {parts.length > 0 && (
        <div className="space-y-2">
          {parts.map((part) => (
            <div key={part.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-background">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {part.catalogItemLabel || part.catalogItemId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {part.quantity} × ${part.unitCost.toFixed(2)} = <span className="font-medium text-foreground">${part.totalCost.toFixed(2)}</span>
                </p>
              </div>
              {!isLocked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(part.id)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Separator />
    </div>
  )
}
