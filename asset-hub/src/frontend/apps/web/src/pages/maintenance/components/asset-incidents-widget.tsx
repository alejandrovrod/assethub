import { useQuery } from '@tanstack/react-query'
import { AlertCircle, FileText, Loader2 } from 'lucide-react'
import { incidentService } from '@/services/incident.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface AssetIncidentsWidgetProps {
  assetId: string
}

export function AssetIncidentsWidget({ assetId }: AssetIncidentsWidgetProps) {
  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents', 'asset', assetId],
    queryFn: () => incidentService.search(undefined, undefined, assetId, 4),
  })

  const activeIncidents = (incidents || []).filter(i => !i.closedAt)

  return (
    <div className="flex flex-col gap-4">
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
