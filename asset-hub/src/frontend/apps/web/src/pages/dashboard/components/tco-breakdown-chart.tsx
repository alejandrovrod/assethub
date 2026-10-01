import { useQuery } from '@tanstack/react-query'
import { Wallet, AlertTriangle, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { analyticsService, type AssetTco } from '@/services/analytics.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useFormat } from '@/lib/format'

const COST_TYPE_KEYS: Record<
  string,
  | 'charts.costTypes.labor'
  | 'charts.costTypes.parts'
  | 'charts.costTypes.downtime'
  | 'charts.costTypes.externalServices'
  | 'charts.costTypes.penalty'
  | 'charts.costTypes.other'
> = {
  labor: 'charts.costTypes.labor',
  parts: 'charts.costTypes.parts',
  downtime: 'charts.costTypes.downtime',
  external_services: 'charts.costTypes.externalServices',
  penalty: 'charts.costTypes.penalty',
  other: 'charts.costTypes.other',
}

const STATUS_BADGES: Record<
  AssetTco['annualizationStatus'],
  {
    label:
      | 'charts.statusLabels.sufficientData'
      | 'charts.statusLabels.projected'
      | 'charts.statusLabels.insufficientData'
      | 'charts.statusLabels.notApplicable'
    className: string
  }
> = {
  sufficient_data: { label: 'charts.statusLabels.sufficientData', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400' },
  projected: { label: 'charts.statusLabels.projected', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' },
  insufficient_data: { label: 'charts.statusLabels.insufficientData', className: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400' },
  not_applicable: { label: 'charts.statusLabels.notApplicable', className: 'bg-muted text-muted-foreground' },
}

interface TcoBreakdownChartProps {
  assetId?: string
  includeSubtree?: boolean
}

export function TcoBreakdownChart({ assetId = 'global', includeSubtree = false }: TcoBreakdownChartProps) {
  const { t } = useTranslation('dashboard')
  const { formatNumber } = useFormat()
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'tco', assetId, includeSubtree],
    queryFn: () => analyticsService.getTco(assetId, includeSubtree),
    refetchInterval: 60_000,
  })

  const formatCurrency = (value?: number | null, currency = 'MXN'): string => {
    if (value == null) return '—'
    return formatNumber(value, { style: 'currency', currency, maximumFractionDigits: 0 })
  }

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
          {t('charts.title')}
        </CardTitle>
        <CardDescription>
          {data.scope === 'asset' ? t('charts.scopeAsset') : t('charts.scopeTenant')} ·{' '}
          {t('charts.entryCount', { count: data.entryCount })}
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
            {t(statusBadge.label)}
          </Badge>
        </div>

        {data.annualizedCost != null && (
          <p className="text-sm text-muted-foreground">
            {t('charts.annualized')}: <span className="font-medium text-foreground">{formatCurrency(data.annualizedCost, data.currency)}</span>
            {data.ageDays > 0 && <span className="text-xs"> · {t('charts.ageDays', { count: data.ageDays })}</span>}
          </p>
        )}
        {data.annualizationStatus === 'insufficient_data' && data.annualizationMessage && (
          <p className="text-sm text-muted-foreground">{data.annualizationMessage}</p>
        )}

        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('charts.empty')}</p>
        ) : (
          <div className="space-y-2">
            {types.map(([type, amount]) => {
              const labelKey = COST_TYPE_KEYS[type]
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-muted-foreground">
                    {labelKey ? t(labelKey) : type}
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
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
