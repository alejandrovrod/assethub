import { useQuery } from '@tanstack/react-query'
import { Activity, Clock, Wrench, Timer } from 'lucide-react'

import { analyticsService } from '@/services/analytics.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface ReliabilityMetricsCardProps {
  assetId?: string
}

function formatHours(value?: number | null): string {
  if (value == null) return '—'
  if (value < 24) return `${value.toFixed(1)} h`
  const days = Math.floor(value / 24)
  const hours = Math.round(value % 24)
  return `${days} d ${hours} h`
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string | null
  icon: React.ElementType
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function ReliabilityMetricsCard({ assetId = 'global' }: ReliabilityMetricsCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'reliability', assetId],
    queryFn: () => analyticsService.getReliability(assetId),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const hasMtbf = data?.mtbfHours != null
  const hasMttrRestore = data?.mttrRestoreHours != null
  const hasMttrRepair = data?.mttrRepairHours != null
  const noData = !hasMtbf && !hasMttrRestore && !hasMttrRepair

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Confiabilidad
        </CardTitle>
        <CardDescription>
          {data?.scope === 'asset' ? 'Métricas del activo' : 'Métricas del tenant'} · {data?.correctiveOrderCount ?? 0}{' '}
          órdenes correctivas
        </CardDescription>
      </CardHeader>
      <CardContent>
        {noData ? (
          <p className="text-sm text-muted-foreground">{data?.mtbfMessage ?? 'No hay datos suficientes.'}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricTile
              label="MTBF"
              value={formatHours(data?.mtbfHours)}
              hint={hasMtbf ? 'Tiempo medio entre fallas' : data?.mtbfMessage}
              icon={Timer}
            />
            <MetricTile
              label="MTTR Restauración"
              value={formatHours(data?.mttrRestoreHours)}
              hint={hasMttrRestore ? 'De falla a completado' : data?.mttrMessage}
              icon={Clock}
            />
            <MetricTile
              label="MTTR Reparación"
              value={formatHours(data?.mttrRepairHours)}
              hint={hasMttrRepair ? 'De inicio de trabajo a completado' : data?.mttrMessage}
              icon={Wrench}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
