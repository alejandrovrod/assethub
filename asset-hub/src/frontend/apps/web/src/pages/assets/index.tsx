import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assetService, Asset } from '@/services/asset.service'
import { assetTemplateService, AssetTemplate } from '@/services/asset-template.service'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
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

  const handleCreate = (template: AssetTemplate) => {
    setEditingAsset(null)
    setSelectedTemplate(template)
    setSheetOpen(true)
  }

  const handleEdit = (asset: Asset) => {
    // Necesitamos el template del asset
    const template = templates?.find(t => t.id === asset.assetTemplateId)
    if (template) {
      setEditingAsset(asset)
      setSelectedTemplate(template)
      setSheetOpen(true)
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
                  <div key={asset.id} className="border rounded-md p-4 hover:shadow-md transition cursor-pointer" onClick={() => handleEdit(asset)}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">{asset.name}</h4>
                        <p className="text-sm text-muted-foreground">{asset.code}</p>
                      </div>
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
