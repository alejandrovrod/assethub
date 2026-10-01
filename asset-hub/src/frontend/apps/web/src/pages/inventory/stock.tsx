import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader2, PackageSearch, ArrowUpCircle, ArrowDownCircle, Filter, RefreshCw, Plus
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { inventoryService } from '@/services/inventory.service'
import { catalogService } from '@/services/catalog.service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { usePermissions } from '@/hooks/use-permissions'

const PARTS_CATALOG_CODE = 'parts'

function getAdjustmentSchema(t: TFunction<'inventory'>) {
  return z.object({
    warehouseId: z.string().min(1, t('stock.form.validation.warehouseRequired')),
    catalogItemId: z.string().min(1, t('stock.form.validation.itemRequired')),
    quantity: z.coerce.number().min(0.0001, t('stock.form.validation.quantityPositive')),
    unitCost: z.coerce.number().min(0, t('stock.form.validation.unitCostNotNegative')),
    type: z.enum(['Receipt', 'Adjustment']),
    reason: z.string().min(3, t('stock.form.validation.reasonRequired')),
  })
}

type AdjForm = z.infer<ReturnType<typeof getAdjustmentSchema>>

export default function StockPage() {
  const { t } = useTranslation(['inventory', 'common'])
  const { formatCurrency, formatDate } = useFormat()
  const { canAny } = usePermissions()
  const canRegisterMovements = canAny(['stock:adjust', 'receipts:create'])
  const qc = useQueryClient()
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>()
  const [adjOpen, setAdjOpen] = useState(false)

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: inventoryService.getWarehouses,
  })

  const { data: catalogItems = [] } = useQuery({
    queryKey: ['catalog-items', PARTS_CATALOG_CODE],
    queryFn: () => catalogService.getCatalogItems(PARTS_CATALOG_CODE, 'es'),
  })

  const { data: stock = [], isLoading, refetch } = useQuery({
    queryKey: ['stock', selectedWarehouse],
    queryFn: () => inventoryService.getStock(selectedWarehouse),
  })

  const adjustmentSchema = useMemo(() => getAdjustmentSchema(t), [t])
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AdjForm>({
    resolver: zodResolver(adjustmentSchema) as any,
    defaultValues: { type: 'Receipt' },
  })

  const adjMutation = useMutation({
    mutationFn: (data: AdjForm) =>
      inventoryService.postAdjustment({
        ...data,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success(t('stock.toast.adjusted'))
      setAdjOpen(false)
      reset()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.response?.data?.title || t('stock.toast.adjustError')
      toast.error(msg)
    },
  })

  const onSubmit = (data: AdjForm) => adjMutation.mutate(data)

  const totalValue = stock.reduce((acc, s) => acc + s.quantityOnHand * s.averageUnitCost, 0)
  const lowStockItems = stock.filter(s => s.quantityOnHand <= 0)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('stock.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('stock.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canRegisterMovements && (
            <Button onClick={() => setAdjOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('stock.registerReceipt')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>{t('stock.summary.itemsInStock')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>{t('stock.summary.totalValue')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatCurrency(totalValue, 'MXN')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>{t('stock.summary.outOfStock')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${lowStockItems.length > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {lowStockItems.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={selectedWarehouse ?? 'all'}
          onValueChange={v => setSelectedWarehouse(v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t('stock.allWarehouses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('stock.allWarehouses')}</SelectItem>
            {warehouses.map(w => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stock table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-primary" />
            {t('stock.table.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stock.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <PackageSearch className="h-10 w-10 opacity-30" />
              <p className="text-sm">{t('stock.table.empty')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('stock.table.headers.item')}</TableHead>
                  <TableHead>{t('stock.table.headers.warehouse')}</TableHead>
                  <TableHead className="text-right">{t('common:labels.quantity')}</TableHead>
                  <TableHead className="text-right">{t('stock.table.headers.averageCost')}</TableHead>
                  <TableHead className="text-right">{t('stock.table.headers.totalValue')}</TableHead>
                  <TableHead>{t('common:labels.updatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((s, idx) => {
                  const totalVal = s.quantityOnHand * s.averageUnitCost
                  const isZero = s.quantityOnHand <= 0
                  return (
                    <TableRow key={idx} className={isZero ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {isZero
                            ? <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />
                            : <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500" />
                          }
                          <div className="flex flex-col">
                            <span>{s.catalogItemName || s.catalogItemCode}</span>
                            {s.catalogItemName && s.catalogItemCode && s.catalogItemName !== s.catalogItemCode && (
                              <code className="text-xs text-muted-foreground">{s.catalogItemCode}</code>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.warehouseName}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono font-semibold ${isZero ? 'text-destructive' : ''}`}>
                          {s.quantityOnHand.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(s.averageUnitCost, 'MXN')}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(totalVal, 'MXN')}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(parseApiDate(s.updatedAt), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Adjustment Sheet */}
      <Sheet open={adjOpen} onOpenChange={setAdjOpen}>
        <SheetContent className="sm:max-w-md" aria-describedby="adj-sheet-desc">
          <SheetHeader>
            <SheetTitle>{t('stock.form.sheetTitle')}</SheetTitle>
            <SheetDescription id="adj-sheet-desc">
              {t('stock.form.sheetDescription')}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 mt-6">
            <div className="flex flex-col gap-1.5">
              <Label>{t('stock.form.warehouseLabel')}</Label>
              <Select onValueChange={v => setValue('warehouseId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('stock.form.warehousePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.warehouseId && <p className="text-xs text-destructive">{errors.warehouseId.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('stock.form.itemLabel')}</Label>
              <Select onValueChange={v => setValue('catalogItemId', v, { shouldValidate: true })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('stock.form.itemPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {catalogItems.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.label || item.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.catalogItemId && <p className="text-xs text-destructive">{errors.catalogItemId.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('stock.form.typeLabel')}</Label>
              <Select
                value={watch('type')}
                onValueChange={v => setValue('type', v as 'Receipt' | 'Adjustment')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Receipt">{t('stock.form.typeReceipt')}</SelectItem>
                  <SelectItem value="Adjustment">{t('stock.form.typeAdjustment')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-qty">{t('common:labels.quantity')}</Label>
                <Input id="adj-qty" type="number" step="0.01" min="0" {...register('quantity', { valueAsNumber: true })} />
                {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-cost">{t('stock.form.unitCostLabel')}</Label>
                <Input id="adj-cost" type="number" step="0.0001" min="0" {...register('unitCost', { valueAsNumber: true })} />
                {errors.unitCost && <p className="text-xs text-destructive">{errors.unitCost.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adj-reason">{t('stock.form.reasonLabel')}</Label>
              <Input id="adj-reason" placeholder={t('stock.form.reasonPlaceholder')} {...register('reason')} />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setAdjOpen(false); reset() }}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={adjMutation.isPending}>
                {adjMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('stock.form.submit')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
