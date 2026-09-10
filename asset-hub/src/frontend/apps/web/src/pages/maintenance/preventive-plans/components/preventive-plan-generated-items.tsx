import { useQuery } from '@tanstack/react-query'
import { workTaskService } from '@/services/work-task.service'
import { maintenanceOrderService, STATE_LABELS as MO_STATE_LABELS } from '@/services/maintenance-order.service'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'
import { STATE_LABELS as TASK_STATE_LABELS } from '@/services/work-task.service'

export function PreventivePlanGeneratedItems({ planId }: { planId: string }) {
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
            Tareas ({tasks?.totalCount || 0})
          </TabsTrigger>
          <TabsTrigger 
            value="orders" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            Órdenes ({orders?.totalCount || 0})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="tasks" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-3 pb-4">
              {tasks?.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No hay tareas generadas.</p>
              ) : (
                tasks?.items.map(task => (
                  <Card key={task.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start gap-2">
                        <Link to={`/maintenance/tasks?selected=${task.id}`} className="font-medium hover:underline flex-1 truncate">
                          {task.title}
                        </Link>
                        <Badge variant={task.state === 'done' ? 'default' : 'outline'} className="shrink-0 text-xs capitalize">
                          {TASK_STATE_LABELS[task.state] || task.state}
                        </Badge>
                      </div>
                      <div className="flex text-xs text-muted-foreground mt-2 items-center gap-2">
                        {task.assetName && <span>Activo: {task.assetName}</span>}
                        {task.dueAt && (
                          <span className="ml-auto">
                            Vence: {format(parseApiDate(task.dueAt), 'dd MMM', { locale: es })}
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
                <p className="text-sm text-muted-foreground text-center py-4">No hay órdenes generadas.</p>
              ) : (
                orders?.items.map(order => (
                  <Card key={order.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start gap-2">
                        <Link to={`/maintenance/orders?selected=${order.id}`} className="font-medium hover:underline flex-1 truncate">
                          {order.title}
                        </Link>
                        <Badge variant="outline" className="shrink-0 text-xs capitalize">
                          {MO_STATE_LABELS[order.state] || order.state}
                        </Badge>
                      </div>
                      <div className="flex text-xs text-muted-foreground mt-2 items-center gap-2">
                        {order.assetName && <span>Activo: {order.assetName}</span>}
                        {order.scheduledStart && (
                          <span className="ml-auto">
                            Prog: {format(parseApiDate(order.scheduledStart), 'dd MMM', { locale: es })}
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
