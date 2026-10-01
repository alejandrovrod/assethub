import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { workTaskService } from '@/services/work-task.service'
import { maintenanceOrderService } from '@/services/maintenance-order.service'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Link } from 'react-router'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'

const TASK_STATE_KEYS = {
  todo: 'tasks.states.todo',
  rework: 'tasks.states.rework',
  in_progress: 'tasks.states.inProgress',
  done: 'tasks.states.done',
  cancelled: 'tasks.states.cancelled',
} as const

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

export function PreventivePlanGeneratedItems({ planId }: { planId: string }) {
  const { t } = useTranslation(['maintenance', 'common'])
  const { formatDate } = useFormat()

  const { data: tasks } = useQuery({
    queryKey: ['work-tasks', { preventivePlanId: planId }],
    queryFn: () => workTaskService.getAll({ preventivePlanId: planId }),
  })

  const { data: orders } = useQuery({
    queryKey: ['maintenance-orders', { preventivePlanId: planId }],
    queryFn: () => maintenanceOrderService.getAll({ preventivePlanId: planId }),
  })

  return (
    <div className="flex flex-col h-full pt-2">
      <Tabs defaultValue="tasks" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-4">
          <TabsTrigger
            value="tasks"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            {t('preventivePlans.generated.tasksTab', { count: tasks?.totalCount || 0 })}
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            {t('preventivePlans.generated.ordersTab', { count: orders?.totalCount || 0 })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-3 pb-4">
              {tasks?.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('preventivePlans.generated.noTasks')}</p>
              ) : (
                tasks?.items.map(task => (
                  <Card key={task.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start gap-2">
                        <Link to={`/maintenance/tasks?selected=${task.id}`} className="font-medium hover:underline flex-1 truncate">
                          {task.title}
                        </Link>
                        <Badge variant={task.state === 'done' ? 'default' : 'outline'} className="shrink-0 text-xs capitalize">
                          {TASK_STATE_KEYS[task.state as keyof typeof TASK_STATE_KEYS]
                            ? t(TASK_STATE_KEYS[task.state as keyof typeof TASK_STATE_KEYS])
                            : task.state}
                        </Badge>
                      </div>
                      <div className="flex text-xs text-muted-foreground mt-2 items-center gap-2">
                        {task.assetName && <span>{t('preventivePlans.generated.assetLabel', { name: task.assetName })}</span>}
                        {task.dueAt && (
                          <span className="ml-auto">
                            {t('preventivePlans.generated.dueLabel', {
                              date: formatDate(parseApiDate(task.dueAt), { day: '2-digit', month: 'short' }),
                            })}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="orders" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-3 pb-4">
              {orders?.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('preventivePlans.generated.noOrders')}</p>
              ) : (
                orders?.items.map(order => (
                  <Card key={order.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start gap-2">
                        <Link to={`/maintenance/orders?selected=${order.id}`} className="font-medium hover:underline flex-1 truncate">
                          {order.title}
                        </Link>
                        <Badge variant="outline" className="shrink-0 text-xs capitalize">
                          {ORDER_STATE_KEYS[order.state as keyof typeof ORDER_STATE_KEYS]
                            ? t(ORDER_STATE_KEYS[order.state as keyof typeof ORDER_STATE_KEYS])
                            : order.state}
                        </Badge>
                      </div>
                      <div className="flex text-xs text-muted-foreground mt-2 items-center gap-2">
                        {order.assetName && <span>{t('preventivePlans.generated.assetLabel', { name: order.assetName })}</span>}
                        {order.scheduledStart && (
                          <span className="ml-auto">
                            {t('preventivePlans.generated.scheduledLabel', {
                              date: formatDate(parseApiDate(order.scheduledStart), { day: '2-digit', month: 'short' }),
                            })}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
