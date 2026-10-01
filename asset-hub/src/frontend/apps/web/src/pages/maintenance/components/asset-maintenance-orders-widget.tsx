import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle } from 'lucide-react'
import { maintenanceOrderService } from '@/services/maintenance-order.service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

const ORDER_STATE_KEYS = {
  draft: 'ordersWidget.status.draft',
  approved: 'ordersWidget.status.approved',
  scheduled: 'ordersWidget.status.scheduled',
  in_progress: 'ordersWidget.status.inProgress',
  done: 'ordersWidget.status.done',
  verified: 'ordersWidget.status.verified',
  cancelled: 'ordersWidget.status.cancelled',
  rescheduled: 'ordersWidget.status.rescheduled',
} as const

interface AssetMaintenanceOrdersWidgetProps {
  assetId: string
}

export function AssetMaintenanceOrdersWidget({ assetId }: AssetMaintenanceOrdersWidgetProps) {
  const { t } = useTranslation('maintenance')
  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-orders', 'asset', assetId],
    queryFn: () => maintenanceOrderService.getAll({ assetId, pageSize: 4 }),
  })

  const orders = data?.items || []

  const kindLabel = (kind: string) => {
    if (kind === 'corrective') return t('ordersWidget.kind.corrective')
    if (kind === 'preventive') return t('ordersWidget.kind.preventive')
    return kind
  }

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm">
          <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
          <p>{t('empty.assetOrders')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {orders.map((order) => (
              <Link
                key={order.id}
                to={`/maintenance/orders?selected=${order.id}`}
                className="flex items-center justify-between p-2 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" title={order.title}>
                    {order.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {kindLabel(order.kind)}
                    </Badge>
                    {order.scheduledStart && (
                      <span>{t('fields.scheduledShort')} {format(parseApiDate(order.scheduledStart), 'dd MMM', { locale: es })}</span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 capitalize">
                  {ORDER_STATE_KEYS[order.state] ? t(ORDER_STATE_KEYS[order.state]) : order.state}
                </Badge>
              </Link>
            ))}
          </div>
          <Button variant="ghost" size="sm" asChild className="w-full mt-2">
            <Link to={`/maintenance/orders?assetId=${assetId}`}>
              {t('ordersWidget.viewAll')}
            </Link>
          </Button>
        </>
      )}
    </div>
  )
}
