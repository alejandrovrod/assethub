import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { financeService, getDepreciationMethodLabel, getDisposalTypeLabel } from '@/services/finance.service'
import { Loader2, TrendingDown, Calendar, AlertCircle, Coins } from 'lucide-react'
import { formatCurrency, parseApiDate } from '@/lib/utils'

interface FinanceSummaryCardProps {
  assetId: string
  assetState: string
}

export function FinanceSummaryCard({ assetId, assetState }: FinanceSummaryCardProps) {
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['finance-summary', assetId],
    queryFn: () => financeService.getFinanceSummary(assetId),
    enabled: !!assetId,
    staleTime: 30000,
  })

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Resumen Financiero
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-8 bg-muted animate-pulse rounded w-3/4"></div>
            <div className="h-8 bg-muted animate-pulse rounded w-1/2"></div>
            <div className="h-8 bg-muted animate-pulse rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !summary) {
    return (
      <Card className="w-full border-amber-200 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4" />
            Sin Perfil Financiero
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Este activo no tiene configuración financiera.</p>
          <p className="mt-2 text-xs">Ve a la pestaña <strong>Finanzas</strong> para configurarlo.</p>
        </CardContent>
      </Card>
    )
  }

  const isDisposed = assetState === 'Disposed' || assetState === 'Scrapped'

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          Resumen Financiero
          {isDisposed && <Badge variant="destructive" className="text-xs">{assetState}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor Neto</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(summary.currentNetBookValue)}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Dep. Acumulada</p>
            <p className="text-xl font-bold text-muted-foreground">{formatCurrency(summary.accumulatedDepreciation)}</p>
          </div>
        </div>

        {summary.hasFinanceBook && !isDisposed && (
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Próxima Cuota</p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {summary.nextDepreciationDate ? parseApiDate(summary.nextDepreciationDate).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Períodos Restantes</p>
              <p className="font-medium flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                {summary.remainingPeriods}
              </p>
            </div>
          </div>
        )}

        {summary.hasFinanceBook && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Costo Adquisición</span>
              <span className="font-medium">{formatCurrency(summary.acquisitionCost || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Valor Residual</span>
              <span className="font-medium">{formatCurrency(summary.residualValue || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Vida Útil</span>
              <span className="font-medium">{summary.usefulLifeMonths} meses</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Método</span>
              <span className="font-medium">{summary.depreciationMethod ? getDepreciationMethodLabel(summary.depreciationMethod) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Dep. Este Período</span>
              <span className="font-medium text-primary">{formatCurrency(summary.depreciationThisPeriod)}</span>
            </div>
          </div>
        )}

        {summary.isDisposed && summary.disposalDate && (
          <div className="border-t pt-4 bg-destructive/5 dark:bg-destructive/10 rounded-lg p-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Activo dado de baja: {getDisposalTypeLabel(summary.disposalType as any)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Fecha: {parseApiDate(summary.disposalDate).toLocaleDateString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}