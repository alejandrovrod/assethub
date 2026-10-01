import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Loader2, AlertCircle } from 'lucide-react'
import { workTaskService } from '@/services/work-task.service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'
import { WorkTaskFormSheet } from './work-task-form-sheet'

interface AssetTasksWidgetProps {
  assetId: string
}

type StateLabelKey =
  | 'tasks.states.todo'
  | 'tasks.states.inProgress'
  | 'tasks.states.done'
  | 'tasks.states.cancelled'

const STATE_LABEL_KEYS: Record<string, StateLabelKey> = {
  todo: 'tasks.states.todo',
  in_progress: 'tasks.states.inProgress',
  done: 'tasks.states.done',
  cancelled: 'tasks.states.cancelled',
}

export function AssetTasksWidget({ assetId }: AssetTasksWidgetProps) {
  const { t } = useTranslation('maintenance')
  const { can } = usePermissions()
  const canCreate = can('tasks:create')
  const [isFormOpen, setIsFormOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['work-tasks', 'asset', assetId],
    queryFn: () => workTaskService.getAll({ assetId, pageSize: 4 }),
  })

  const tasks = data?.items || []
  const openTasks = tasks.filter((t) => t.state !== 'done' && t.state !== 'cancelled')

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : openTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm">
          <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
          <p>{t('empty.assetOpenTasks')}</p>
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

      {canCreate && (
        <Button size="sm" variant="outline" onClick={() => setIsFormOpen(true)} className="w-full mt-2">
          <Plus className="h-4 w-4 mr-1" />
          {t('form.createTask')}
        </Button>
      )}

      <WorkTaskFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        prefill={{ assetId }}
      />
    </div>
  )
}
