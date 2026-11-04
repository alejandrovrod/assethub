import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle } from 'lucide-react'
import { workTaskService } from '@/services/work-task.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

interface IncidentTasksWidgetProps {
  incidentId: string
}

type StateLabelKey =
  | 'tasks.states.todo'
  | 'tasks.states.inProgress'
  | 'tasks.states.paused'
  | 'tasks.states.done'
  | 'tasks.states.cancelled'

const STATE_LABEL_KEYS: Record<string, StateLabelKey> = {
  todo: 'tasks.states.todo',
  in_progress: 'tasks.states.inProgress',
  paused: 'tasks.states.paused',
  done: 'tasks.states.done',
  cancelled: 'tasks.states.cancelled',
}

export function IncidentTasksWidget({ incidentId }: IncidentTasksWidgetProps) {
  const { t } = useTranslation('maintenance')

  const { data, isLoading } = useQuery({
    queryKey: ['work-tasks', 'incident', incidentId],
    queryFn: () => workTaskService.getAll({ incidentId, pageSize: 50 }),
  })

  const tasks = data?.items || []
  const openTasks = tasks.filter((t) => t.state !== 'done' && t.state !== 'cancelled')

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{t('detail.sections.derivedTasks')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : openTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm">
            <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
            <p>{t('empty.incidentTasks')}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[240px]">
            <div className="space-y-2">
              {openTasks.map((task) => (
                <Link
                  key={task.id}
                  to={`/maintenance/tasks?selected=${task.id}`}
                  className="flex items-center justify-between p-2 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={task.title}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      {task.dueAt && (
                        <span>{t('detail.dueLabel')} {format(parseApiDate(task.dueAt), 'dd MMM', { locale: es })}</span>
                      )}
                      {task.assignedEmployeeName && <span>· {task.assignedEmployeeName}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {STATE_LABEL_KEYS[task.state] ? t(STATE_LABEL_KEYS[task.state]) : task.state}
                  </Badge>
                </Link>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
