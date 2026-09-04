import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Library, Loader2, PlusCircle } from 'lucide-react'
import { assetTemplateService } from '@/services/asset-template.service'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

export function SystemTemplateLibraryModal() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  // Fetch all templates (GetAssetTemplatesQuery now returns both tenant and system templates)
  const { data: allTemplates, isLoading } = useQuery({
    queryKey: ['asset-templates'],
    queryFn: () => assetTemplateService.getTemplates(),
  })

  // Filter only system templates
  const systemTemplates = allTemplates?.filter(t => t.isSystemTemplate) || []

  const cloneMutation = useMutation({
    mutationFn: assetTemplateService.cloneSystemTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      queryClient.invalidateQueries({ queryKey: ['entity-types'] }) // because it might clone categories too
      toast.success('Plantilla del sistema importada exitosamente')
      setOpen(false)
    },
    onError: () => {
      toast.error('Error al importar la plantilla del sistema')
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5">
          <Library className="h-4 w-4" />
          Importar de Biblioteca
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-[95vw] h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Biblioteca de Plantillas Globales</DialogTitle>
          <DialogDescription>
            Importá plantillas predefinidas listas para usar con sus esquemas, listas de control y categorías asociadas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : systemTemplates.length === 0 ? (
            <div className="text-center p-8 border rounded-lg bg-muted/20">
              <Library className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <h3 className="text-sm font-medium">No hay plantillas globales</h3>
              <p className="text-xs text-muted-foreground mt-1">Actualmente no existen plantillas predefinidas en el sistema.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {systemTemplates.map((template) => (
                <div key={template.id} className="flex flex-col border rounded-lg p-4 bg-card hover:bg-muted/10 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{template.name}</h4>
                    <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">Global</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
                    {template.description || "Sin descripción"}
                  </p>
                  <Button 
                    className="w-full gap-2" 
                    disabled={cloneMutation.isPending}
                    onClick={() => cloneMutation.mutate(template.id)}
                  >
                    {cloneMutation.isPending && cloneMutation.variables === template.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlusCircle className="h-4 w-4" />
                    )}
                    Usar esta plantilla
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
