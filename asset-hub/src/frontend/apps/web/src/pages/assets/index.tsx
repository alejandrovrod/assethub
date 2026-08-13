import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetService, Asset } from '@/services/asset.service'
import { assetTemplateService, AssetTemplate } from '@/services/asset-template.service'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AssetFormSheet } from './components/asset-form-sheet'

export default function AssetsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(null)

  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetService.getAssets()
  })

  const { data: templates } = useQuery({
    queryKey: ['asset-templates'],
    queryFn: () => assetTemplateService.getTemplates()
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetService.deleteAsset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Activo eliminado correctamente')
    },
    onError: (error) => {
      console.error("Error deleting asset:", error)
      toast.error('Error al eliminar activo')
    }
  })

  const handleCreate = (template: AssetTemplate) => {
    setEditingAsset(null)
    setSelectedTemplate(template)
    setSheetOpen(true)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    console.log("Intentando eliminar activo ID:", id)
    if (window.confirm('¿Estás seguro de eliminar este activo? Esta acción no se puede deshacer.')) {
      console.log("Confirmado. Ejecutando mutación...")
      deleteMutation.mutate(id)
    } else {
      console.log("Cancelado por el usuario.")
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Activos (Instancias)</h2>
          <p className="text-muted-foreground">
            Gestione sus activos físicos reales basados en plantillas.
          </p>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nuevo Activo
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Seleccione Plantilla</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {templates?.filter(t => t.isActive).map(template => (
              <DropdownMenuItem key={template.id} onClick={() => handleCreate(template)}>
                {template.name}
              </DropdownMenuItem>
            ))}
            {!templates?.filter(t => t.isActive).length && (
              <DropdownMenuItem disabled>No hay plantillas activas</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1 rounded-lg border shadow-sm p-4">
        {isLoadingAssets ? (
          <div className="text-center w-full py-10">Cargando activos...</div>
        ) : (
          <div className="w-full">
            {assets?.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No hay activos creados.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {assets?.map((asset) => (
                  <div 
                    key={asset.id} 
                    className="border rounded-lg p-4 bg-card hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors shadow-sm" 
                    onClick={() => navigate(`/assets/${asset.id}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">{asset.name}</h4>
                        <p className="text-sm text-muted-foreground">{asset.code}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => handleDelete(e, asset.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedTemplate && (
        <AssetFormSheet 
          open={sheetOpen} 
          onOpenChange={setSheetOpen}
          asset={editingAsset}
          template={selectedTemplate}
        />
      )}
    </div>
  )
}
