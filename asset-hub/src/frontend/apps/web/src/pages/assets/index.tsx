import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetService, Asset } from '@/services/asset.service'
import { assetTemplateService, AssetTemplate } from '@/services/asset-template.service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { AssetFormSheet } from './components/asset-form-sheet'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function AssetsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [catalogFilters, setCatalogFilters] = useState<Record<string, string>>({})

  const isSearching = searchTerm.trim().length > 0 || Object.keys(catalogFilters).length > 0

  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', searchTerm, catalogFilters],
    queryFn: () => assetService.advancedSearch({
      searchTerm: searchTerm || undefined,
      catalogFilters: Object.keys(catalogFilters).length > 0 ? catalogFilters : undefined,
      rootOnly: !isSearching
    })
  })

  const { data: searchFilters, isLoading: isLoadingFilters } = useQuery({
    queryKey: ['asset-filters'],
    queryFn: () => assetService.getSearchFilters()
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
    <div className="flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Activos (Instancias)</h2>
          <p className="text-muted-foreground">
            Gestione sus activos físicos reales basados en plantillas.
          </p>
        </div>
        
        <AsyncCombobox
          fetcher={async (query) => {
             const results = await assetTemplateService.getTemplates(query)
             return results.filter(t => t.isActive)
          }}
          labelKey="name"
          valueKey="id"
          onSelect={handleCreate}
          searchPlaceholder="Buscar plantilla por nombre..."
          emptyText="No se encontró ninguna plantilla activa."
          renderTrigger={(onClick) => (
            <Button onClick={onClick}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo Activo
            </Button>
          )}
        />
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden min-h-0 mt-4">
        {/* Sidebar de Búsqueda y Filtros */}
        <div className="w-64 flex flex-col gap-6 overflow-hidden min-h-0 shrink-0">
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4" /> Búsqueda
            </h3>
            <Input 
              placeholder="Código o nombre..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          
          <ScrollArea className="flex-1 min-h-0 pr-4">
            {isLoadingFilters ? (
              <div className="text-sm text-muted-foreground">Cargando filtros...</div>
            ) : searchFilters?.map((filter) => (
              <div key={filter.attributeKey} className="mb-6">
                <h4 className="text-sm font-medium mb-2 capitalize">{filter.attributeLabel || filter.attributeKey}</h4>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {catalogFilters[filter.attributeKey]
                          ? filter.options.find(
                              (opt) => opt.catalogItemId === catalogFilters[filter.attributeKey]
                            )?.label
                          : "Todos"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Buscar opción..." />
                      <CommandList>
                        <CommandEmpty>No se encontró la opción.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              const newFilters = { ...catalogFilters }
                              delete newFilters[filter.attributeKey]
                              setCatalogFilters(newFilters)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                !catalogFilters[filter.attributeKey] ? "opacity-100" : "opacity-0"
                              )}
                            />
                            Todos
                          </CommandItem>
                          {filter.options.map((opt) => (
                            <CommandItem
                              key={opt.catalogItemId}
                              onSelect={() => {
                                setCatalogFilters({ ...catalogFilters, [filter.attributeKey]: opt.catalogItemId })
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  catalogFilters[filter.attributeKey] === opt.catalogItemId
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {opt.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Grilla de Activos */}
        <div className="flex-1 rounded-lg border shadow-sm p-4 overflow-auto">
          {isLoadingAssets ? (
            <div className="text-center w-full py-10">Cargando activos...</div>
          ) : (
            <div className="w-full">
              {assets?.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  No se encontraron activos con estos filtros.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {assets?.map((asset) => (
                    <div 
                      key={asset.id} 
                      className="border rounded-lg p-4 bg-card hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors shadow-sm flex flex-col justify-between" 
                      onClick={() => navigate(`/assets/${asset.id}`)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{asset.name}</h4>
                            {asset.state && (
                              <Badge 
                                variant="secondary" 
                                className="text-[10px] px-1.5 py-0"
                                style={asset.stateColor ? { backgroundColor: asset.stateColor, color: '#fff' } : undefined}
                              >
                                {asset.state}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-muted-foreground">{asset.code}</p>
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
                      {/* Si está buscando y tiene padre, mostrar quién es el padre explícitamente */}
                      {isSearching && asset.pathNames && asset.pathNames !== '/' && (
                        <div className="mt-2 pt-2 border-t text-xs text-muted-foreground break-all">
                          <span className="font-semibold">Padre:</span> {asset.pathNames.split('/').filter(Boolean).slice(-1)[0]}
                          <div className="text-[10px] mt-1 opacity-70">Ruta completa: {asset.pathNames}</div>
                        </div>
                      )}

                      {/* Mostrar Hijos */}
                      {asset.children && asset.children.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Hijos ({asset.children.length}):
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {asset.children.map(child => (
                              <div
                                key={child.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/assets/${child.id}`)
                                }}
                                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-secondary cursor-pointer bg-background"
                              >
                                {child.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
