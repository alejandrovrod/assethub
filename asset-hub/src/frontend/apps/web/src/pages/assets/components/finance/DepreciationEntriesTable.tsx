import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { financeService, AssetDepreciationEntryDto } from '@/services/finance.service'
import { Loader2, FileText, Hash } from 'lucide-react'
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { useTranslation } from 'react-i18next'

interface DepreciationEntriesTableProps {
  assetId: string
}

export function DepreciationEntriesTable({ assetId }: DepreciationEntriesTableProps) {
  const { t } = useTranslation(['assets', 'common'])
  const { formatDate, formatDateTime, formatCurrency } = useFormat()
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['depreciation-entries', assetId, page, pageSize],
    queryFn: () => financeService.getDepreciationEntries(assetId, { page, pageSize }),
    enabled: !!assetId,
    staleTime: 30000,
  })

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('finance.entries.title')}
        </CardTitle>
        <CardDescription>
          {t('finance.entries.description')}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data?.items.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-medium text-muted-foreground">{t('finance.empty.noEntries')}</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {t('finance.empty.noEntriesHint')}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">{t('finance.table.headers.period')}</TableHead>
                    <TableHead className="w-40">{t('finance.table.headers.accountingDate')}</TableHead>
                    <TableHead className="text-right">{t('finance.table.headers.depreciatedAmount')}</TableHead>
                    <TableHead className="text-right">{t('finance.table.headers.accumulatedDep')}</TableHead>
                    <TableHead className="text-right">{t('finance.table.headers.netBookValue')}</TableHead>
                    <TableHead className="w-48">{t('finance.table.headers.idempotencyKey')}</TableHead>
                    <TableHead className="w-40">{t('finance.table.headers.postedAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((entry: AssetDepreciationEntryDto) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-sm">{entry.periodNumber}</TableCell>
                      <TableCell className="text-sm">{formatDate(parseApiDate(entry.accountingDate))}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary">{formatCurrency(entry.depreciationAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(entry.accumulatedDepreciation)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(entry.netBookValue)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate" title={entry.idempotencyKey}>
                        <Hash className="h-3 w-3 inline mr-1" /> {entry.idempotencyKey}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(parseApiDate(entry.postedAt))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {t('common:pagination.page', { page })} {t('common:pagination.of', { total: data.totalPages })} · {t('finance.pagination.records', { count: data.totalCount })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    {t('common:pagination.previous')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>
                    {t('common:pagination.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}