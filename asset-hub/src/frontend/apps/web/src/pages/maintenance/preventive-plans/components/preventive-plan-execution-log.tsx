import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { Loader2 } from 'lucide-react'
import { preventivePlanService } from '@/services/preventive-plan.service'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  planId: string
}

type LogStatusLabelKey =
  | 'preventivePlans.log.status.success'
  | 'preventivePlans.log.status.skipped'
  | 'preventivePlans.log.status.failed'

const STATUS_VARIANTS: Record<string, { labelKey: LogStatusLabelKey; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  success: { labelKey: 'preventivePlans.log.status.success', variant: 'default' },
  skipped: { labelKey: 'preventivePlans.log.status.skipped', variant: 'secondary' },
  failed: { labelKey: 'preventivePlans.log.status.failed', variant: 'destructive' },
}

export function PreventivePlanExecutionLog({ planId }: Props) {
  const { t } = useTranslation(['maintenance', 'common'])
  const { formatDate } = useFormat()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['preventive-plan-logs', planId, statusFilter],
    queryFn: () =>
      preventivePlanService.getLogs(planId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        pageSize: 50,
      }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('preventivePlans.log.records', { count: data?.totalCount ?? 0 })}
        </p>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common:status.all')}</SelectItem>
            <SelectItem value="success">{t('preventivePlans.log.status.success')}</SelectItem>
            <SelectItem value="skipped">{t('preventivePlans.log.status.skipped')}</SelectItem>
            <SelectItem value="failed">{t('preventivePlans.log.status.failed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data?.items && data.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common:labels.date')}</TableHead>
              <TableHead>{t('fields.asset')}</TableHead>
              <TableHead>{t('common:labels.status')}</TableHead>
              <TableHead>{t('preventivePlans.log.columns.detail')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((log) => {
              const statusInfo = STATUS_VARIANTS[log.status]
              return (
                <TableRow key={log.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDate(parseApiDate(log.executedAt), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
                  </TableCell>
                  <TableCell className="text-sm">{log.assetName ?? log.assetId.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={statusInfo?.variant ?? 'outline'}>
                      {statusInfo ? t(statusInfo.labelKey) : log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {log.status === 'success' && log.generatedEntityType
                      ? `${log.generatedEntityType}`
                      : log.message ?? '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t('preventivePlans.log.empty')}
        </p>
      )}
    </div>
  )
}
