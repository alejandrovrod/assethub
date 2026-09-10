import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { History, Loader2, ArrowRight, User } from 'lucide-react'
import { workTaskService, type WorkTaskHistoryEntry } from '@/services/work-task.service'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { parseApiDate } from '@/lib/utils'

interface Props {
  taskId: string
}

const STATE_LABELS: Record<string, string> = {
  todo: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Terminada',
  cancelled: 'Cancelada',
}

function StateBadge({ state }: { state?: string }) {
  if (!state) return <span className="text-muted-foreground italic">Inicial</span>
  const label = STATE_LABELS[state] ?? state
  const variant =
    state === 'done'
      ? 'default'
      : state === 'in_progress'
        ? 'secondary'
        : state === 'cancelled'
          ? 'destructive'
          : 'outline'
  return <Badge variant={variant as any}>{label}</Badge>
}

export function WorkTaskHistory({ taskId }: Props) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['work-task-history', taskId],
    queryFn: () => workTaskService.getHistory(taskId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <History className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No hay cambios de estado registrados.</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="relative pl-6 space-y-6 py-2">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
        {history.map((entry: WorkTaskHistoryEntry) => (
          <div key={entry.id} className="relative">
            <div className="absolute -left-[17px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StateBadge state={entry.fromState} />
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <StateBadge state={entry.toState} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{format(parseApiDate(entry.changedAt), 'dd MMM yyyy HH:mm', { locale: es })}</span>
                {entry.changedByName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {entry.changedByName}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
