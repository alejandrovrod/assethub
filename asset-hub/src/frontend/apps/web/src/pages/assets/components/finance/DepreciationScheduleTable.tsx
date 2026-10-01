import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { financeService, AssetDepreciationScheduleDto, GenerateScheduleRequest } from '@/services/finance.service'
import { usePermissions } from '@/hooks/use-permissions'
import { Loader2, RefreshCw, Plus, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useTranslation } from 'react-i18next'

interface DepreciationScheduleTableProps {
  assetId: string
  assetState: string
}

export function DepreciationScheduleTable({ assetId, assetState }: DepreciationScheduleTableProps) {
  const { t } = useTranslation(['assets', 'common'])
  const { formatDate, formatCurrency } = useFormat()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const canWrite = can('assets.finance.write')
  const canPost = can('assets.depreciation.post')

  const [page, setPage] = useState(1)
  const [onlyPending, setOnlyPending] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['depreciation-schedules', assetId, page, onlyPending],
    queryFn: () => financeService.getDepreciationSchedules(assetId, { page, pageSize: 20, onlyPending }),
    enabled: !!assetId,
    staleTime: 30000,
  })

  const isDisposed = assetState === 'Disposed' || assetState === 'Scrapped'

  const generateMutation = useMutation({
    mutationFn: (request: GenerateScheduleRequest) => financeService.generateDepreciationSchedule(assetId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['depreciation-schedules', assetId] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary', assetId] })
      toast.success(t('finance.toast.scheduleGenerated'))
    },
    onError: handleServerError,
  })

  const recalculateMutation = useMutation({
    mutationFn: (request: { effectiveFromDate: string; reason: string }) => financeService.recalculateDepreciationSchedule(assetId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['depreciation-schedules', assetId] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary', assetId] })
      toast.success(t('finance.toast.scheduleRecalculated'))
    },
    onError: handleServerError,
  })

  const postMutation = useMutation({
    mutationFn: (request: { periodsToPost: number; accountingDate?: string; notes?: string }) => financeService.postDepreciationEntries(assetId, request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['depreciation-schedules', assetId] })
      queryClient.invalidateQueries({ queryKey: ['depreciation-entries', assetId] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary', assetId] })
      toast.success(t('finance.toast.postedPeriods', { periods: result.periodsPosted, value: formatCurrency(result.newNetBookValue) }))
    },
    onError: handleServerError,
  })

  const handleGenerate = (forceRegenerate = false, manualSchedule?: GenerateScheduleRequest['manualSchedule']) => {
    generateMutation.mutate({ forceRegenerate, manualSchedule })
  }

  const handleRecalculate = () => {
    const effectiveDate = new Date().toISOString().split('T')[0]
    const reason = prompt(t('finance.dialog.recalculatePrompt'))
    if (reason) {
      recalculateMutation.mutate({ effectiveFromDate: effectiveDate, reason })
    }
  }

  const handlePost = (periods: number) => {
    const accountingDate = new Date().toISOString().split('T')[0]
    postMutation.mutate({ periodsToPost: periods, accountingDate })
  }

  const pendingCount = data?.items.filter(s => !s.isPosted).length || 0
  const postedCount = data?.items.filter(s => s.isPosted).length || 0

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('finance.schedule.title')}
          </CardTitle>
          <CardDescription>
            {t('finance.schedule.counts', { posted: postedCount, pending: pendingCount, total: data?.totalCount || 0 })}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {!isDisposed && canWrite && (
            <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculateMutation.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" /> {t('finance.actions.recalculateFuture')}
            </Button>
          )}
          {!isDisposed && canWrite && (
            <Button size="sm" onClick={() => handleGenerate(false)} disabled={generateMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" /> {t('common:actions.generate')}
            </Button>
          )}
          {!isDisposed && canPost && pendingCount > 0 && (
            <Button variant="secondary" size="sm" onClick={() => handlePost(1)} disabled={postMutation.isPending}>
              <Loader2 className="mr-2 h-4 w-4" /> {t('finance.actions.postOne')}
            </Button>
          )}
          {!isDisposed && canPost && pendingCount > 1 && (
            <Button variant="secondary" size="sm" onClick={() => handlePost(pendingCount)} disabled={postMutation.isPending}>
              <Loader2 className="mr-2 h-4 w-4" /> {t('finance.actions.postAll', { count: pendingCount })}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data?.items.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-medium text-muted-foreground">{t('finance.empty.noSchedule')}</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {t('finance.empty.noScheduleHint')}
            </p>
            {!isDisposed && canWrite && (
              <Button className="mt-4" onClick={() => handleGenerate()}>
                <Plus className="mr-2 h-4 w-4" /> {t('finance.actions.generateSchedule')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Label className="text-sm font-medium">{t('finance.schedule.filterLabel')}</Label>
              <Select
                value={onlyPending ? 'pending' : 'all'}
                onValueChange={v => setOnlyPending(v === 'pending')}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('common:labels.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common:labels.all')}</SelectItem>
                  <SelectItem value="pending">{t('finance.schedule.onlyPending')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">{t('finance.table.headers.period')}</TableHead>
                    <TableHead className="w-40">{t('finance.table.headers.startDate')}</TableHead>
                    <TableHead className="w-40">{t('finance.table.headers.endDate')}</TableHead>
                    <TableHead className="text-right">{t('finance.table.headers.projectedAmount')}</TableHead>
                    <TableHead className="text-right">{t('finance.table.headers.projectedAccumulated')}</TableHead>
                    <TableHead className="text-right">{t('finance.table.headers.projectedNetValue')}</TableHead>
                    <TableHead className="w-32">{t('common:labels.status')}</TableHead>
                    <TableHead className="w-40">{t('common:labels.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((schedule: AssetDepreciationScheduleDto) => (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-mono text-sm">{schedule.periodNumber}</TableCell>
                      <TableCell className="text-sm">{formatDate(parseApiDate(schedule.periodStartDate))}</TableCell>
                      <TableCell className="text-sm">{formatDate(parseApiDate(schedule.periodEndDate))}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(schedule.projectedDepreciationAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(schedule.projectedAccumulatedDepreciation)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(schedule.projectedNetBookValue)}</TableCell>
                      <TableCell>
                        {schedule.isPosted ? (
                          <Badge variant="default" className="gap-1">
                            <Loader2 className="h-3 w-3" /> {t('finance.schedule.postedBadge')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Calendar className="h-3 w-3" /> {t('common:status.pending')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {!schedule.isPosted && !isDisposed && canPost && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePost(1)}
                              disabled={postMutation.isPending}
                              title={t('finance.actions.postPeriodTooltip')}
                            >
                              <Loader2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {t('common:pagination.page', { page })} {t('common:pagination.of', { total: data.totalPages })} · {t('finance.pagination.records', { count: data.totalCount })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    {t('common:pagination.previous')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>
                    {t('common:pagination.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}