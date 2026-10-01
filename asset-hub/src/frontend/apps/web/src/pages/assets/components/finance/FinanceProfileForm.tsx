import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { financeService, UpsertFinanceBookRequest, AssetFinanceBookDto, DepreciationMethod } from '@/services/finance.service'
import { usePermissions } from '@/hooks/use-permissions'
import { Loader2, Save, X, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { useFormat } from '@/lib/format'
import { useTranslation } from 'react-i18next'

interface FinanceProfileFormProps {
  assetId: string
  initialData?: AssetFinanceBookDto | null
  onClose: () => void
  onSuccess?: () => void
}

export function FinanceProfileForm({ assetId, initialData, onClose, onSuccess }: FinanceProfileFormProps) {
  const { t } = useTranslation(['assets', 'common'])
  const { formatNumber } = useFormat()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const canWrite = can('assets.finance.write')

  const [formData, setFormData] = useState<UpsertFinanceBookRequest>({
    acquisitionCost: 0,
    residualValue: 0,
    usefulLifeMonths: 60,
    depreciationMethod: 'StraightLine',
    frequencyMonths: 1,
    startDate: new Date().toISOString().split('T')[0],
    currency: 'MXN',
    depreciationRatePct: undefined,
  })

  const isEditing = !!initialData

  useEffect(() => {
    if (initialData) {
      setFormData({
        acquisitionCost: initialData.acquisitionCost,
        residualValue: initialData.residualValue,
        usefulLifeMonths: initialData.usefulLifeMonths,
        depreciationMethod: initialData.depreciationMethod,
        frequencyMonths: initialData.frequencyMonths,
        startDate: initialData.startDate.split('T')[0],
        currency: initialData.currency,
        depreciationRatePct: initialData.depreciationRatePct,
      })
    } else {
      setFormData({
        acquisitionCost: 0,
        residualValue: 0,
        usefulLifeMonths: 60,
        depreciationMethod: 'StraightLine',
        frequencyMonths: 1,
        startDate: new Date().toISOString().split('T')[0],
        currency: 'MXN',
        depreciationRatePct: undefined,
      })
    }
  }, [initialData])

  const updateMutation = useMutation({
    mutationFn: (data: UpsertFinanceBookRequest) => financeService.upsertFinanceProfile(assetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-profile', assetId] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary', assetId] })
      toast.success(isEditing ? t('finance.toast.financeProfileUpdated') : t('finance.toast.financeProfileCreated'))
      onClose()
      onSuccess?.()
    },
    onError: (error) => handleServerError(error),
  })

  const handleChange = (field: keyof UpsertFinanceBookRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  const methods: { value: DepreciationMethod; labelKey: 'finance.methodOption.straightLine' | 'finance.methodOption.doubleDeclining' | 'finance.methodOption.writtenDownValue' | 'finance.methodOption.manual' }[] = [
    { value: 'StraightLine', labelKey: 'finance.methodOption.straightLine' },
    { value: 'DoubleDeclining', labelKey: 'finance.methodOption.doubleDeclining' },
    { value: 'WrittenDownValue', labelKey: 'finance.methodOption.writtenDownValue' },
    { value: 'Manual', labelKey: 'finance.methodOption.manual' },
  ]

  const requiresRate = formData.depreciationMethod === 'WrittenDownValue'

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{isEditing ? t('finance.form.editProfileTitle') : t('finance.form.createProfileTitle')}</CardTitle>
        <CardDescription>
          {t('finance.form.profileDescription')}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="acquisitionCost">{t('finance.form.acquisitionCostLabel')}</Label>
              <Input
                id="acquisitionCost"
                type="number"
                step="0.01"
                min="0"
                value={formData.acquisitionCost}
                onChange={e => handleChange('acquisitionCost', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                required
                disabled={!canWrite}
              />
            </div>
            <div>
              <Label htmlFor="residualValue">{t('finance.form.residualValueLabel')}</Label>
              <Input
                id="residualValue"
                type="number"
                step="0.01"
                min="0"
                value={formData.residualValue}
                onChange={e => handleChange('residualValue', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                required
                disabled={!canWrite}
              />
            </div>
            <div>
              <Label htmlFor="usefulLifeMonths">{t('finance.form.usefulLifeLabel')}</Label>
              <Input
                id="usefulLifeMonths"
                type="number"
                min="1"
                value={formData.usefulLifeMonths}
                onChange={e => handleChange('usefulLifeMonths', parseInt(e.target.value) || 1)}
                placeholder="60"
                required
                disabled={!canWrite}
              />
            </div>
            <div>
              <Label htmlFor="frequencyMonths">{t('finance.form.frequencyLabel')}</Label>
              <Select
                value={formData.frequencyMonths.toString()}
                onValueChange={v => handleChange('frequencyMonths', parseInt(v))}
                disabled={!canWrite}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('finance.form.monthlyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t('finance.frequency.monthly')}</SelectItem>
                  <SelectItem value="3">{t('finance.frequency.quarterly')}</SelectItem>
                  <SelectItem value="6">{t('finance.frequency.semiannual')}</SelectItem>
                  <SelectItem value="12">{t('finance.frequency.annual')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="depreciationMethod">{t('finance.form.depreciationMethodLabel')}</Label>
            <Select
              value={formData.depreciationMethod}
              onValueChange={v => handleChange('depreciationMethod', v as DepreciationMethod)}
              disabled={!canWrite}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('finance.form.selectMethod')} />
              </SelectTrigger>
              <SelectContent>
                {methods.map(m => (
                  <SelectItem key={m.value} value={m.value}>{t(m.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {formData.depreciationMethod === 'StraightLine' && t('finance.methodHelp.straightLine')}
              {formData.depreciationMethod === 'DoubleDeclining' && t('finance.methodHelp.doubleDeclining')}
              {formData.depreciationMethod === 'WrittenDownValue' && t('finance.methodHelp.writtenDownValue')}
              {formData.depreciationMethod === 'Manual' && t('finance.methodHelp.manual')}
            </p>
          </div>

          {requiresRate && (
            <div>
              <Label htmlFor="depreciationRatePct">{t('finance.form.rateLabel')}</Label>
              <Input
                id="depreciationRatePct"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={formData.depreciationRatePct || ''}
                onChange={e => handleChange('depreciationRatePct', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder={t('finance.form.ratePlaceholder')}
                required
                disabled={!canWrite}
              />
              <p className="text-xs text-muted-foreground mt-1">{t('finance.form.rateHint')}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">{t('finance.form.startDateLabel')}</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={e => handleChange('startDate', e.target.value)}
                required
                disabled={!canWrite}
              />
            </div>
            <div>
              <Label htmlFor="currency">{t('finance.form.currencyLabel')}</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={e => handleChange('currency', e.target.value.toUpperCase())}
                maxLength={3}
                disabled={!canWrite}
              />
            </div>
          </div>

          {formData.acquisitionCost > 0 && formData.residualValue > 0 && formData.usefulLifeMonths > 0 && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm font-medium">{t('finance.form.previewTitle')}</p>
              <p className="text-lg font-bold text-primary mt-1">
                {t('finance.form.estimatedMonthlyAmount', { value: formatNumber((formData.acquisitionCost - formData.residualValue) / formData.usefulLifeMonths, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('finance.form.depreciableBase', { value: formatNumber(formData.acquisitionCost - formData.residualValue, { minimumFractionDigits: 2 }) })} | 
                {t('finance.form.totalPeriods', { value: formData.usefulLifeMonths / formData.frequencyMonths })}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-destructive/80 bg-destructive/5 p-3 rounded">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('finance.form.profileWarning')}</span>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
            <X className="mr-2 h-4 w-4" /> {t('common:actions.cancel')}
          </Button>
          <Button type="submit" disabled={!canWrite || updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('form.saving')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEditing ? t('common:actions.update') : t('common:actions.create')}
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}