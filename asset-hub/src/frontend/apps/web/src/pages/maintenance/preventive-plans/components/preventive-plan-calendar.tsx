import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import { preventivePlanService } from '@/services/preventive-plan.service'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'

interface Props {
  planId: string
}

export function PreventivePlanCalendar({ planId }: Props) {
  const { data: occurrences, isLoading } = useQuery({
    queryKey: ['preventive-plan-occurrences', planId],
    queryFn: () => preventivePlanService.getNextOccurrences(planId, 12),
  })

  const occurrenceDates = useMemo(
    () => (occurrences ?? []).map((d) => new Date(d)),
    [occurrences]
  )

  const modifiers = useMemo(
    () => ({ scheduled: occurrenceDates }),
    [occurrenceDates]
  )

  const modifiersClassNames = {
    scheduled: 'bg-primary/20 font-semibold text-primary rounded-md',
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Calendar
        mode="single"
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        className="rounded-md border mx-auto"
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">Próximas 12 ejecuciones</p>
        {occurrenceDates.length > 0 ? (
          <ul className="space-y-1.5">
            {occurrenceDates.map((date, i) => (
              <li key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
                <span>{format(date, "EEEE d 'de' MMMM yyyy, HH:mm", { locale: es })}</span>
                {i === 0 && <Badge variant="outline">Próxima</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay ejecuciones programadas.</p>
        )}
      </div>
    </div>
  )
}
