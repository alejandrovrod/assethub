import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import { preventivePlanService } from '@/services/preventive-plan.service'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  planId: string
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  success: { label: 'Éxito', variant: 'default' },
  skipped: { label: 'Omitido', variant: 'secondary' },
  failed: { label: 'Error', variant: 'destructive' },
}

export function PreventivePlanExecutionLog({ planId }: Props) {
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
          {data?.totalCount ?? 0} registros
        </p>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">Éxito</SelectItem>
            <SelectItem value="skipped">Omitido</SelectItem>
            <SelectItem value="failed">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data?.items && data.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((log) => {
              const statusInfo = STATUS_LABELS[log.status] ?? { label: log.status, variant: 'outline' as const }
              return (
                <TableRow key={log.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(log.executedAt.endsWith('Z') ? log.executedAt : `${log.executedAt}Z`), 'dd MMM yyyy HH:mm', { locale: es })}
                  </TableCell>
                  <TableCell className="text-sm">{log.assetName ?? log.assetId.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
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
          No hay registros de ejecución todavía.
        </p>
      )}
    </div>
  )
}
