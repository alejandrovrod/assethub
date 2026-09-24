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

interface FinanceProfileFormProps {
  assetId: string
  initialData?: AssetFinanceBookDto | null
  onClose: () => void
  onSuccess?: () => void
}

export function FinanceProfileForm({ assetId, initialData, onClose, onSuccess }: FinanceProfileFormProps) {
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
      toast.success(isEditing ? 'Perfil financiero actualizado' : 'Perfil financiero creado')
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

  const methods: { value: DepreciationMethod; label: string }[] = [
    { value: 'StraightLine', label: 'Línea Recta (Straight Line)' },
    { value: 'DoubleDeclining', label: 'Doble Saldo Decreciente (Double Declining Balance)' },
    { value: 'WrittenDownValue', label: 'Valor en Libros / WDV (Written Down Value)' },
    { value: 'Manual', label: 'Manual (Cuotas personalizadas)' },
  ]

  const requiresRate = formData.depreciationMethod === 'WrittenDownValue'

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{isEditing ? 'Editar Perfil Financiero' : 'Crear Perfil Financiero'}</CardTitle>
        <CardDescription>
          Configura los parámetros de depreciación para este activo. El método y frecuencia determinan cómo se calculan las cuotas periódicas.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="acquisitionCost">Costo de Adquisición *</Label>
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
              <Label htmlFor="residualValue">Valor Residual / Salvamento *</Label>
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
              <Label htmlFor="usefulLifeMonths">Vida Útil (meses) *</Label>
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
              <Label htmlFor="frequencyMonths">Frecuencia (meses) *</Label>
              <Select
                value={formData.frequencyMonths.toString()}
                onValueChange={v => handleChange('frequencyMonths', parseInt(v))}
                disabled={!canWrite}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mensual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Mensual (1)</SelectItem>
                  <SelectItem value="3">Trimestral (3)</SelectItem>
                  <SelectItem value="6">Semestral (6)</SelectItem>
                  <SelectItem value="12">Anual (12)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="depreciationMethod">Método de Depreciación *</Label>
            <Select
              value={formData.depreciationMethod}
              onValueChange={v => handleChange('depreciationMethod', v as DepreciationMethod)}
              disabled={!canWrite}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar método" />
              </SelectTrigger>
              <SelectContent>
                {methods.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {formData.depreciationMethod === 'StraightLine' && 'Cuota fija constante durante la vida útil.'}
              {formData.depreciationMethod === 'DoubleDeclining' && 'Depreciación acelerada (2x tasa línea recta) sobre valor neto actual.'}
              {formData.depreciationMethod === 'WrittenDownValue' && 'Porcentaje fijo anual sobre el valor neto remanente (requiere Tasa %).'}
              {formData.depreciationMethod === 'Manual' && 'El usuario define cada cuota manualmente al generar el cronograma.'}
            </p>
          </div>

          {requiresRate && (
            <div>
              <Label htmlFor="depreciationRatePct">Tasa de Depreciación Anual (%) *</Label>
              <Input
                id="depreciationRatePct"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={formData.depreciationRatePct || ''}
                onChange={e => handleChange('depreciationRatePct', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="Ej: 20"
                required
                disabled={!canWrite}
              />
              <p className="text-xs text-muted-foreground mt-1">Tasa anual para método Valor en Libros (WDV). Se prorratea según la frecuencia.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Fecha Inicio Depreciación *</Label>
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
              <Label htmlFor="currency">Moneda</Label>
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
              <p className="text-sm font-medium">Vista Previa (Línea Recta)</p>
              <p className="text-lg font-bold text-primary mt-1">
                Cuota mensual estimada: {((formData.acquisitionCost - formData.residualValue) / formData.usefulLifeMonths).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Base depreciable: {(formData.acquisitionCost - formData.residualValue).toLocaleString('es-MX', { minimumFractionDigits: 2 })} | 
                Total períodos: {formData.usefulLifeMonths / formData.frequencyMonths}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-destructive/80 bg-destructive/5 p-3 rounded">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>El valor residual no puede superar el costo de adquisición. La frecuencia debe dividir exactamente la vida útil (excepto método Manual).</span>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
            <X className="mr-2 h-4 w-4" /> Cancelar
          </Button>
          <Button type="submit" disabled={!canWrite || updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEditing ? 'Actualizar' : 'Crear'}
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}