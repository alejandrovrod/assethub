import { useQuery } from '@tanstack/react-query'
import { Wallet, AlertTriangle, TrendingUp } from 'lucide-react'

import { analyticsService, type AssetTco } from '@/services/analytics.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

const COST_TYPE_LABELS: Record<string, string> = {
  labor: 'Mano de obra',
  parts: 'Repuestos',
  downtime: 'Inactividad',
  external_services: 'Servicios externos',
  penalty: 'Penalizaciones',
  other: 'Otros',
}

const STATUS_BADGES: Record<AssetTco['annualizationStatus'], { label: string; className: string }> = {
  sufficient_data: { label: 'Anualizado', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400' },
  projected: { label: 'Proyectado', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' },
  insufficient_data: { label: 'Datos insuficientes', className: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400' },
  not_applicable: { label: 'N/A', className: 'bg-muted text-muted-foreground' },
}

function formatCurrency(value?: number | null, currency = 'MXN'): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

interface TcoBreakdownChartProps {
  assetId?: string
  includeSubtree?: boolean
}

export function TcoBreakdownChart({ assetId = 'global', includeSubtree = false }: TcoBreakdownChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'tco', assetId, includeSubtree],
    queryFn: () => analyticsService.getTco(assetId, includeSubtree),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const statusBadge = STATUS_BADGES[data.annualizationStatus]
  const types = Object.entries(data.costByType).sort(([, a], [, b]) => b - a)
  const max = types.length > 0 ? Math.max(...types.map(([, v]) => v)) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Costo Total de Propiedad (TCO)
        </CardTitle>
        <CardDescription>
          {data.scope === 'asset' ? 'Costos del activo' : 'Costos del tenant'} · {data.entryCount} registros
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-bold tracking-tight">{formatCurrency(data.totalCost, data.currency)}</span>
          <Badge variant="outline" className={statusBadge.className}>
            {data.annualizationStatus === 'insufficient_data' ? (
              <AlertTriangle className="mr-1 h-3 w-3" />
            ) : data.annualizationStatus === 'projected' ? (
              <TrendingUp className="mr-1 h-3 w-3" />
            ) : null}
            {statusBadge.label}
          </Badge>
        </div>

        {data.annualizedCost != null && (
          <p className="text-sm text-muted-foreground">
            Anualizado: <span className="font-medium text-foreground">{formatCurrency(data.annualizedCost, data.currency)}</span>
            {data.ageDays > 0 && <span className="text-xs"> · {data.ageDays} días de antigüedad</span>}
          </p>
        )}
        {data.annualizationStatus === 'insufficient_data' && data.annualizationMessage && (
          <p className="text-sm text-muted-foreground">{data.annualizationMessage}</p>
        )}

        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin costos registrados.</p>
        ) : (
          <div className="space-y-2">
            {types.map(([type, amount]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-muted-foreground">
                  {COST_TYPE_LABELS[type] ?? type}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${max > 0 ? (amount / max) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-sm font-medium">
                  {formatCurrency(amount, data.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
