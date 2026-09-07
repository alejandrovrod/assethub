import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Calendar,
  Package,
  Wrench,
  FileText,
  Loader2,
  Check,
  Clock,
  Link2Off,
} from 'lucide-react'
import {
  maintenanceOrderService,
  type MaintenanceOrderSummary,
  type MaintenanceOrderState,
  type UpdateMaintenanceOrderDto,
  STATE_LABELS,
  KIND_LABELS,
  ALLOWED_TRANSITIONS,
} from '@/services/maintenance-order.service'
import { PropagatedPropertiesDisplay } from '../../components/propagated-properties-display'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'
import { MaintenanceOrderPartsEditor } from './maintenance-order-parts-editor'
import { MaintenanceOrderTasksWidget } from './maintenance-order-tasks-widget'

const STATE_VARIANTS: Record<MaintenanceOrderState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  approved: 'secondary',
  scheduled: 'default',
  in_progress: 'default',
  done: 'default',
  rescheduled: 'outline',
  verified: 'default',
  cancelled: 'destructive',
}

interface MaintenanceOrderDetailProps {
  order: MaintenanceOrderSummary
  onClose: () => void
}

export function MaintenanceOrderDetail({ order, onClose }: MaintenanceOrderDetailProps) {
  const queryClient = useQueryClient()

  const { data: detail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['maintenance-order', order.id],
    queryFn: () => maintenanceOrderService.getById(order.id),
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState(detail?.description || (order as any).description || '')
  const [propertiesJson, setPropertiesJson] = useState(detail?.propertiesJson || (order as any).propertiesJson || '{}')
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<string>>(new Set())

  const toggleTaskCheck = (taskId: string, checked: boolean) => {
    setCheckedTaskIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }

  useEffect(() => {
    if (detail) {
      setTitle(detail.title)
      setDescription(detail.description || '')
      // If the backend returned a date (UTC or not), we need to format it to YYYY-MM-DDThh:mm for datetime-local input in local time
      if (detail.scheduledStart) {
        const d = new Date(detail.scheduledStart)
        setScheduledStart(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16))
      } else {
        setScheduledStart('')
      }
      
      if (detail.scheduledEnd) {
        const d = new Date(detail.scheduledEnd)
        setScheduledEnd(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16))
      } else {
        setScheduledEnd('')
      }
    }
    if (detail?.propertiesJson) {
      setPropertiesJson(detail.propertiesJson)
    }
  }, [detail])

  const updateMutation = useMutation({
    mutationFn: (payloadOverride?: Partial<UpdateMaintenanceOrderDto>) =>
      maintenanceOrderService.update(order.id, {
        title,
        description,
        propertiesJson,
        scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : undefined,
        ...payloadOverride,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', order.id] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order-tasks', order.id] })
      toast.success('Orden actualizada')
    },
    onError: () => toast.error('Error al actualizar la orden'),
  })

  const unlinkPreventivePlanMutation = useMutation({
    mutationFn: () => maintenanceOrderService.update(order.id, { removePreventivePlan: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', order.id] })
      toast.success('Plan preventivo desvinculado')
    },
    onError: () => toast.error('Error al desvincular el plan'),
  })

  const stateMutation = useMutation({
    mutationFn: async (action: 'approve' | 'schedule' | 'verify' | 'start' | 'complete' | 'cancel' | 'reject') => {
      switch (action) {
        case 'approve': return await maintenanceOrderService.approve(order.id)
        case 'verify': return await maintenanceOrderService.verify(order.id)
        case 'reject': return await maintenanceOrderService.reject(order.id, Array.from(checkedTaskIds))
        case 'start': return await maintenanceOrderService.start(order.id)
        case 'complete': return await maintenanceOrderService.complete(order.id)
        case 'cancel': return await maintenanceOrderService.cancel(order.id)
        case 'schedule': return await maintenanceOrderService.schedule(order.id, {
          scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : order.scheduledStart,
          scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : order.scheduledEnd,
        })
        default: throw new Error(`Acción no soportada: ${action}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', order.id] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order-tasks', order.id] })
      setCheckedTaskIds(new Set())
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('Error al cambiar el estado'),
  })

  const displayedOrder = detail || order
  const state = displayedOrder.state
  const allowedActions = ALLOWED_TRANSITIONS[state] || []
  const isInfoEditBlocked = state === 'verified' || state === 'cancelled'

  // Compute task progress
  const tasks = detail?.tasks || []
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.state === 'done' || t.state === 'cancelled').length
  const isReadyToComplete = totalTasks === 0 || completedTasks === totalTasks

  return (
    <Card className="flex flex-col overflow-hidden w-[45%] h-full">
      <CardHeader className="flex flex-row items-start justify-between border-b pb-4">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg truncate" title={displayedOrder.title}>
            {displayedOrder.title}
          </CardTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline">{KIND_LABELS[displayedOrder.kind] || displayedOrder.kind}</Badge>
            <Badge variant={STATE_VARIANTS[state]}>{STATE_LABELS[state]}</Badge>
            {displayedOrder.scheduledStart && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(new Date(displayedOrder.scheduledStart), 'dd MMM HH:mm', { locale: es })}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-4 space-y-5">
        {isLoadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Title and description */}
            <div className="space-y-2">
              <Label htmlFor="mo-title">Título</Label>
              <Input
                id="mo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isInfoEditBlocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mo-description">Descripción</Label>
              <Textarea
                id="mo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sin descripción"
                rows={3}
                disabled={isInfoEditBlocked}
              />
            </div>

            <Separator />

            {/* Schedule */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Programación
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mo-start">Inicio</Label>
                  <Input
                    id="mo-start"
                    type="datetime-local"
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                    disabled={isInfoEditBlocked}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mo-end">Fin</Label>
                  <Input
                    id="mo-end"
                    type="datetime-local"
                    value={scheduledEnd}
                    onChange={(e) => setScheduledEnd(e.target.value)}
                    disabled={isInfoEditBlocked}
                  />
                </div>
              </div>
            </div>

            {(order.assetId || detail?.workflowTemplateId || order.incidentId) && (
              <PropagatedPropertiesDisplay
                assetId={order.assetId}
                workflowTemplateId={detail?.workflowTemplateId}
                incidentId={order.incidentId}
                propertiesJson={propertiesJson}
                disabled={isInfoEditBlocked}
                inlineEdit={true}
                onChange={setPropertiesJson}
              />
            )}

            <Separator />

            {/* Related */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Relacionados
              </h4>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span className="text-muted-foreground w-32 shrink-0">Activo</span>
                  <Link to={`/assets/${displayedOrder.assetId}`} className="text-sm font-medium hover:underline truncate">
                    {displayedOrder.assetName || displayedOrder.assetId}
                  </Link>
                </div>
                {displayedOrder.preventivePlanId && (
                  <div className="flex items-center gap-2 group">
                    <Clock className="h-4 w-4" />
                    <span className="text-muted-foreground w-32 shrink-0">Plan preventivo</span>
                    <Link to={`/maintenance/preventive-plans`} className="text-sm font-medium hover:underline truncate">
                      {displayedOrder.preventivePlanName || displayedOrder.preventivePlanId}
                    </Link>
                    {state !== 'verified' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" 
                        onClick={() => unlinkPreventivePlanMutation.mutate()}
                        title="Desvincular plan preventivo"
                        disabled={unlinkPreventivePlanMutation.isPending}
                      >
                        {unlinkPreventivePlanMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3 text-muted-foreground hover:text-destructive" />}
                      </Button>
                    )}
                  </div>
                )}
                {displayedOrder.incidentId && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-muted-foreground w-32 shrink-0">Incidencia</span>
                    <Link to={`/maintenance/incidents/${displayedOrder.incidentId}`} className="text-sm font-medium hover:underline truncate">
                      {displayedOrder.incidentTitle || displayedOrder.incidentId}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* State transitions */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Cambiar estado</h4>
              <div className="flex flex-wrap gap-2">
                {allowedActions.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No hay transiciones disponibles</span>
                ) : (
                  <>
                    {allowedActions.includes('approved') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stateMutation.mutate('approve')}
                        disabled={stateMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" /> Aprobar
                      </Button>
                    )}
                    {allowedActions.includes('scheduled') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stateMutation.mutate('schedule')}
                        disabled={stateMutation.isPending}
                      >
                        <Calendar className="h-4 w-4 mr-1" /> Programar
                      </Button>
                    )}
                    {allowedActions.includes('in_progress') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stateMutation.mutate('start')}
                        disabled={stateMutation.isPending}
                      >
                        <Clock className="h-4 w-4 mr-1" /> Iniciar
                      </Button>
                    )}
                    {allowedActions.includes('done') && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => stateMutation.mutate('complete')}
                          disabled={stateMutation.isPending || !isReadyToComplete}
                        >
                          <Check className="h-4 w-4 mr-1" /> Completar
                        </Button>
                        {!isReadyToComplete && (
                          <span className="text-xs text-muted-foreground">Faltan tareas ({completedTasks}/{totalTasks})</span>
                        )}
                        {isReadyToComplete && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                            Listo para completar
                          </Badge>
                        )}
                      </div>
                    )}
                    {allowedActions.includes('verified') && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => stateMutation.mutate('verify')}
                          disabled={stateMutation.isPending || checkedTaskIds.size < totalTasks}
                        >
                          <Check className="h-4 w-4 mr-1" /> Verificar
                        </Button>
                        {checkedTaskIds.size < totalTasks && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-200"
                            onClick={() => stateMutation.mutate('reject')}
                            disabled={stateMutation.isPending}
                          >
                            <X className="h-4 w-4 mr-1" /> Rechazar
                          </Button>
                        )}
                      </div>
                    )}
                    {allowedActions.includes('cancelled') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive"
                        onClick={() => stateMutation.mutate('cancel')}
                        disabled={stateMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Parts */}
            <MaintenanceOrderPartsEditor
              orderId={order.id}
              state={state}
            />

            {/* Child tasks */}
            <MaintenanceOrderTasksWidget
              orderId={order.id}
              assetId={order.assetId}
              workflowTemplateId={order.workflowTemplateId}
              propertiesJson={propertiesJson}
              state={state}
              validationMode={state === 'done'}
              checkedTaskIds={checkedTaskIds}
              onToggleTaskCheck={toggleTaskCheck}
            />

            {/* Save */}
            <div className="flex justify-end gap-2">
              <Button onClick={() => updateMutation.mutate({})} disabled={updateMutation.isPending || isInfoEditBlocked}>
                {updateMutation.isPending ? 'Guardando...' : 'Guardar Información'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
