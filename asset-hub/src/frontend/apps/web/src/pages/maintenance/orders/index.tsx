import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react'
import {
  maintenanceOrderService,
  type MaintenanceOrderSummary,
  type MaintenanceOrderState,
  type MaintenanceOrderKind,
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
import { parseApiDate } from '@/lib/utils'
import { getApiErrorMessage } from '@/lib/handle-server-error'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/lib/format'

const STATE_OPTIONS = [
  { value: 'all', labelKey: 'orders.states.all' },
  { value: 'draft', labelKey: 'ordersWidget.status.draft' },
  { value: 'approved', labelKey: 'ordersWidget.status.approved' },
  { value: 'scheduled', labelKey: 'ordersWidget.status.scheduled' },
  { value: 'in_progress', labelKey: 'ordersWidget.status.inProgress' },
  { value: 'done', labelKey: 'ordersWidget.status.done' },
  { value: 'rescheduled', labelKey: 'ordersWidget.status.rescheduled' },
  { value: 'verified', labelKey: 'ordersWidget.status.verified' },
  { value: 'cancelled', labelKey: 'ordersWidget.status.cancelled' },
] as const

const KIND_OPTIONS = [
  { value: 'all', labelKey: 'common:status.all' },
  { value: 'corrective', labelKey: 'ordersWidget.kind.corrective' },
  { value: 'preventive', labelKey: 'ordersWidget.kind.preventive' },
] as const

const ORDER_STATE_KEYS = {
  draft: 'ordersWidget.status.draft',
  approved: 'ordersWidget.status.approved',
  scheduled: 'ordersWidget.status.scheduled',
  in_progress: 'ordersWidget.status.inProgress',
  done: 'ordersWidget.status.done',
  rescheduled: 'ordersWidget.status.rescheduled',
  verified: 'ordersWidget.status.verified',
  cancelled: 'ordersWidget.status.cancelled',
} as const

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
  const { t } = useTranslation(['maintenance', 'common'])
  const { formatDate } = useFormat()
  const { can } = usePermissions()
  const canCreate = can('maintenance:create')
  const canUpdate = can('maintenance:update')
  const canDelete = can('maintenance:delete')
  const queryClient = useQueryClient()

  const kindLabel = (kind: string) => {
    if (kind === 'corrective') return t('ordersWidget.kind.corrective')
    if (kind === 'preventive') return t('ordersWidget.kind.preventive')
    return kind
  }

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<MaintenanceOrderSummary | undefined>()
  const [selectedOrder, setSelectedOrder] = useState<MaintenanceOrderSummary | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [stateFilter, setStateFilter] = useState<MaintenanceOrderState | 'all'>('all')
  const [kindFilter, setKindFilter] = useState<MaintenanceOrderKind | 'all'>('all')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedOrderId = searchParams.get('selected')
  const assetIdFilter = searchParams.get('assetId')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, stateFilter, kindFilter, pageSize, assetIdFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-orders', stateFilter, kindFilter, searchTerm, page, pageSize, assetIdFilter],
    queryFn: () =>
      maintenanceOrderService.getAll({
        state: stateFilter === 'all' ? undefined : stateFilter,
        kind: kindFilter === 'all' ? undefined : kindFilter,
        search: searchTerm || undefined,
        assetId: assetIdFilter || undefined,
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
      toast.success(t('orders.toast.deleted'))
      if (selectedOrder?.id) {
        setSelectedOrder(undefined)
        searchParams.delete('selected')
        setSearchParams(searchParams)
      }
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, t('orders.toast.deleteError'))),
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
              <CardTitle>{t('orders.title')}</CardTitle>
              <CardDescription>
                {t('orders.description')}
              </CardDescription>
            </div>
            {canCreate && (
              <Button size="icon" onClick={handleCreate}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>

          <div className="px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-b">
            <Input
              placeholder={t('tasks.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={kindFilter}
              onValueChange={(value) => setKindFilter(value as MaintenanceOrderKind | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('common:labels.type')} />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={stateFilter}
              onValueChange={(value) => setStateFilter(value as MaintenanceOrderState | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('common:labels.status')} />
              </SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common:labels.title')}</TableHead>

                  <TableHead>{t('common:labels.type')}</TableHead>
                  <TableHead>{t('common:labels.status')}</TableHead>
                  <TableHead>{t('fields.asset')}</TableHead>
                  <TableHead>{t('orders.columns.scheduled')}</TableHead>
                  <TableHead>{t('fields.cost')}</TableHead>
                  <TableHead>{t('orders.columns.createdAt')}</TableHead>
                  <TableHead className="text-right">{t('common:labels.actions')}</TableHead>
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
                      {t('orders.empty')}
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
                        <Badge variant="outline">{kindLabel(order.kind)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATE_VARIANTS[order.state]}>{t(ORDER_STATE_KEYS[order.state])}</Badge>
                      </TableCell>
                      <TableCell>{order.assetName || '—'}</TableCell>
                      <TableCell>
                        {order.scheduledStart ? (
                          <span className="text-xs">{formatDate(parseApiDate(order.scheduledStart))}</span>
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
                            ({t('orders.partsCount', { count: order.partsCount })})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.createdAt ? (
                          <span className="text-xs text-muted-foreground">{formatDate(parseApiDate(order.createdAt))}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {canUpdate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(order)}
                              disabled={order.state === 'verified'}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
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
                                <AlertDialogTitle>{t('orders.deleteTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('orders.deleteBody')}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(order.id)}
                                >
                                  {t('common:actions.delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                            </AlertDialog>
                          )}
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
                  {t('orders.totalCount', { count: data?.totalCount || 0 })}
                </span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">{t('pagination.perPage', { count: 10 })}</SelectItem>
                    <SelectItem value="20">{t('pagination.perPage', { count: 20 })}</SelectItem>
                    <SelectItem value="50">{t('pagination.perPage', { count: 50 })}</SelectItem>
                    <SelectItem value="100">{t('pagination.perPage', { count: 100 })}</SelectItem>
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
                  {t('common:pagination.previous')}
                </Button>
                <div className="flex items-center text-sm px-2">
                  {t('common:pagination.page', { page })} {t('common:pagination.of', { total: Math.max(1, Math.ceil((data?.totalCount || 0) / pageSize)) })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil((data?.totalCount || 0) / pageSize)}
                >
                  {t('common:pagination.next')}
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
