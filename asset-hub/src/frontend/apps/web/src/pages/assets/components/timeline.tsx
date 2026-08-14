import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { assetService } from "../../../services/asset.service"
import { Card, CardContent } from "../../../components/ui/card"
import { Loader2, ArrowRight, User, Clock } from "lucide-react"

export function AssetTimeline({ assetId }: { assetId: string }) {
  const { data: events, isLoading, error } = useQuery({
    queryKey: ['asset-events', assetId],
    queryFn: () => assetService.getAssetEvents(assetId)
  })

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center p-4 text-red-500">
        Error al cargar la bitácora
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No hay eventos registrados en la bitácora para este activo.
      </div>
    )
  }

  return (
    <div className="relative border-l border-muted-foreground/30 ml-4 pl-6 py-4 space-y-6">
      {events.map((evt) => (
        <div key={evt.id} className="relative">
          <div className="absolute -left-[35px] top-1 h-4 w-4 rounded-full bg-primary ring-4 ring-background" />
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{evt.fromState || 'Creado'}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{evt.toState}</span>
                </div>
                <div className="flex items-center text-xs text-muted-foreground gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(evt.at), "dd MMM yyyy, HH:mm", { locale: es })}
                </div>
              </div>
              
              <div className="flex items-center text-xs text-muted-foreground gap-1 mb-3">
                <User className="h-3 w-3" />
                <span>{evt.userId === '00000000-0000-0000-0000-000000000000' ? 'Sistema / Autenticado' : evt.userId}</span>
              </div>

              {evt.notes && (
                <div className="bg-muted/30 p-3 rounded-md text-sm border">
                  {evt.notes.startsWith('{') ? (
                    <div className="space-y-1">
                      {Object.entries(JSON.parse(evt.notes)).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium">{key}:</span> {String(value)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{evt.notes}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
