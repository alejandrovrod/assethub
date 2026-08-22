import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle } from 'lucide-react'
import { maintenanceOrderService, STATE_LABELS, KIND_LABELS } from '@/services/maintenance-order.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'


interface AssetMaintenanceOrdersWidgetProps {
  assetId: string
}

export function AssetMaintenanceOrdersWidget({ assetId }: AssetMaintenanceOrdersWidgetProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-orders', 'asset', assetId],
    queryFn: () => maintenanceOrderService.getAll({ assetId, pageSize: 4 }),
  })

  const orders = data?.items || []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Órdenes de mantenimiento</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm">
            <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
            <p>No hay órdenes para este activo.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[240px]">
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
                        {KIND_LABELS[order.kind] || order.kind}
                      </Badge>
                      {order.scheduledStart && (
                        <span>Prog. {format(new Date(order.scheduledStart), 'dd MMM', { locale: es })}</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0 capitalize">
                    {STATE_LABELS[order.state] || order.state}
                  </Badge>
                </Link>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
