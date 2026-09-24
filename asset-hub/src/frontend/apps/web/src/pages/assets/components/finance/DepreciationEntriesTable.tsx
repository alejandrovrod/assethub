import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { financeService, AssetDepreciationEntryDto } from '@/services/finance.service'
import { Loader2, FileText, Hash } from 'lucide-react'
import { formatCurrency, parseApiDate } from '@/lib/utils'

interface DepreciationEntriesTableProps {
  assetId: string
}

export function DepreciationEntriesTable({ assetId }: DepreciationEntriesTableProps) {
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
          Asientos Devengados (Historial)
        </CardTitle>
        <CardDescription>
          Registro inmutable de cuotas contabilizadas. Cada asiento tiene una clave de idempotencia única.
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
            <h3 className="font-medium text-muted-foreground">Sin asientos devengados</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Las cuotas aparecerán aquí al devengarlas desde el cronograma.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Período</TableHead>
                    <TableHead className="w-40">Fecha Contable</TableHead>
                    <TableHead className="text-right">Monto Depreciado</TableHead>
                    <TableHead className="text-right">Dep. Acumulada</TableHead>
                    <TableHead className="text-right">Valor Neto</TableHead>
                    <TableHead className="w-48">Clave Idempotencia</TableHead>
                    <TableHead className="w-40">Registrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((entry: AssetDepreciationEntryDto) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-sm">{entry.periodNumber}</TableCell>
                      <TableCell className="text-sm">{parseApiDate(entry.accountingDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary">{formatCurrency(entry.depreciationAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(entry.accumulatedDepreciation)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(entry.netBookValue)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate" title={entry.idempotencyKey}>
                        <Hash className="h-3 w-3 inline mr-1" /> {entry.idempotencyKey}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {parseApiDate(entry.postedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {data.totalPages} · {data.totalCount} registros
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>
                    Siguiente
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