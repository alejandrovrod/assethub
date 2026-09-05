import { useQuery } from '@tanstack/react-query'
import { AlertCircle, FileText, Loader2, Cpu } from 'lucide-react'
import { incidentService } from '@/services/incident.service'
import { assetService } from '@/services/asset.service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface AssetIncidentsWidgetProps {
  assetId: string
  showForecast?: boolean
}

export function AssetIncidentsWidget({ assetId, showForecast = false }: AssetIncidentsWidgetProps) {
  const { data: incidents, isLoading: isLoadingIncidents } = useQuery({
    queryKey: ['incidents', 'asset', assetId],
    queryFn: () => incidentService.search(undefined, undefined, assetId, 1, 4).then(res => res.items),
  })

  const { data: forecast } = useQuery({
    queryKey: ['asset-health-forecast', assetId],
    queryFn: () => assetService.getHealthForecast(assetId),
    enabled: showForecast,
    staleTime: 1000 * 60 * 5
  })

  const activeIncidents = (incidents || []).filter(i => !i.closedAt)
  const isLoading = isLoadingIncidents

  const riskBadgeStyles: Record<string, string> = {
    Low: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    Moderate: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
    High: 'bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400',
    Critical: 'bg-destructive/15 text-destructive border-destructive/30 animate-pulse'
  }

  let topFactors: Array<{ description: string }> = []
  if (showForecast && forecast?.topFeatureContributionsJson) {
    try {
      topFactors = JSON.parse(forecast.topFeatureContributionsJson)
    } catch {
      topFactors = []
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {showForecast && forecast && (
        <div className="rounded-lg border p-3 bg-muted/20 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              <span>Salud Predictiva (XGBoost)</span>
            </div>
            <Badge variant="outline" className={`text-xs capitalize font-semibold ${riskBadgeStyles[forecast.riskLevel] || ''}`}>
              {forecast.riskLevel} ({(forecast.riskProbability * 100).toFixed(0)}%)
            </Badge>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Estimación a falla:</span>
            <span className="font-medium text-foreground">
              {forecast.predictedFailureDays != null 
                ? (forecast.predictedFailureDays >= 365 
                    ? 'Más de 1 año (Óptimo)' 
                    : `Aprox. ${forecast.predictedFailureDays} días`)
                : 'Estable'}
            </span>
          </div>

          {topFactors.length > 0 && (
            <div className="mt-1 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Factores de riesgo: </span>
              {topFactors.map(f => f.description).join(' • ')}
            </div>
          )}
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : activeIncidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm">
          <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
          <p>No hay incidencias activas.</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[240px]">
          <div className="space-y-2">
            {activeIncidents.map((incident) => (
              <Link
                key={incident.id}
                to={`/maintenance/incidents/${incident.id}`}
                className="flex items-center justify-between p-2 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" title={incident.title}>
                    {incident.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <FileText className="h-3 w-3" />
                    <span>Reportado {format(new Date(incident.createdAt), 'dd MMM', { locale: es })}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 capitalize">
                  {incident.state}
                </Badge>
              </Link>
            ))}
          </div>
        </ScrollArea>
      )}
      <Button variant="ghost" size="sm" asChild className="w-full mt-2">
        <Link to={`/maintenance/incidents?assetId=${assetId}`}>Ver todas</Link>
      </Button>
    </div>
  )
}
