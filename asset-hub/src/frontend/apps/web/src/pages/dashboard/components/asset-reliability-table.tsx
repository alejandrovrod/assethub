import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Table2 } from 'lucide-react'

import { analyticsService } from '@/services/analytics.service'
import { assetService } from '@/services/asset.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatHours(value?: number | null): string {
  if (value == null) return '—'
  if (value < 24) return `${value.toFixed(1)} h`
  const days = Math.floor(value / 24)
  const hours = Math.round(value % 24)
  return `${days} d ${hours} h`
}

export function AssetReliabilityTable() {
  const { data: assetsPage, isLoading } = useQuery({
    queryKey: ['analytics', 'assets-for-reliability'],
    queryFn: () => assetService.getAssets(undefined, undefined, undefined, undefined, 1, 20),
    refetchInterval: 60_000,
  })

  const assets = assetsPage?.items ?? []

  // Fetch reliability per asset in a single pass; queries are cached and deduped by react-query.
  const { data: reliabilityRows } = useQuery({
    queryKey: ['analytics', 'reliability-table', assets.map((a) => a.id).join(',')],
    queryFn: async () => {
      const rows = await Promise.all(
        assets.map(async (asset) => {
          const metrics = await analyticsService.getReliability(asset.id)
          return { asset, metrics }
        }),
      )
      return rows
    },
    enabled: assets.length > 0,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="h-4 w-4" />
          Confiabilidad por activo
        </CardTitle>
        <CardDescription>MTBF y MTTR de los activos recientes</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Correctivas</TableHead>
                <TableHead className="text-right">MTBF</TableHead>
                <TableHead className="text-right">MTTR Restauración</TableHead>
                <TableHead className="text-right">MTTR Reparación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reliabilityRows ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Sin activos para mostrar.
                  </TableCell>
                </TableRow>
              )}
              {(reliabilityRows ?? []).map(({ asset, metrics }) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <Link to={`/dashboard/${asset.id}`} className="font-medium hover:underline">
                      {asset.name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{asset.code}</span>
                  </TableCell>
                  <TableCell className="text-sm">{asset.state}</TableCell>
                  <TableCell className="text-right text-sm">{metrics.correctiveOrderCount}</TableCell>
                  <TableCell className="text-right text-sm">{formatHours(metrics.mtbfHours)}</TableCell>
                  <TableCell className="text-right text-sm">{formatHours(metrics.mttrRestoreHours)}</TableCell>
                  <TableCell className="text-right text-sm">{formatHours(metrics.mttrRepairHours)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
