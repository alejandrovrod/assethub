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
import { parseApiDate } from '@/lib/utils'
import { getApiErrorMessage } from '@/lib/handle-server-error'
import { Link } from 'react-router'
import { usePermissions } from '@/hooks/use-permissions'
import { MaintenanceOrderPartsEditor } from './maintenance-order-parts-editor'
import { MaintenanceOrderTasksWidget } from './maintenance-order-tasks-widget'
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/lib/format'

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

const ORDER_STATE_KEYS = {
  draft: 'ordersWidget.status.draft',
  approved: 'ordersWidget.status.approved',
  scheduled: 'ordersWidget.status.scheduled',
  in_progress: 'ordersWidget.status.inProgress',
  done: 'ordersWidget.status.done',
  rescheduled: 'ordersWidget.status.rescheduled',
  verified: 'ordersWidget.status.verified',
  cancelled: 'ordersWidget.status.cancelled',
} as const

interface MaintenanceOrderDetailProps {
  order: MaintenanceOrderSummary
  onClose: () => void
}

export function MaintenanceOrderDetail({ order, onClose }: MaintenanceOrderDetailProps) {
  const { t } = useTranslation(['maintenance', 'common'])
  const { formatDate } = useFormat()
  const { can } = usePermissions()
  const canUpdate = can('maintenance:update')
  const canApprove = can('maintenance:approve')
  const canSchedule = can('maintenance:schedule')
  const canStart = can('maintenance:start')
  const canComplete = can('maintenance:complete')
  const canVerify = can('maintenance:verify')
  const canReject = can('maintenance:reject')
  const canCancel = can('maintenance:cancel')
  const queryClient = useQueryClient()

  const kindLabel = (kind: string) => {
    if (kind === 'corrective') return t('ordersWidget.kind.corrective')
    if (kind === 'preventive') return t('ordersWidget.kind.preventive')
    return kind
  }

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
      toast.success(t('orders.toast.updated'))
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, t('orders.toast.updateError'))),
  })

  const unlinkPreventivePlanMutation = useMutation({
    mutationFn: () => maintenanceOrderService.update(order.id, { removePreventivePlan: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', order.id] })
      toast.success(t('orders.toast.planUnlinked'))
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, t('orders.toast.planUnlinkError'))),
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
      toast.success(t('toast.stateUpdated'))
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, t('toast.stateChangeError'))),
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
            <Badge variant="outline">{kindLabel(displayedOrder.kind)}</Badge>
            <Badge variant={STATE_VARIANTS[state]}>{t(ORDER_STATE_KEYS[state])}</Badge>
            {displayedOrder.scheduledStart && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDate(parseApiDate(displayedOrder.scheduledStart), { day: '2-digit', month: 'short' })}
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
              <Label htmlFor="mo-title">{t('common:labels.title')}</Label>
              <Input
                id="mo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isInfoEditBlocked}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mo-description">{t('common:labels.description')}</Label>
              <Textarea
                id="mo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('detail.descriptionPlaceholder')}
                rows={3}
                disabled={isInfoEditBlocked}
              />
            </div>

            <Separator />

            {/* Schedule */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" /> {t('orders.detail.schedule')}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mo-start">{t('orders.detail.start')}</Label>
                  <Input
                    id="mo-start"
                    type="datetime-local"
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                    disabled={isInfoEditBlocked}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mo-end">{t('orders.detail.end')}</Label>
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
                <Wrench className="h-4 w-4" /> {t('orders.detail.related')}
              </h4>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span className="text-muted-foreground w-32 shrink-0">{t('fields.asset')}</span>
                  <Link to={`/assets/${displayedOrder.assetId}`} className="text-sm font-medium hover:underline truncate">
                    {displayedOrder.assetName || displayedOrder.assetId}
                  </Link>
                </div>
                {displayedOrder.preventivePlanId && (
                  <div className="flex items-center gap-2 group">
                    <Clock className="h-4 w-4" />
                    <span className="text-muted-foreground w-32 shrink-0">{t('detail.related.preventivePlan')}</span>
                    <Link to={`/maintenance/preventive-plans`} className="text-sm font-medium hover:underline truncate">
                      {displayedOrder.preventivePlanName || displayedOrder.preventivePlanId}
                    </Link>
                    {state !== 'verified' && canUpdate && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" 
                        onClick={() => unlinkPreventivePlanMutation.mutate()}
                        title={t('orders.detail.unlinkPlan')}
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
                    <span className="text-muted-foreground w-32 shrink-0">{t('detail.related.incident')}</span>
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
              <h4 className="text-sm font-medium">{t('detail.changeState')}</h4>
              <div className="flex flex-wrap gap-2">
                {allowedActions.length === 0 ? (
                  <span className="text-sm text-muted-foreground">{t('detail.noTransitions')}</span>
                ) : (
                  <>
                    {allowedActions.includes('approved') && canApprove && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stateMutation.mutate('approve')}
                        disabled={stateMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" /> {t('common:actions.approve')}
                      </Button>
                    )}
                    {allowedActions.includes('scheduled') && canSchedule && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stateMutation.mutate('schedule')}
                        disabled={stateMutation.isPending}
                      >
                        <Calendar className="h-4 w-4 mr-1" /> {t('orders.detail.scheduleAction')}
                      </Button>
                    )}
                    {allowedActions.includes('in_progress') && canStart && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stateMutation.mutate('start')}
                        disabled={stateMutation.isPending}
                      >
                        <Clock className="h-4 w-4 mr-1" /> {t('common:actions.start')}
                      </Button>
                    )}
                    {allowedActions.includes('done') && canComplete && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => stateMutation.mutate('complete')}
                          disabled={stateMutation.isPending || !isReadyToComplete}
                        >
                          <Check className="h-4 w-4 mr-1" /> {t('common:actions.complete')}
                        </Button>
                        {!isReadyToComplete && (
                          <span className="text-xs text-muted-foreground">{t('orders.detail.missingTasks', { completed: completedTasks, total: totalTasks })}</span>
                        )}
                        {isReadyToComplete && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                            {t('orders.detail.readyToComplete')}
                          </Badge>
                        )}
                      </div>
                    )}
                    {allowedActions.includes('verified') && canVerify && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => stateMutation.mutate('verify')}
                          disabled={stateMutation.isPending || checkedTaskIds.size < totalTasks}
                        >
                          <Check className="h-4 w-4 mr-1" /> {t('orders.detail.verify')}
                        </Button>
                        {checkedTaskIds.size < totalTasks && canReject && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-200"
                            onClick={() => stateMutation.mutate('reject')}
                            disabled={stateMutation.isPending}
                          >
                            <X className="h-4 w-4 mr-1" /> {t('common:actions.reject')}
                          </Button>
                        )}
                      </div>
                    )}
                    {allowedActions.includes('cancelled') && canCancel && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive"
                        onClick={() => stateMutation.mutate('cancel')}
                        disabled={stateMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" /> {t('common:actions.cancel')}
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
              assetId={order.assetId}
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
            {canUpdate && (
              <div className="flex justify-end gap-2">
                <Button onClick={() => updateMutation.mutate({})} disabled={updateMutation.isPending || isInfoEditBlocked}>
                  {updateMutation.isPending ? t('form.saving') : t('orders.detail.saveInfo')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
