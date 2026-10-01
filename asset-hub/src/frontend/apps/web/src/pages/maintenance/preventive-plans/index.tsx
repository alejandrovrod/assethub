import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Play, Pause, Pencil, Trash2, RotateCw } from 'lucide-react'
import { preventivePlanService, type PreventivePlanSummary } from '@/services/preventive-plan.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PreventivePlanFormSheet } from './components/preventive-plan-form-sheet'
import { PreventivePlanExecutionLog } from './components/preventive-plan-execution-log'
import { PreventivePlanCalendar } from './components/preventive-plan-calendar'
import { PreventivePlanGeneratedItems } from './components/preventive-plan-generated-items'
import { toast } from 'sonner'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { parseApiDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useFormat } from '@/lib/format'

function cronToHuman(cron: string, t: TFunction<'maintenance'>): string {
  const parts = cron.split(' ')
  if (parts.length < 5) return cron

  const [min, , dom, mon, dow] = parts

  if (cron === '0 0 1 * *') return t('preventivePlans.cron.monthlyFirstDay')
  if (cron === '0 0 * * 1') return t('preventivePlans.cron.weeklyMonday')
  if (cron === '0 0 * * *') return t('preventivePlans.cron.daily')
  if (dom !== '*' && mon === '*') return t('preventivePlans.cron.monthlyDay', { day: dom })
  if (dow !== '*') return t('preventivePlans.cron.weekly')
  if (min.startsWith('*/')) return t('preventivePlans.cron.everyMinutes', { minutes: min.slice(2) })

  return cron
}

export default function PreventivePlansPage() {
  const { t } = useTranslation(['maintenance', 'common'])
  const { formatDate } = useFormat()
  const { can } = usePermissions()
  const canCreate = can('preventive-plans:create')
  const canUpdate = can('preventive-plans:update')
  const canDelete = can('preventive-plans:delete')
  const canExecute = can('preventive-plans:execute')
  const queryClient = useQueryClient()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PreventivePlanSummary | undefined>()
  const [selectedPlan, setSelectedPlan] = useState<PreventivePlanSummary | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const entityTypeLabel = (entityType: string) => {
    if (entityType === 'WorkTask') return t('preventivePlans.entityType.workTask')
    if (entityType === 'MaintenanceOrder') return t('preventivePlans.entityType.maintenanceOrder')
    if (entityType === 'Both') return t('preventivePlans.entityType.both')
    return entityType
  }

  useEffect(() => {
    setPage(1)
  }, [searchTerm, activeFilter, pageSize])

  const { data: plans, isLoading } = useQuery({
    queryKey: ['preventive-plans', activeFilter],
    queryFn: () =>
      preventivePlanService.getAll(
        activeFilter === 'all' ? undefined : { active: activeFilter === 'active' }
      ),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => preventivePlanService.toggleActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success(t('preventivePlans.toast.stateUpdated'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => preventivePlanService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success(t('preventivePlans.toast.deleted'))
    },
  })

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => preventivePlanService.evaluate(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success(
        t('preventivePlans.toast.evaluated', {
          tasks: result.generatedWorkTasks,
          orders: result.generatedMaintenanceOrders,
          skipped: result.skippedAssets,
        })
      )
    },
    onError: () => {
      toast.error(t('preventivePlans.toast.evaluateError'))
    },
  })

  const handleCreate = () => {
    setEditingPlan(undefined)
    setIsFormOpen(true)
  }

  const handleEdit = (plan: PreventivePlanSummary) => {
    setEditingPlan(plan)
    setIsFormOpen(true)
  }

  const handleRowClick = (plan: PreventivePlanSummary) => {
    setSelectedPlan(plan)
  }

  const filteredPlans = plans?.filter((p) =>
    searchTerm ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) : true
  )

  const totalCount = filteredPlans?.length || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pagedPlans = useMemo(() => {
    if (!filteredPlans) return []
    const start = (currentPage - 1) * pageSize
    return filteredPlans.slice(start, start + pageSize)
  }, [filteredPlans, currentPage, pageSize])

  return (
    <div className="flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Main list */}
        <Card className={`flex flex-1 flex-col overflow-hidden ${selectedPlan ? 'max-w-[55%]' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle>{t('preventivePlans.title')}</CardTitle>
              <CardDescription>
                {t('preventivePlans.description')}
              </CardDescription>
            </div>
            {canCreate && (
              <Button size="icon" onClick={handleCreate}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>

          <div className="px-4 py-3 flex items-center gap-3 border-b">
            <Input
              placeholder={t('preventivePlans.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Tabs value={activeFilter} onValueChange={setActiveFilter} className="ml-auto">
              <TabsList>
                <TabsTrigger value="all">{t('common:status.all')}</TabsTrigger>
                <TabsTrigger value="active">{t('preventivePlans.tabs.active')}</TabsTrigger>
                <TabsTrigger value="paused">{t('preventivePlans.tabs.paused')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pagedPlans.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common:labels.name')}</TableHead>
                      <TableHead>{t('preventivePlans.columns.target')}</TableHead>
                      <TableHead>{t('common:labels.type')}</TableHead>
                      <TableHead>{t('preventivePlans.columns.frequency')}</TableHead>
                      <TableHead>{t('preventivePlans.columns.nextRun')}</TableHead>
                      <TableHead>{t('common:labels.status')}</TableHead>
                      <TableHead className="text-right">{t('common:labels.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedPlans.map((plan) => (
                      <TableRow
                        key={plan.id}
                        className="cursor-pointer"
                        onClick={() => handleRowClick(plan)}
                      >
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {plan.targetType === 'Asset' ? plan.assetName : plan.assetTemplateName}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {entityTypeLabel(plan.generatedEntityType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cronToHuman(plan.cronExpression, t)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {plan.nextRunAt
                            ? formatDate(parseApiDate(plan.nextRunAt), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                            {plan.isActive ? t('preventivePlans.status.active') : t('preventivePlans.status.paused')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <div className="flex items-center justify-end gap-1">
                              {canUpdate && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEdit(plan)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('common:actions.edit')}</TooltipContent>
                                </Tooltip>
                              )}

                              {canUpdate && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => toggleMutation.mutate(plan.id)}
                                    >
                                      {plan.isActive ? (
                                        <Pause className="h-4 w-4" />
                                      ) : (
                                        <Play className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {plan.isActive ? t('common:actions.pause') : t('preventivePlans.resume')}
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {canExecute && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => evaluateMutation.mutate(plan.id)}
                                      disabled={evaluateMutation.isPending}
                                    >
                                      <RotateCw
                                        className={`h-4 w-4 ${evaluateMutation.isPending ? 'animate-spin' : ''}`}
                                      />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('preventivePlans.runNow')}</TooltipContent>
                                </Tooltip>
                              )}

                              {canDelete && (
                                <AlertDialog>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('common:actions.delete')}</TooltipContent>
                                </Tooltip>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t('preventivePlans.deleteTitle')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('preventivePlans.deleteBody', { name: plan.name })}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(plan.id)}
                                    >
                                      {t('common:actions.delete')}
                                    </AlertDialogAction>
                                   </AlertDialogFooter>
                                 </AlertDialogContent>
                               </AlertDialog>
                               )}
                             </div>
                           </TooltipProvider>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               ) : (
                 <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                   <p>{t('preventivePlans.empty')}</p>
                   {canCreate && (
                     <Button variant="link" onClick={handleCreate}>
                       {t('preventivePlans.createFirstPlan')}
                     </Button>
                   )}
                 </div>
               )}
            </ScrollArea>
            {/* Pagination Controls */}
            {!isLoading && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {t('preventivePlans.totalCount', { count: totalCount })}
                  </span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">{t('pagination.perPage', { count: 10 })}</SelectItem>
                      <SelectItem value="20">{t('pagination.perPage', { count: 20 })}</SelectItem>
                      <SelectItem value="50">{t('pagination.perPage', { count: 50 })}</SelectItem>
                      <SelectItem value="100">{t('pagination.perPage', { count: 100 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    {t('common:pagination.previous')}
                  </Button>
                  <div className="flex items-center text-sm px-2">
                    {t('common:pagination.page', { page: currentPage })} {t('common:pagination.of', { total: totalPages })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    {t('common:pagination.next')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selectedPlan && (
          <Card className="flex flex-col overflow-hidden w-[45%]">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle className="text-lg">{selectedPlan.name}</CardTitle>
                <CardDescription>{selectedPlan.description}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPlan(undefined)}>
                ✕
              </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <Tabs defaultValue="calendar" className="flex flex-col h-full">
                <TabsList className="mx-4 mt-4 w-fit">
                  <TabsTrigger value="calendar">{t('preventivePlans.tabs.calendar')}</TabsTrigger>
                  <TabsTrigger value="logs">{t('detail.tabs.timeline')}</TabsTrigger>
                  <TabsTrigger value="generated">{t('preventivePlans.tabs.generated')}</TabsTrigger>
                  <TabsTrigger value="details">{t('detail.tabs.details')}</TabsTrigger>
                </TabsList>
                <TabsContent value="calendar" className="flex-1 overflow-auto px-4 pb-4">
                  <PreventivePlanCalendar planId={selectedPlan.id} />
                </TabsContent>
                <TabsContent value="logs" className="flex-1 overflow-auto px-4 pb-4">
                  <PreventivePlanExecutionLog planId={selectedPlan.id} />
                </TabsContent>
                <TabsContent value="generated" className="flex-1 overflow-hidden px-4 pb-4">
                  <PreventivePlanGeneratedItems planId={selectedPlan.id} />
                </TabsContent>
                <TabsContent value="details" className="flex-1 overflow-auto px-4 pb-4">
                  <div className="space-y-3 pt-2">
                    <DetailRow label={t('preventivePlans.columns.target')} value={
                      selectedPlan.targetType === 'Asset'
                        ? t('preventivePlans.detail.assetTarget', { name: selectedPlan.assetName })
                        : t('preventivePlans.detail.templateTarget', { name: selectedPlan.assetTemplateName })
                    } />
                    <DetailRow label={t('preventivePlans.detail.generatedType')} value={entityTypeLabel(selectedPlan.generatedEntityType)} />
                    <DetailRow label={t('preventivePlans.columns.frequency')} value={`${cronToHuman(selectedPlan.cronExpression, t)} (${selectedPlan.cronExpression})`} />
                    <DetailRow label={t('preventivePlans.detail.dueOffsetDays')} value={String(selectedPlan.dueDateOffsetDays)} />
                    <DetailRow label={t('preventivePlans.detail.autoAssign')} value={selectedPlan.autoAssign ? t('common:labels.yes') : t('common:labels.no')} />
                    <DetailRow label={t('common:labels.status')} value={selectedPlan.isActive ? t('preventivePlans.status.active') : t('preventivePlans.status.paused')} />
                    {selectedPlan.lastRunAt && (
                      <DetailRow label={t('preventivePlans.detail.lastRun')} value={formatDate(parseApiDate(selectedPlan.lastRunAt), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} />
                    )}
                    {selectedPlan.endsAt && (
                      <DetailRow label={t('preventivePlans.detail.endsAt')} value={formatDate(parseApiDate(selectedPlan.endsAt))} />
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>

      <PreventivePlanFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        plan={editingPlan}
      />
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-border/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
