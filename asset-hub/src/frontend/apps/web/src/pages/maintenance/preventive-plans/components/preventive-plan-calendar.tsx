import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { preventivePlanService } from '@/services/preventive-plan.service'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/lib/format'

interface Props {
  planId: string
}

export function PreventivePlanCalendar({ planId }: Props) {
  const { t } = useTranslation('maintenance')
  const { formatDate } = useFormat()
  const { data: occurrences, isLoading } = useQuery({
    queryKey: ['preventive-plan-occurrences', planId],
    queryFn: () => preventivePlanService.getNextOccurrences(planId, 12),
  })

  const occurrenceDates = useMemo(
    () => (occurrences ?? []).map((d) => new Date(d.endsWith('Z') ? d : `${d}Z`)),
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
        <p className="text-sm font-medium">{t('preventivePlans.calendar.next12')}</p>
        {occurrenceDates.length > 0 ? (
          <ul className="space-y-1.5">
            {occurrenceDates.map((date, i) => (
              <li key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
                <span>{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
                {i === 0 && <Badge variant="outline">{t('preventivePlans.calendar.next')}</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('preventivePlans.calendar.empty')}</p>
        )}
      </div>
    </div>
  )
}
