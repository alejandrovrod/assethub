import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react'
import {
  maintenanceOrderService,
  type MaintenanceOrderSummary,
  type MaintenanceOrderState,
  type MaintenanceOrderKind,
  STATE_LABELS,
  KIND_LABELS,
} from '@/services/maintenance-order.service'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MaintenanceOrderDetail } from './components/maintenance-order-detail'
import { MaintenanceOrderFormSheet } from './components/maintenance-order-form-sheet'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'
import { getApiErrorMessage } from '@/lib/handle-server-error'

const STATE_OPTIONS: { value: MaintenanceOrderState | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borrador' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'scheduled', label: 'Programada' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'done', label: 'Completada' },
  { value: 'rescheduled', label: 'Reprogramada' },
  { value: 'verified', label: 'Verificada' },
  { value: 'cancelled', label: 'Cancelada' },
]

const KIND_OPTIONS: { value: MaintenanceOrderKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'corrective', label: 'Correctiva' },
  { value: 'preventive', label: 'Preventiva' },
]

const STATE_VARIANTS: Record<MaintenanceOrderState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  approved: 'secondary',
  scheduled: 'default',
  in_progress: 'default',
  done: 'default',
  rescheduled: 'outline',
  verified: 'default',
  cancelled: 'destructive',
}

export default function MaintenanceOrders() {
  const queryClient = useQueryClient()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<MaintenanceOrderSummary | undefined>()
  const [selectedOrder, setSelectedOrder] = useState<MaintenanceOrderSummary | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [stateFilter, setStateFilter] = useState<MaintenanceOrderState | 'all'>('all')
  const [kindFilter, setKindFilter] = useState<MaintenanceOrderKind | 'all'>('all')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedOrderId = searchParams.get('selected')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, stateFilter, kindFilter, pageSize])

  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-orders', stateFilter, kindFilter, searchTerm, page, pageSize],
    queryFn: () =>
      maintenanceOrderService.getAll({
        state: stateFilter === 'all' ? undefined : stateFilter,
        kind: kindFilter === 'all' ? undefined : kindFilter,
        search: searchTerm || undefined,
        page,
        pageSize,
      }),
  })

  const items = data?.items || []

  useEffect(() => {
    if (selectedOrderId && items.length > 0) {
      const order = items.find((o) => o.id === selectedOrderId)
      if (order && order.id !== selectedOrder?.id) {
        setSelectedOrder(order)
      }
    }
  }, [selectedOrderId, items, selectedOrder?.id])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => maintenanceOrderService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      toast.success('Orden eliminada')
      if (selectedOrder?.id) {
        setSelectedOrder(undefined)
        searchParams.delete('selected')
        setSearchParams(searchParams)
      }
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Error al eliminar la orden')),
  })

  const handleCreate = () => {
    setEditingOrder(undefined)
    setIsFormOpen(true)
  }

  const handleEdit = (order: MaintenanceOrderSummary) => {
    setEditingOrder(order)
    setIsFormOpen(true)
  }

  const handleRowClick = (order: MaintenanceOrderSummary) => {
    setSelectedOrder(order)
    searchParams.set('selected', order.id)
    setSearchParams(searchParams)
  }

  const handleCloseDetail = () => {
    setSelectedOrder(undefined)
    searchParams.delete('selected')
    setSearchParams(searchParams)
  }

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      <div className="flex gap-4 flex-1">
        {/* Main list */}
        <Card className={`flex flex-1 flex-col ${selectedOrder ? 'max-w-[55%]' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle>Órdenes de Mantenimiento</CardTitle>
              <CardDescription>
                Seguimiento de órdenes de mantenimiento, costos y verificación.
              </CardDescription>
            </div>
            <Button size="icon" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
            </Button>
          </CardHeader>

          <div className="px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-b">
            <Input
              placeholder="Buscar por título..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={kindFilter}
              onValueChange={(value) => setKindFilter(value as MaintenanceOrderKind | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={stateFilter}
              onValueChange={(value) => setStateFilter(value as MaintenanceOrderState | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="px-4">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead>Programado</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No hay órdenes de mantenimiento.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((order) => (
                    <TableRow
                      key={order.id}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${selectedOrder?.id === order.id ? 'bg-muted' : ''}`}
                      onClick={() => handleRowClick(order)}
                    >
                      <TableCell className="font-medium">{order.title}</TableCell>
                      <TableCell>
                        {order.createdAt ? (
                          <span className="text-xs text-muted-foreground">{format(parseApiDate(order.createdAt), 'dd MMM yyyy', { locale: es })}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{KIND_LABELS[order.kind] || order.kind}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATE_VARIANTS[order.state]}>{STATE_LABELS[order.state]}</Badge>
                      </TableCell>
                      <TableCell>{order.assetName || '—'}</TableCell>
                      <TableCell>
                        {order.scheduledStart ? (
                          <span className="text-xs">{format(parseApiDate(order.scheduledStart), 'dd MMM', { locale: es })}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {order.laborCost > 0 && (
                          <span className="text-sm font-medium">${order.laborCost.toFixed(2)}</span>
                        )}
                        {order.partsCount > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({order.partsCount} parte{order.partsCount > 1 ? 's' : ''})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(order)}
                            disabled={order.state === 'verified'}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                disabled={order.state === 'verified'}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar orden</AlertDialogTitle>
                                <AlertDialogDescription>
                                  ¿Estás seguro de eliminar esta orden? Esta acción no se puede deshacer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(order.id)}
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {!isLoading && (
            <div className="flex items-center justify-between border-t border-border pt-4 px-4 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Total: {data?.totalCount || 0} órdenes
                </span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / pág</SelectItem>
                    <SelectItem value="20">20 / pág</SelectItem>
                    <SelectItem value="50">50 / pág</SelectItem>
                    <SelectItem value="100">100 / pág</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <div className="flex items-center text-sm px-2">
                  Página {page} de {Math.max(1, Math.ceil((data?.totalCount || 0) / pageSize))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil((data?.totalCount || 0) / pageSize)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Detail panel */}
        {selectedOrder && (
          <MaintenanceOrderDetail
            order={selectedOrder}
            onClose={handleCloseDetail}
          />
        )}
      </div>

      <MaintenanceOrderFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        order={editingOrder}
        onSuccess={() => {
          setIsFormOpen(false)
          setEditingOrder(undefined)
          queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
        }}
      />
    </div>
  )
}
