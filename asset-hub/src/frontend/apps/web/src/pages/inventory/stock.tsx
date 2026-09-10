import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader2, PackageSearch, ArrowUpCircle, ArrowDownCircle, Filter, RefreshCw, Plus
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

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
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'

const PARTS_CATALOG_CODE = 'parts'

const adjustmentSchema = z.object({
  warehouseId: z.string().min(1, 'Seleccioná un almacén'),
  catalogItemId: z.string().min(1, 'Ingresá el ID del artículo'),
  quantity: z.coerce.number().min(0.0001, 'La cantidad debe ser positiva'),
  unitCost: z.coerce.number().min(0, 'El costo no puede ser negativo'),
  type: z.enum(['Receipt', 'Adjustment']),
  reason: z.string().min(3, 'Ingresá un motivo'),
})

type AdjForm = z.infer<typeof adjustmentSchema>

export default function StockPage() {
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
      toast.success('Ajuste registrado correctamente')
      setAdjOpen(false)
      reset()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.response?.data?.title || 'Error al registrar el ajuste'
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
          <h1 className="text-2xl font-bold tracking-tight">Saldos de Stock</h1>
          <p className="text-muted-foreground text-sm">
            Inventario disponible por almacén y artículo de catálogo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setAdjOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar Entrada
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Artículos en stock</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Valor total (costo promedio)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {totalValue.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Artículos sin stock</CardDescription>
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
            <SelectValue placeholder="Todos los almacenes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los almacenes</SelectItem>
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
            Inventario actual
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
              <p className="text-sm">No hay registros de stock para los filtros seleccionados.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo Promedio</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Actualizado</TableHead>
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
                        {s.averageUnitCost.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {totalVal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {format(parseApiDate(s.updatedAt), 'dd MMM HH:mm', { locale: es })}
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
            <SheetTitle>Registrar Entrada / Ajuste</SheetTitle>
            <SheetDescription id="adj-sheet-desc">
              Registra una entrada de mercancía o ajuste manual de inventario.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 mt-6">
            <div className="flex flex-col gap-1.5">
              <Label>Almacén</Label>
              <Select onValueChange={v => setValue('warehouseId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un almacén" />
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
              <Label>Artículo de Catálogo</Label>
              <Select onValueChange={v => setValue('catalogItemId', v, { shouldValidate: true })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un artículo" />
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
              <Label>Tipo de movimiento</Label>
              <Select
                value={watch('type')}
                onValueChange={v => setValue('type', v as 'Receipt' | 'Adjustment')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Receipt">Entrada (Recepción)</SelectItem>
                  <SelectItem value="Adjustment">Ajuste Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-qty">Cantidad</Label>
                <Input id="adj-qty" type="number" step="0.01" min="0" {...register('quantity', { valueAsNumber: true })} />
                {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-cost">Costo Unitario</Label>
                <Input id="adj-cost" type="number" step="0.0001" min="0" {...register('unitCost', { valueAsNumber: true })} />
                {errors.unitCost && <p className="text-xs text-destructive">{errors.unitCost.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adj-reason">Motivo</Label>
              <Input id="adj-reason" placeholder="Compra orden #123, ajuste físico..." {...register('reason')} />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setAdjOpen(false); reset() }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={adjMutation.isPending}>
                {adjMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
