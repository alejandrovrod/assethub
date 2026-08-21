import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { assetService } from "../../../services/asset.service"
import { Loader2, ArrowLeft, User, FileText } from "lucide-react"

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
    <div className="relative space-y-6">
      {/* Vertical connector line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-border md:left-1/2 md:-translate-x-1/2" />

      {events.map((evt) => (
        <div key={evt.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
          <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
            <FileText className="h-4 w-4" />
          </div>
          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-card border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-foreground capitalize">Cambio de estado</span>
              <time className="text-xs text-muted-foreground">{format(new Date(evt.at), 'PPp', { locale: es })}</time>
            </div>

            <div className="text-sm text-muted-foreground mb-2">
              {evt.fromState && evt.toState ? (
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                    {evt.fromState}
                  </span>
                  <ArrowLeft className="h-3 w-3 rotate-180 text-muted-foreground" />
                  <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20">
                    {evt.toState}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20">
                    {evt.toState}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center text-xs text-muted-foreground gap-1 mt-2">
              <User className="h-3 w-3" />
              <span>{evt.userId === '00000000-0000-0000-0000-000000000000' ? 'Sistema / Autenticado' : evt.userId}</span>
            </div>

            {evt.notes && (
              <div className="mt-3 bg-muted/50 rounded-md p-3 text-xs border">
                {evt.notes.startsWith('{') ? (
                  <>
                    <p className="font-semibold mb-1 border-b pb-1">Datos ingresados:</p>
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {Object.entries(JSON.parse(evt.notes)).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-4">
                          <span className="text-muted-foreground truncate">{key}:</span>
                          <span className="font-medium text-right break-all">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{evt.notes}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
