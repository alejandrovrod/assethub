import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, User, Clock, AlertCircle, GripVertical } from 'lucide-react'
import type { WorkTaskSummary } from '@/services/work-task.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

type WorkTaskState = 'todo' | 'in_progress' | 'done' | 'cancelled'

interface Props {
  tasks: WorkTaskSummary[]
  onStateChange: (taskId: string, newState: WorkTaskState) => void
}

interface Column {
  id: WorkTaskState
  title: string
  color: string
}

const COLUMNS: Column[] = [
  { id: 'todo', title: 'Pendiente', color: 'bg-slate-500' },
  { id: 'in_progress', title: 'En progreso', color: 'bg-blue-500' },
  { id: 'done', title: 'Terminada', color: 'bg-green-500' },
  { id: 'cancelled', title: 'Cancelada', color: 'bg-red-500' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

function PriorityBadge({ label }: { label?: string }) {
  const normalized = label?.toLowerCase() ?? ''
  const className =
    PRIORITY_COLORS[normalized] ??
    (normalized.includes('alta')
      ? PRIORITY_COLORS.high
      : normalized.includes('media')
        ? PRIORITY_COLORS.medium
        : normalized.includes('baja')
          ? PRIORITY_COLORS.low
          : 'bg-muted text-muted-foreground')
  return <Badge variant="outline" className={`text-xs ${className}`}>{label ?? 'Sin prioridad'}</Badge>
}

function isOverdue(dueAt?: string): boolean {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

export function WorkTaskKanban({ tasks, onStateChange }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const grouped = useMemo(() => {
    const map: Record<WorkTaskState, WorkTaskSummary[]> = {
      todo: [],
      in_progress: [],
      done: [],
      cancelled: [],
    }
    for (const task of tasks) {
      if (map[task.state]) {
        map[task.state].push(task)
      } else {
        map.todo.push(task)
      }
    }
    return map
  }, [tasks])

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(taskId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, state: WorkTaskState) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain')
    if (taskId) {
      onStateChange(taskId, state)
      if (state === 'done') {
        const task = tasks.find(t => t.id === taskId)
        if (task?.maintenanceOrderId) {
          queryClient.invalidateQueries({ queryKey: ['maintenance-order', task.maintenanceOrderId] })
        }
        toast.success('Tarea completada')
      }
    }
    setDraggingId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
  }

  return (
    <div className="flex gap-4 h-full min-h-[400px] overflow-x-auto pb-2">
      {COLUMNS.map((column) => (
        <Card
          key={column.id}
          className="flex-1 min-w-[280px] max-w-[340px] flex flex-col bg-muted/20"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className={`h-2 w-2 rounded-full ${column.color}`} />
              {column.title}
              <Badge variant="secondary" className="ml-auto text-xs">
                {grouped[column.id].length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-3 pt-0 overflow-hidden">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-3 min-h-[60px]">
                {grouped[column.id].map((task) => (
                  <Card
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${
                      draggingId === task.id ? 'opacity-50' : ''
                    }`}
                  >
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight line-clamp-2">{task.title}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge label={task.priorityLabel} />
                      </div>

                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {task.dueAt && (
                          <div className={`flex items-center gap-1.5 ${isOverdue(task.dueAt) ? 'text-red-600 font-medium' : ''}`}>
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{format(new Date(task.dueAt), 'dd MMM yyyy', { locale: es })}</span>
                            {isOverdue(task.dueAt) && <AlertCircle className="h-3.5 w-3.5" />}
                          </div>
                        )}
                        {(task.assignedEmployeeName || task.assignedTeamName) && (
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            <span className="truncate">
                              {task.assignedEmployeeName ?? task.assignedTeamName}
                            </span>
                          </div>
                        )}
                        {!task.assignedEmployeeName && !task.assignedTeamName && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Sin asignación</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
