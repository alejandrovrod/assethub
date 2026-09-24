import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { financeService, CreateDisposalRequest, DisposalType, getDisposalTypeLabel, getDisposalTypeColor } from '@/services/finance.service'
import { usePermissions } from '@/hooks/use-permissions'
import { Loader2, Trash2, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { formatCurrency, parseApiDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

interface DisposalComponentProps {
  assetId: string
  assetState: string
  onDisposed?: () => void
}

export function DisposalComponent({ assetId, assetState, onDisposed }: DisposalComponentProps) {
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const canWrite = can('assets.disposal.write')
  const canRead = can('assets.disposal.read')

  const isDisposed = assetState === 'Disposed' || assetState === 'Scrapped'

  const { data: disposal, isLoading } = useQuery({
    queryKey: ['disposal', assetId],
    queryFn: () => financeService.getDisposal(assetId),
    enabled: !!assetId,
    staleTime: 30000,
  })

  const createMutation = useMutation({
    mutationFn: (request: CreateDisposalRequest) => financeService.createDisposal(assetId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disposal', assetId] })
      queryClient.invalidateQueries({ queryKey: ['depreciation-schedules', assetId] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary', assetId] })
      queryClient.invalidateQueries({ queryKey: ['asset', assetId] })
      toast.success('Baja registrada exitosamente. El activo pasa a estado terminal.')
      onDisposed?.()
    },
    onError: handleServerError,
  })

  const [showDialog, setShowDialog] = useState(false)
  const [formData, setFormData] = useState<CreateDisposalRequest>({
    disposalType: 'Scrapped',
    disposalDate: new Date().toISOString().split('T')[0],
    proceedsAmount: 0,
    reason: '',
    documentReference: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
    setShowDialog(false)
  }

  const handleOpen = () => {
    setFormData({
      disposalType: 'Scrapped',
      disposalDate: new Date().toISOString().split('T')[0],
      proceedsAmount: 0,
      reason: '',
      documentReference: '',
    })
    setShowDialog(true)
  }

  if (!canRead) {
    return null
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Baja / Desincorporación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (disposal) {
    const isGain = disposal.gainLossAmount > 0
    return (
      <Card className="w-full border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            Activo Dado de Baja
          </CardTitle>
          <CardDescription>
            Tipo: <Badge className={getDisposalTypeColor(disposal.disposalType)}>{getDisposalTypeLabel(disposal.disposalType)}</Badge>
            · Fecha: {parseApiDate(disposal.disposalDate).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-card rounded-lg border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor Neto al Baja</p>
              <p className="text-lg font-bold">{formatCurrency(disposal.netBookValueAtDisposal)}</p>
            </div>
            <div className="p-3 bg-card rounded-lg border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Monto Recuperado</p>
              <p className="text-lg font-bold">{formatCurrency(disposal.proceedsAmount)}</p>
            </div>
          </div>
          <div className={`p-4 rounded-lg ${isGain ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' : 'bg-destructive/10 dark:bg-destructive/20 border-destructive/20'}`}>
            <div className="flex items-center gap-2">
              {isGain ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
              <div>
                <p className="font-medium">{isGain ? 'Ganancia en la baja' : 'Pérdida en la baja'}</p>
                <p className="text-xl font-bold">{isGain ? '+' : ''}{formatCurrency(disposal.gainLossAmount)}</p>
              </div>
            </div>
          </div>
          {disposal.documentReference && (
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p className="font-medium">Referencia documental:</p>
              <p className="text-muted-foreground">{disposal.documentReference}</p>
            </div>
          )}
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <p className="font-medium">Motivo:</p>
            <p className="text-muted-foreground">{disposal.reason}</p>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>Aprobado por: {disposal.approvedBy}</span>
            <span>·</span>
            <span>{parseApiDate(disposal.approvedAt).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // No disposal yet
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Baja / Desincorporación
          </CardTitle>
          <CardDescription>
            Registra la salida definitiva del activo (chatarrización, venta, pérdida, donación). 
            El activo pasará a estado terminal y se cancelarán todas las cuotas futuras.
          </CardDescription>
        </div>
        {!isDisposed && canWrite && (
          <Button variant="destructive" onClick={handleOpen}>
            <Trash2 className="mr-2 h-4 w-4" /> Dar de Baja
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {isDisposed ? (
          <div className="text-center py-12 border-2 border-destructive/20 rounded-lg">
            <Trash2 className="h-12 w-12 text-destructive/50 mx-auto mb-4" />
            <h3 className="font-medium text-destructive">Activo en estado terminal</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Este activo está en estado <strong>{assetState}</strong>. No se puede registrar una baja adicional.
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <Trash2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-medium text-muted-foreground">Sin baja registrada</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              El activo sigue activo. Usa el botón "Dar de Baja" cuando corresponda.
            </p>
            {!isDisposed && canWrite && (
              <Button variant="destructive" className="mt-4" onClick={handleOpen}>
                <Trash2 className="mr-2 h-4 w-4" /> Registrar Baja
              </Button>
            )}
          </div>
        )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Baja Definitiva</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. El activo pasará a estado terminal y se cancelarán todas las cuotas de depreciación futuras.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="disposalType">Tipo de Baja *</Label>
                <Select value={formData.disposalType} onValueChange={v => setFormData(prev => ({ ...prev, disposalType: v as DisposalType }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Scrapped">Chatarrización</SelectItem>
                    <SelectItem value="Sold">Venta</SelectItem>
                    <SelectItem value="Lost">Pérdida / Robo</SelectItem>
                    <SelectItem value="Donated">Donación</SelectItem>
                    <SelectItem value="Transferred">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="disposalDate">Fecha de Baja *</Label>
                <Input
                  id="disposalDate"
                  type="date"
                  value={formData.disposalDate}
                  onChange={e => setFormData(prev => ({ ...prev, disposalDate: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="proceedsAmount">Monto Recuperado *</Label>
                <Input
                  id="proceedsAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.proceedsAmount}
                  onChange={e => setFormData(prev => ({ ...prev, proceedsAmount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Monto recibido por venta, seguro, etc. 0 para chatarrización/pérdida total.
                </p>
              </div>

              <div>
                <Label htmlFor="reason">Motivo / Justificación *</Label>
                <Textarea
                  id="reason"
                  value={formData.reason}
                  onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Describe el motivo de la baja (certificado de destrucción, factura de venta, denuncia policial, etc.)"
                  rows={3}
                  required
                  minLength={10}
                />
              </div>

              <div>
                <Label htmlFor="documentReference">Referencia Documental</Label>
                <Input
                  id="documentReference"
                  value={formData.documentReference}
                  onChange={e => setFormData(prev => ({ ...prev, documentReference: e.target.value }))}
                  placeholder="N° factura, acta de destrucción, póliza de seguro, etc."
                />
              </div>

              <div className="bg-destructive/5 p-3 rounded text-sm text-destructive">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Esta acción es irreversible. El activo pasará a estado terminal.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={createMutation.isPending}>
                Cancelar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="submit" variant="destructive" disabled={createMutation.isPending}>
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Confirmar Baja Definitiva
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Confirmar baja definitiva?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. El activo pasará a estado <strong>{formData.disposalType === 'Scrapped' ? 'Scrapped' : 'Disposed'}</strong> 
                      y se cancelarán todas las cuotas de depreciación futuras pendientes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSubmit} disabled={createMutation.isPending}>
                      {createMutation.isPending ? 'Procesando...' : 'Sí, dar de baja definitivamente'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </CardContent>
    </Card>
  )
}