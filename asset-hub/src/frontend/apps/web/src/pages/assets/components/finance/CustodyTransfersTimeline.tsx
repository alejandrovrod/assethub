import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { financeService, AssetCustodyTransferDto, CreateCustodyTransferRequest, CustodyTransferType } from '@/services/finance.service'
import { usePermissions } from '@/hooks/use-permissions'
import { Loader2, User, Plus, Download, Calendar, FileText, Signature } from 'lucide-react'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from 'react-i18next'

const custodyTypeLabelKeys: Record<
  CustodyTransferType,
  'finance.custodyType.assignment' | 'finance.custodyType.transfer' | 'finance.custodyType.return' | 'finance.custodyType.relocation'
> = {
  Assignment: 'finance.custodyType.assignment',
  Transfer: 'finance.custodyType.transfer',
  Return: 'finance.custodyType.return',
  Relocation: 'finance.custodyType.relocation',
}

interface CustodyTransfersTimelineProps {
  assetId: string
  assetState: string
}

export function CustodyTransfersTimeline({ assetId, assetState }: CustodyTransfersTimelineProps) {
  const { t } = useTranslation(['assets', 'common'])
  const { formatDate, formatDateTime } = useFormat()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const canWrite = can('assets.custody.write')
  const canRead = can('assets.custody.read')

  const isDisposed = assetState === 'Disposed' || assetState === 'Scrapped'

  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['custody-transfers', assetId, page, pageSize],
    queryFn: () => financeService.getCustodyTransfers(assetId, { page, pageSize }),
    enabled: !!assetId,
    staleTime: 30000,
  })

  const createMutation = useMutation({
    mutationFn: (request: CreateCustodyTransferRequest) => financeService.createCustodyTransfer(assetId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custody-transfers', assetId] })
      toast.success(t('finance.toast.custodyTransferRegistered'))
    },
    onError: handleServerError,
  })

  const [showDialog, setShowDialog] = useState(false)
  const [formData, setFormData] = useState<CreateCustodyTransferRequest>({
    toEmployeeId: '',
    fromDepartmentId: undefined,
    toDepartmentId: undefined,
    transferDate: new Date().toISOString().split('T')[0],
    transferType: 'Assignment',
    reason: '',
    documentUrl: '',
    signedByFrom: undefined,
    signedByTo: undefined,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
    setShowDialog(false)
  }

  const handleOpen = () => {
    setFormData({
      toEmployeeId: '',
      fromDepartmentId: undefined,
      toDepartmentId: undefined,
      transferDate: new Date().toISOString().split('T')[0],
      transferType: 'Assignment',
      reason: '',
      documentUrl: '',
      signedByFrom: undefined,
      signedByTo: undefined,
    })
    setShowDialog(true)
  }

  if (!canRead) {
    return null
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (data?.items.length === 0) {
      return (
        <div className="text-center py-12">
          <User className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="font-medium text-muted-foreground">{t('finance.empty.noCustodyTransfers')}</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {t('finance.empty.noCustodyTransfersHint')}
          </p>
          {!isDisposed && canWrite && (
            <Button className="mt-4" onClick={handleOpen}>
              <Plus className="mr-2 h-4 w-4" /> {t('finance.actions.registerInitialAssignment')}
            </Button>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {data?.items.map((transfer: AssetCustodyTransferDto) => (
          <div key={transfer.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{transfer.toEmployeeName}</span>
                    <Badge variant="outline" className="text-xs">
                      {t(custodyTypeLabelKeys[transfer.transferType])}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {transfer.fromEmployeeName 
                      ? t('finance.custody.from', { name: transfer.fromEmployeeName }) 
                      : t('finance.custody.initialAssignment')}
                    {transfer.fromDepartmentName && transfer.toDepartmentName && (
                      <> · {t('finance.custody.deptPath', { from: transfer.fromDepartmentName, to: transfer.toDepartmentName })}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(parseApiDate(transfer.transferDate))}
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {formatDateTime(parseApiDate(transfer.createdAt))}
                </div>
                {transfer.documentUrl && (
                  <a href={transfer.documentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1">
                    <Download className="h-3 w-3" /> {t('finance.custody.viewDocument')}
                  </a>
                )}
                {(transfer.signedByFrom || transfer.signedByTo) && (
                  <div className="flex items-center gap-1 text-emerald-600">
                    <Signature className="h-3 w-3" /> {t('finance.custody.signed')}
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground border-t pt-3">
              <strong>{t('finance.custody.reasonLabel')}</strong> {transfer.reason}
            </p>
          </div>
        ))}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
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
      </div>
    )
  }

  return (
    <>
      <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('finance.custody.title')}
          </CardTitle>
          <CardDescription>
            {t('finance.custody.description')}
          </CardDescription>
        </div>
        {!isDisposed && canWrite && (
          <Button onClick={handleOpen}>
            <Plus className="mr-2 h-4 w-4" /> {t('finance.actions.newTransfer')}
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>

    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('finance.dialog.registerCustodyTransferTitle')}</DialogTitle>
          <DialogDescription>
            {formData.transferType === 'Assignment' 
              ? t('finance.dialog.custodyDescAssignment')
              : t('finance.dialog.custodyDescOther')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="transferType">{t('finance.form.transferTypeLabel')}</Label>
              <Select value={formData.transferType} onValueChange={v => setFormData(prev => ({ ...prev, transferType: v as CustodyTransferType }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('finance.form.selectType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Assignment">{t('finance.custodyType.assignment')}</SelectItem>
                  <SelectItem value="Transfer">{t('finance.dialog.custodyOptionTransfer')}</SelectItem>
                  <SelectItem value="Return">{t('finance.dialog.custodyOptionReturn')}</SelectItem>
                  <SelectItem value="Relocation">{t('finance.dialog.custodyOptionRelocation')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="toEmployeeId">{t('finance.form.targetCustodianLabel')}</Label>
              <Input
                id="toEmployeeId"
                placeholder={t('finance.form.employeeIdPlaceholder')}
                value={formData.toEmployeeId}
                onChange={e => setFormData(prev => ({ ...prev, toEmployeeId: e.target.value }))}
                required
              />
              <p className="text-xs text-muted-foreground">{t('finance.form.employeeIdHint')}</p>
            </div>

            <div>
              <Label htmlFor="transferDate">{t('finance.form.transferDateLabel')}</Label>
              <Input
                id="transferDate"
                type="date"
                value={formData.transferDate}
                onChange={e => setFormData(prev => ({ ...prev, transferDate: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label htmlFor="reason">{t('finance.form.reasonLabel')}</Label>
              <Textarea
                id="reason"
                value={formData.reason}
                onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder={t('finance.form.transferReasonPlaceholder')}
                rows={3}
                required
                minLength={5}
              />
            </div>

            <div>
              <Label htmlFor="documentUrl">{t('finance.form.documentUrlLabel')}</Label>
              <Input
                id="documentUrl"
                value={formData.documentUrl}
                onChange={e => setFormData(prev => ({ ...prev, documentUrl: e.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="bg-muted/50 p-3 rounded text-sm text-muted-foreground">
              <span className="font-medium">{t('finance.form.signaturesLabel')}</span> {t('finance.form.signaturesHint')}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={createMutation.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('finance.actions.registering')}
                </>
              ) : (
                t('finance.actions.registerTransfer')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}