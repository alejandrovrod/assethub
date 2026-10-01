import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { financeService, AssetValueAdjustmentDto, CreateValueAdjustmentRequest, ValueAdjustmentType, getAdjustmentTypeColor } from '@/services/finance.service'
import { usePermissions } from '@/hooks/use-permissions'
import { Loader2, Plus, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from 'react-i18next'

const adjustmentTypeLabelKeys: Record<
  ValueAdjustmentType,
  'finance.adjustmentType.revaluation' | 'finance.adjustmentType.impairment'
> = {
  Revaluation: 'finance.adjustmentType.revaluation',
  Impairment: 'finance.adjustmentType.impairment',
}

interface ValueAdjustmentsTableProps {
  assetId: string
  assetState: string
}

export function ValueAdjustmentsTable({ assetId, assetState }: ValueAdjustmentsTableProps) {
  const { t } = useTranslation(['assets', 'common'])
  const { formatDate, formatDateTime, formatCurrency } = useFormat()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const canWrite = can('assets.finance.write') || can('assets.value-adjustment:write')
  const isDisposed = assetState === 'Disposed' || assetState === 'Scrapped'

  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showDialog, setShowDialog] = useState<ValueAdjustmentType | null>(null)
  const [formData, setFormData] = useState<CreateValueAdjustmentRequest>({
    adjustmentType: 'Revaluation',
    adjustmentAmount: 0,
    reason: '',
    effectiveDate: new Date().toISOString().split('T')[0],
  })

  const { data, isLoading } = useQuery({
    queryKey: ['value-adjustments', assetId, page, pageSize],
    queryFn: () => financeService.getValueAdjustments(assetId, { page, pageSize }),
    enabled: !!assetId,
    staleTime: 30000,
  })

  const createMutation = useMutation({
    mutationFn: (request: CreateValueAdjustmentRequest) => financeService.createValueAdjustment(assetId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['value-adjustments', assetId] })
      queryClient.invalidateQueries({ queryKey: ['depreciation-schedules', assetId] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary', assetId] })
      toast.success(t('finance.toast.adjustmentRegistered'))
      setShowDialog(null)
      setFormData({ adjustmentType: 'Revaluation', adjustmentAmount: 0, reason: '', effectiveDate: new Date().toISOString().split('T')[0] })
    },
    onError: handleServerError,
  })

  const handleOpen = (type: ValueAdjustmentType) => {
    setFormData({
      adjustmentType: type,
      adjustmentAmount: 0,
      reason: '',
      effectiveDate: new Date().toISOString().split('T')[0],
    })
    setShowDialog(type)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              {t('finance.adjustments.title')}
            </CardTitle>
            <CardDescription>
              {t('finance.adjustments.description')}
            </CardDescription>
          </div>
          {!isDisposed && canWrite && (
            <div className="flex gap-2">
              <Button onClick={() => handleOpen('Revaluation')}>
                <Plus className="mr-2 h-4 w-4" /> {t('finance.actions.newRevaluation')}
              </Button>
              <Button variant="outline" onClick={() => handleOpen('Impairment')}>
                <TrendingDown className="mr-2 h-4 w-4" /> {t('finance.actions.impairment')}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="font-medium text-muted-foreground">{t('finance.empty.noAdjustments')}</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {t('finance.empty.noAdjustmentsHint')}
              </p>
              {!isDisposed && canWrite && (
                <div className="flex gap-2 justify-center mt-4">
                  <Button onClick={() => handleOpen('Revaluation')}>
                    <Plus className="mr-2 h-4 w-4" /> {t('finance.actions.revaluation')}
                  </Button>
                  <Button variant="outline" onClick={() => handleOpen('Impairment')}>
                    <TrendingDown className="mr-2 h-4 w-4" /> {t('finance.actions.impairment')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common:labels.type')}</TableHead>
                      <TableHead>{t('finance.table.headers.effectiveDate')}</TableHead>
                      <TableHead className="text-right">{t('finance.table.headers.previousValue')}</TableHead>
                      <TableHead className="text-right">{t('finance.table.headers.adjustment')}</TableHead>
                      <TableHead className="text-right">{t('finance.table.headers.newValue')}</TableHead>
                      <TableHead>{t('finance.table.headers.justification')}</TableHead>
                      <TableHead className="w-40">{t('common:status.approved')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((adj: AssetValueAdjustmentDto) => (
                      <TableRow key={adj.id}>
                        <TableCell>
                          <Badge className={getAdjustmentTypeColor(adj.adjustmentType)}>
                            {t(adjustmentTypeLabelKeys[adj.adjustmentType])}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(parseApiDate(adj.effectiveDate))}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(adj.previousNetBookValue)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {adj.adjustmentAmount >= 0 ? '+' : ''}{formatCurrency(adj.adjustmentAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(adj.newNetBookValue)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={adj.reason}>
                          {adj.reason}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(parseApiDate(adj.approvedAt))}
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

      <Dialog open={!!showDialog} onOpenChange={open => !open && setShowDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{showDialog === 'Revaluation' ? t('finance.dialog.newRevaluationTitle') : t('finance.dialog.newImpairmentTitle')}</DialogTitle>
            <DialogDescription>
              {showDialog === 'Revaluation'
                ? t('finance.dialog.revaluationDescription')
                : t('finance.dialog.impairmentDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <input type="hidden" name="adjustmentType" value={showDialog || ''} />

              <div>
                <Label htmlFor="adjustmentAmount">
                  {t('finance.form.adjustmentAmountLabel')} {showDialog === 'Impairment' ? t('finance.form.adjustmentSignNegative') : t('finance.form.adjustmentSignPositive')} *
                </Label>
                <Input
                  id="adjustmentAmount"
                  type="number"
                  step="0.01"
                  value={formData.adjustmentAmount}
                  onChange={e => setFormData(prev => ({ ...prev, adjustmentAmount: parseFloat(e.target.value) || 0 }))}
                  placeholder={showDialog === 'Impairment' ? '-5000' : '5000'}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {showDialog === 'Impairment'
                    ? t('finance.form.adjustmentAmountNegativeHint')
                    : t('finance.form.adjustmentAmountPositiveHint')}
                </p>
              </div>

              <div>
                <Label htmlFor="effectiveDate">{t('finance.form.effectiveDateLabel')}</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  value={formData.effectiveDate}
                  onChange={e => setFormData(prev => ({ ...prev, effectiveDate: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="reason">{t('finance.form.justificationLabel')}</Label>
                <Textarea
                  id="reason"
                  value={formData.reason}
                  onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={t('finance.form.adjustmentReasonPlaceholder')}
                  rows={3}
                  required
                  minLength={10}
                />
              </div>

              <div className="bg-muted/50 p-3 rounded text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                {t('finance.dialog.adjustmentsInfo')}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(null)} disabled={createMutation.isPending}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('finance.actions.registering')}
                  </>
                ) : (
                  showDialog === 'Revaluation' ? t('finance.actions.registerRevaluation') : t('finance.actions.registerImpairment')
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}