import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, CheckCircle2, Clock, AlertCircle, Plus } from 'lucide-react'
import { maintenanceOrderService } from '@/services/maintenance-order.service'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/use-permissions'
import { WorkTaskFormSheet } from '../../components/work-task-form-sheet'

const TASK_STATE_ICONS: Record<string, React.ReactNode> = {
  todo: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  rework: <AlertCircle className="h-3.5 w-3.5 text-orange-500" />,
  in_progress: <AlertCircle className="h-3.5 w-3.5 text-amber-500" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  cancelled: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
}

const TASK_STATE_LABELS: Record<string, string> = {
  todo: 'Por hacer',
  rework: 'Rehacer',
  in_progress: 'En progreso',
  done: 'Completada',
  cancelled: 'Cancelada',
}

interface MaintenanceOrderTasksWidgetProps {
  orderId: string
  assetId?: string
  workflowTemplateId?: string
  propertiesJson?: string
  state?: string
  validationMode?: boolean
  checkedTaskIds?: Set<string>
  onToggleTaskCheck?: (id: string, checked: boolean) => void
}

export function MaintenanceOrderTasksWidget({ orderId, assetId, workflowTemplateId, propertiesJson, state, validationMode, checkedTaskIds, onToggleTaskCheck }: MaintenanceOrderTasksWidgetProps) {
  const { can } = usePermissions()
  const canCreateTasks = can('tasks:create')
  const queryClient = useQueryClient()
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['maintenance-order-tasks', orderId],
    queryFn: () => maintenanceOrderService.getTasks(orderId),
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span>Tareas asociadas</span>
          {!isLoading && tasks && (
            <span className="text-xs text-muted-foreground font-normal">({tasks.length})</span>
          )}
        </h4>
        {canCreateTasks && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8"
            onClick={() => setIsTaskFormOpen(true)}
            disabled={state === 'verified'}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin tareas asociadas</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-2 rounded border bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              {validationMode ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
                  checked={checkedTaskIds?.has(task.id) || false}
                  onChange={(e) => onToggleTaskCheck?.(task.id, e.target.checked)}
                />
              ) : (
                TASK_STATE_ICONS[task.state] || <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <Link
                  to={`/maintenance/tasks?selected=${task.id}`}
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {task.title}
                </Link>
                {task.assignedEmployeeName && (
                  <span className="text-xs text-muted-foreground">{task.assignedEmployeeName}</span>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {TASK_STATE_LABELS[task.state] || task.state}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <Separator />

      <WorkTaskFormSheet
        open={isTaskFormOpen}
        onOpenChange={setIsTaskFormOpen}
        prefill={{ maintenanceOrderId: orderId, assetId, workflowTemplateId, propertiesJson }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['maintenance-order-tasks', orderId] })}
      />
    </div>
  )
}
