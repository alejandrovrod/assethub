import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Loader2,
  PackageX,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react'
import {
  predictivePlannerService,
  type HorizonDays,
  type PredictiveForecastSnapshot,
  type PredictivePlannerAdvisory,
  type PredictivePurchaseSuggestion,
  type WarningSeverity,
  type WarningType,
  type ServiceSource,
} from '@/services/predictive-planner.service'
import { assetTemplateService } from '@/services/asset-template.service'
import { inventoryService } from '@/services/inventory.service'
import { useFormat } from '@/lib/format'
import { parseApiDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const ALL = 'all'

function severityClass(severity: WarningSeverity): string {
  switch (severity) {
    case 'Critical':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    case 'High':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    default:
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400'
  }
}

function severityLabelKey(severity: WarningSeverity) {
  switch (severity) {
    case 'Critical':
      return 'predictivePlanner.severity.critical' as const
    case 'High':
      return 'predictivePlanner.severity.high' as const
    default:
      return 'predictivePlanner.severity.medium' as const
  }
}

function warningTypeLabelKey(type: WarningType) {
  switch (type) {
    case 'WorkshopOverload':
      return 'predictivePlanner.warningType.WorkshopOverload' as const
    case 'HealthRisk':
      return 'predictivePlanner.warningType.HealthRisk' as const
    case 'BudgetSpike':
      return 'predictivePlanner.warningType.BudgetSpike' as const
    default:
      return 'predictivePlanner.warningType.Stockout' as const
  }
}

function serviceSourceLabelKey(source: ServiceSource) {
  switch (source) {
    case 'meterBurnRate':
      return 'predictivePlanner.source.meterBurnRate' as const
    case 'healthRisk':
      return 'predictivePlanner.source.healthRisk' as const
    default:
      return 'predictivePlanner.source.preventivePlan' as const
  }
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export default function PredictivePlannerPage() {
  const { t, i18n } = useTranslation(['maintenance', 'common'])
  const { formatDate, formatCurrency, formatNumber } = useFormat()

  const formatUtcCalendarDate = (
    value: string,
    options?: Intl.DateTimeFormatOptions
  ) =>
    formatDate(parseApiDate(value), {
      ...(options ?? { dateStyle: 'medium' }),
      timeZone: 'UTC',
    })

  const [horizon, setHorizon] = useState<HorizonDays>(30)
  const [templateId, setTemplateId] = useState<string>(ALL)
  const [warehouseId, setWarehouseId] = useState<string>(ALL)
  const [meterInterval, setMeterInterval] = useState<string>('')
  const [debouncedMeterInterval, setDebouncedMeterInterval] = useState<string>('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMeterInterval(meterInterval)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [meterInterval])

  const { data: templates } = useQuery({
    queryKey: ['asset-templates', 'predictive-planner'],
    queryFn: () => assetTemplateService.getTemplates(),
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', 'predictive-planner'],
    queryFn: () => inventoryService.getWarehouses(),
  })

  const parsedMeterInterval =
    debouncedMeterInterval.trim() === '' ? null : Number(debouncedMeterInterval)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [
      'predictive-planner',
      horizon,
      templateId,
      warehouseId,
      parsedMeterInterval,
      i18n.language,
    ],
    queryFn: () =>
      predictivePlannerService.forecast({
        horizonDays: horizon,
        assetTemplateId: templateId === ALL ? null : templateId,
        warehouseId: warehouseId === ALL ? null : warehouseId,
        meterIntervalOverride:
          parsedMeterInterval !== null && Number.isFinite(parsedMeterInterval) && parsedMeterInterval > 0
            ? parsedMeterInterval
            : null,
      }),
    staleTime: 60_000,
  })

  const forecast = data?.forecast
  const advisory = data?.advisory
  const overloadedWeeks = forecast?.weeklyWorkshopLoad.filter((w) => w.isOverloaded).length ?? 0

  const purchaseRows = useMemo(
    () => buildPurchaseRows(forecast, advisory),
    [forecast, advisory]
  )

  const handleExportCsv = () => {
    if (!forecast || purchaseRows.length === 0) return

    const headers = [
      t('predictivePlanner.csv.code'),
      t('predictivePlanner.csv.label'),
      t('predictivePlanner.csv.quantity'),
      t('predictivePlanner.csv.cost'),
      t('predictivePlanner.csv.neededBy'),
      t('predictivePlanner.csv.affectedAssets'),
      t('predictivePlanner.csv.rationale'),
    ]

    const lines = purchaseRows.map((row) =>
      [
        row.code,
        row.label,
        row.quantity,
        row.estimatedCost,
        row.neededByDate ? row.neededByDate.slice(0, 10) : '',
        row.affectedAssetCodes.join(', '),
        row.rationale,
      ]
        .map(csvCell)
        .join(',')
    )

    const csv = `\uFEFF${headers.map(csvCell).join(',')}\n${lines.join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `purchase-requisition-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('predictivePlanner.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('predictivePlanner.description')}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('predictivePlanner.filters.horizon')}
            </span>
            <Select
              value={String(horizon)}
              onValueChange={(value) => setHorizon(Number(value) as HorizonDays)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">{t('predictivePlanner.filters.days30')}</SelectItem>
                <SelectItem value="60">{t('predictivePlanner.filters.days60')}</SelectItem>
                <SelectItem value="90">{t('predictivePlanner.filters.days90')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('predictivePlanner.filters.template')}
            </span>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('predictivePlanner.filters.allTemplates')}</SelectItem>
                {(templates ?? []).map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('predictivePlanner.filters.warehouse')}
            </span>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('predictivePlanner.filters.allWarehouses')}</SelectItem>
                {(warehouses ?? []).map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('predictivePlanner.filters.meterInterval')}
            </span>
            <Input
              type="number"
              min={1}
              inputMode="decimal"
              value={meterInterval}
              onChange={(event) => setMeterInterval(event.target.value)}
              placeholder={t('predictivePlanner.filters.meterIntervalPlaceholder')}
              className="w-[190px]"
            />
          </div>

          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            {t('predictivePlanner.filters.refresh')}
          </Button>
        </CardContent>
      </Card>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('predictivePlanner.errors.title')}</AlertTitle>
          <AlertDescription>{t('predictivePlanner.errors.body')}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : forecast ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={<CalendarClock className="h-4 w-4" />}
              label={t('predictivePlanner.kpi.projectedServices')}
              value={formatNumber(forecast.projectedServices.length)}
              hint={t('predictivePlanner.kpi.projectedServicesHint', {
                days: forecast.horizonDays,
              })}
            />
            <KpiCard
              icon={<PackageX className="h-4 w-4" />}
              label={t('predictivePlanner.kpi.stockoutRisks')}
              value={formatNumber(forecast.stockoutForecasts.length)}
              hint={t('predictivePlanner.kpi.stockoutRisksHint')}
              tone={forecast.stockoutForecasts.length > 0 ? 'danger' : 'default'}
            />
            <KpiCard
              icon={<Wallet className="h-4 w-4" />}
              label={t('predictivePlanner.kpi.estimatedBudget')}
              value={formatCurrency(
                forecast.budgetProjection.estimatedTotalCost,
                forecast.currency
              )}
              hint={t('predictivePlanner.kpi.estimatedBudgetHint')}
            />
            <KpiCard
              icon={<Wrench className="h-4 w-4" />}
              label={t('predictivePlanner.kpi.overloadedWeeks')}
              value={formatNumber(overloadedWeeks)}
              hint={t('predictivePlanner.kpi.overloadedWeeksHint')}
              tone={overloadedWeeks > 0 ? 'warning' : 'default'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t('predictivePlanner.advisory.earlyWarnings')}
                </CardTitle>
                <CardDescription>{t('predictivePlanner.advisory.earlyWarningsDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {!data?.advisoryGenerated && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('predictivePlanner.advisory.unavailableTitle')}</AlertTitle>
                    <AlertDescription>{t('predictivePlanner.advisory.unavailableBody')}</AlertDescription>
                  </Alert>
                )}

                {advisory?.executiveSummary && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('predictivePlanner.advisory.executiveSummary')}
                    </p>
                    <p className="whitespace-pre-line">{advisory.executiveSummary}</p>
                  </div>
                )}

                {advisory && advisory.earlyWarnings.length > 0 ? (
                  advisory.earlyWarnings.map((warning, index) => (
                    <div
                      key={`${warning.type}-${index}`}
                      className="flex flex-col gap-2 rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={severityClass(warning.severity)}>
                          {t(severityLabelKey(warning.severity))}
                        </Badge>
                        <Badge variant="secondary">
                          {t(warningTypeLabelKey(warning.type))}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {t('predictivePlanner.advisory.inDays', { count: warning.daysAhead })}
                        </span>
                      </div>
                      <p className="text-sm">{warning.message}</p>
                    </div>
                  ))
                ) : (
                  data?.advisoryGenerated && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t('predictivePlanner.advisory.noWarnings')}
                    </p>
                  )
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4 text-primary" />
                  {t('predictivePlanner.advisory.scheduleRecommendations')}
                </CardTitle>
                <CardDescription>
                  {t('predictivePlanner.advisory.scheduleRecommendationsDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {advisory && advisory.scheduleRecommendations.length > 0 ? (
                  advisory.scheduleRecommendations.map((recommendation, index) => (
                    <div key={index} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{recommendation.recommendation}</p>
                      {recommendation.rationale && (
                        <p className="mt-1 text-xs text-muted-foreground">{recommendation.rationale}</p>
                      )}
                      {recommendation.suggestedDate && (
                        <p className="mt-2 text-xs font-medium">
                          {t('predictivePlanner.advisory.suggestedDate')}:{' '}
                          {formatUtcCalendarDate(recommendation.suggestedDate)}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('predictivePlanner.advisory.noRecommendations')}
                  </p>
                )}

                {advisory && advisory.validationWarnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      {t('predictivePlanner.advisory.validationWarnings')}
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {advisory.validationWarnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageX className="h-4 w-4 text-primary" />
                  {t('predictivePlanner.stockouts.title')}
                </CardTitle>
                <CardDescription>{t('predictivePlanner.stockouts.description')}</CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={handleExportCsv}
                disabled={purchaseRows.length === 0}
              >
                <Download className="h-4 w-4" />
                {t('predictivePlanner.stockouts.exportCsv')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {purchaseRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t('predictivePlanner.stockouts.empty')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('predictivePlanner.stockouts.code')}</TableHead>
                        <TableHead>{t('predictivePlanner.stockouts.label')}</TableHead>
                        <TableHead className="text-right">
                          {t('predictivePlanner.stockouts.daysUntilStockout')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('predictivePlanner.stockouts.stockCurrent')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('predictivePlanner.stockouts.required')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('predictivePlanner.stockouts.shortfall')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('predictivePlanner.stockouts.restockCost')}
                        </TableHead>
                        <TableHead>{t('predictivePlanner.stockouts.affectedAssets')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseRows.map((row) => (
                        <TableRow key={row.catalogItemId}>
                          <TableCell className="font-mono text-xs">{row.code}</TableCell>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right">
                            {row.daysUntilStockout === null
                              ? '—'
                              : t('predictivePlanner.daysCount', { count: row.daysUntilStockout })}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.availableQuantity, { maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.requiredQuantity, { maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-destructive">
                            {formatNumber(row.shortfallQuantity, { maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.estimatedCost, forecast.currency)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {row.affectedAssetCodes.map((code) => (
                                <Badge key={code} variant="outline">
                                  {code}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4 text-primary" />
                  {t('predictivePlanner.workshop.title')}
                </CardTitle>
                <CardDescription>{t('predictivePlanner.workshop.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {forecast.weeklyWorkshopLoad.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('predictivePlanner.workshop.empty')}
                  </p>
                ) : (
                  forecast.weeklyWorkshopLoad.map((week) => {
                    const barWidth = Math.min(100, Math.max(0, week.saturationPercent))
                    return (
                      <div key={`${week.isoYear}-${week.isoWeek}`} className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-medium">
                            {t('predictivePlanner.workshop.week', {
                              year: week.isoYear,
                              week: week.isoWeek,
                            })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatUtcCalendarDate(week.weekStart, {
                              day: '2-digit',
                              month: 'short',
                            })}{' '}
                            –{' '}
                            {formatUtcCalendarDate(week.weekEnd, {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                          <Badge variant={week.isOverloaded ? 'destructive' : 'secondary'}>
                            {formatNumber(week.saturationPercent, { maximumFractionDigits: 0 })}%
                          </Badge>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              week.isOverloaded ? 'bg-destructive' : 'bg-primary'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>
                            {t('predictivePlanner.workshop.services')}: {week.projectedServices}
                          </span>
                          <span>
                            {t('predictivePlanner.workshop.backlog')}: {week.backlogTasks}
                          </span>
                          <span>
                            {t('predictivePlanner.workshop.projectedHours')}:{' '}
                            {formatNumber(week.projectedHours, { maximumFractionDigits: 1 })} h
                          </span>
                          <span>
                            {t('predictivePlanner.workshop.availableHours')}:{' '}
                            {formatNumber(week.availableHours, { maximumFractionDigits: 1 })} h
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4 text-primary" />
                  {t('predictivePlanner.budget.title')}
                </CardTitle>
                <CardDescription>{t('predictivePlanner.budget.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                <BudgetRow
                  label={t('predictivePlanner.budget.coveredParts')}
                  value={formatCurrency(
                    forecast.budgetProjection.coveredPartsCost,
                    forecast.currency
                  )}
                />
                <BudgetRow
                  label={t('predictivePlanner.budget.urgentPurchase')}
                  value={formatCurrency(
                    forecast.budgetProjection.urgentPurchaseCost,
                    forecast.currency
                  )}
                  tone="danger"
                />
                <BudgetRow
                  label={t('predictivePlanner.budget.labor')}
                  value={formatCurrency(
                    forecast.budgetProjection.estimatedLaborCost,
                    forecast.currency
                  )}
                />
                <BudgetRow
                  label={t('predictivePlanner.budget.historicalRunRate')}
                  value={formatCurrency(
                    forecast.budgetProjection.historicalRunRateCost,
                    forecast.currency
                  )}
                  muted
                />
                <BudgetRow
                  label={t('predictivePlanner.budget.averagePerService')}
                  value={formatCurrency(
                    forecast.budgetProjection.averageCostPerService,
                    forecast.currency
                  )}
                  muted
                />
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-medium">
                    {t('predictivePlanner.budget.total')}
                  </span>
                  <span className="text-lg font-semibold">
                    {formatCurrency(
                      forecast.budgetProjection.estimatedTotalCost,
                      forecast.currency
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-primary" />
                {t('predictivePlanner.services.title')}
              </CardTitle>
              <CardDescription>{t('predictivePlanner.services.description')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {forecast.projectedServices.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t('predictivePlanner.services.empty')}
                </p>
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('predictivePlanner.services.asset')}</TableHead>
                        <TableHead>{t('predictivePlanner.services.label')}</TableHead>
                        <TableHead>{t('predictivePlanner.services.source')}</TableHead>
                        <TableHead>{t('predictivePlanner.services.dueDate')}</TableHead>
                        <TableHead className="text-right">
                          {t('predictivePlanner.services.daysUntilDue')}
                        </TableHead>
                        <TableHead>{t('predictivePlanner.services.meter')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {forecast.projectedServices.map((service) => (
                        <TableRow key={service.serviceKey}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{service.assetCode}</span>
                              <span className="text-xs text-muted-foreground">
                                {service.assetName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{service.label}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {t(serviceSourceLabelKey(service.source))}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatUtcCalendarDate(service.dueDate)}</TableCell>
                          <TableCell className="text-right">
                            {t('predictivePlanner.daysCount', { count: service.daysUntilDue })}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {service.meterKey
                              ? `${service.meterKey}: ${formatNumber(
                                  service.currentMeterValue ?? 0,
                                  { maximumFractionDigits: 1 }
                                )} → ${formatNumber(service.targetMeterValue ?? 0, {
                                  maximumFractionDigits: 1,
                                })}`
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

interface PurchaseRow {
  catalogItemId: string
  code: string
  label: string
  quantity: number
  estimatedCost: number
  neededByDate: string | null
  daysUntilStockout: number | null
  availableQuantity: number
  requiredQuantity: number
  shortfallQuantity: number
  affectedAssetCodes: string[]
  rationale: string
}

function buildPurchaseRows(
  forecast?: PredictiveForecastSnapshot,
  advisory?: PredictivePlannerAdvisory | null
): PurchaseRow[] {
  if (!forecast) return []

  const suggestionById = new Map<string, PredictivePurchaseSuggestion>(
    (advisory?.purchaseSuggestions ?? []).map((suggestion) => [
      suggestion.catalogItemId,
      suggestion,
    ])
  )
  const assetCodeById = new Map<string, string>()
  for (const service of forecast.projectedServices) {
    assetCodeById.set(service.assetId, service.assetCode)
  }

  return forecast.stockoutForecasts.map((item) => {
    const suggestion = suggestionById.get(item.catalogItemId)
    const affectedAssetCodes =
      item.affectedAssetCodes.length > 0
        ? item.affectedAssetCodes
        : (suggestion?.affectedAssetIds ?? [])
            .map((id) => assetCodeById.get(id))
            .filter((code): code is string => Boolean(code))

    return {
      catalogItemId: item.catalogItemId,
      code: item.code,
      label: item.label,
      quantity: suggestion?.quantityToBuy ?? Math.ceil(item.shortfallQuantity),
      estimatedCost: suggestion?.estimatedCost ?? item.estimatedRestockCost,
      neededByDate: suggestion?.neededByDate ?? item.stockoutDate ?? null,
      daysUntilStockout: item.daysUntilStockout ?? null,
      availableQuantity: item.availableQuantity,
      requiredQuantity: item.requiredQuantity,
      shortfallQuantity: item.shortfallQuantity,
      affectedAssetCodes,
      rationale: suggestion?.rationale ?? '',
    }
  })
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  tone?: 'default' | 'danger' | 'warning'
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground'

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function BudgetRow({
  label,
  value,
  muted = false,
  tone = 'default',
}: {
  label: string
  value: string
  muted?: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span
        className={
          tone === 'danger'
            ? 'font-medium text-destructive'
            : muted
              ? 'text-muted-foreground'
              : 'font-medium'
        }
      >
        {value}
      </span>
    </div>
  )
}
