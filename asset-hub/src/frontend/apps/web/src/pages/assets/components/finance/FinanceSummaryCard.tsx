import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { financeService, DepreciationMethod } from '@/services/finance.service'
import { Loader2, TrendingDown, Calendar, AlertCircle, Coins } from 'lucide-react'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { useTranslation } from 'react-i18next'

const methodLabelKeys: Record<
  DepreciationMethod,
  'finance.method.straightLine' | 'finance.method.doubleDeclining' | 'finance.method.writtenDownValue' | 'finance.method.manual'
> = {
  StraightLine: 'finance.method.straightLine',
  DoubleDeclining: 'finance.method.doubleDeclining',
  WrittenDownValue: 'finance.method.writtenDownValue',
  Manual: 'finance.method.manual',
}

const disposalLabelKeys: Record<
  string,
  'finance.disposalType.scrapped' | 'finance.disposalType.sold' | 'finance.disposalType.lost' | 'finance.disposalType.donated' | 'finance.disposalType.transferred'
> = {
  Scrapped: 'finance.disposalType.scrapped',
  Sold: 'finance.disposalType.sold',
  Lost: 'finance.disposalType.lost',
  Donated: 'finance.disposalType.donated',
  Transferred: 'finance.disposalType.transferred',
}

interface FinanceSummaryCardProps {
  assetId: string
  assetState: string
}

export function FinanceSummaryCard({ assetId, assetState }: FinanceSummaryCardProps) {
  const { t } = useTranslation(['assets', 'common'])
  const { formatDate, formatCurrency } = useFormat()
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
            {t('finance.summary.title')}
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
            {t('finance.summary.noProfileTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{t('finance.summary.noProfileBody')}</p>
          <p className="mt-2 text-xs">{t('finance.summary.noProfileHintPrefix')} <strong>{t('tabs.finance')}</strong> {t('finance.summary.noProfileHintSuffix')}</p>
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
          {t('finance.summary.title')}
          {isDisposed && <Badge variant="destructive" className="text-xs">{assetState}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('finance.summary.netBookValue')}</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(summary.currentNetBookValue)}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('finance.summary.accumulatedDep')}</p>
            <p className="text-xl font-bold text-muted-foreground">{formatCurrency(summary.accumulatedDepreciation)}</p>
          </div>
        </div>

        {summary.hasFinanceBook && !isDisposed && (
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('finance.summary.nextPeriod')}</p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {summary.nextDepreciationDate ? formatDate(parseApiDate(summary.nextDepreciationDate)) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('finance.summary.remainingPeriods')}</p>
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
              <span className="text-muted-foreground">{t('finance.summary.acquisitionCost')}</span>
              <span className="font-medium">{formatCurrency(summary.acquisitionCost || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('finance.summary.residualValue')}</span>
              <span className="font-medium">{formatCurrency(summary.residualValue || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('finance.summary.usefulLife')}</span>
              <span className="font-medium">{t('finance.summary.months', { count: summary.usefulLifeMonths })}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('finance.summary.method')}</span>
              <span className="font-medium">{summary.depreciationMethod ? t(methodLabelKeys[summary.depreciationMethod]) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('finance.summary.thisPeriodDep')}</span>
              <span className="font-medium text-primary">{formatCurrency(summary.depreciationThisPeriod)}</span>
            </div>
          </div>
        )}

        {summary.isDisposed && summary.disposalDate && (
          <div className="border-t pt-4 bg-destructive/5 dark:bg-destructive/10 rounded-lg p-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {t('finance.summary.disposedPrefix')} {summary.disposalType ? t(disposalLabelKeys[summary.disposalType]) : ''}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('common:labels.date')}: {formatDate(parseApiDate(summary.disposalDate))}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}