import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetService, Asset } from '@/services/asset.service'
import { assetTemplateService, AssetTemplate } from '@/services/asset-template.service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Filter, LayoutGrid, List, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { AssetFormSheet } from './components/asset-form-sheet'
import { AssetGlobalMapModal } from '@/components/map/AssetGlobalMapModal'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { usePermissions } from '@/hooks/use-permissions'

const riskLabels: Record<string, string> = {
  Low: 'Bajo',
  Moderate: 'Moderado',
  High: 'Alto',
  Critical: 'Crítico'
}

const riskBadgeStyles: Record<string, string> = {
  Low: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  Moderate: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
  High: 'bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400',
  Critical: 'bg-destructive/15 text-destructive border-destructive/30 animate-pulse'
}
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export default function AssetsPage() {
  const { can } = usePermissions()
  const canCreate = can('assets:create')
  const canDelete = can('assets:delete')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(null)
  const [mapModalOpen, setMapModalOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  const [searchTerm, setSearchTerm] = useState('')
  const [catalogFilters, setCatalogFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const isSearching = searchTerm.trim().length > 0 || Object.keys(catalogFilters).length > 0

  const getParentName = (pathNames?: string, parentId?: string) => {
    if (!parentId) return 'Ninguno (Raíz)'
    if (!pathNames || pathNames === '/') return '-'
    const parts = pathNames.split('/').filter(Boolean)
    return parts.length > 1 ? parts[parts.length - 2] : '-'
  }

  useEffect(() => {
    setPage(1)
  }, [searchTerm, catalogFilters, pageSize])

  const { data: pagedResult, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', searchTerm, catalogFilters, page, pageSize],
    queryFn: () => assetService.advancedSearch({
      searchTerm: searchTerm || undefined,
      catalogFilters: Object.keys(catalogFilters).length > 0 ? catalogFilters : undefined,
      rootOnly: !isSearching,
      page,
      pageSize
    })
  })

  const assets = pagedResult?.items || []

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

  // Eliminación usando AlertDialog (ya no necesitamos window.confirm)

  const renderFilters = () => (
    <div className="flex flex-col gap-6 h-full overflow-hidden">
      <div className="shrink-0">
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
              <PopoverContent className="w-[calc(100vw-3rem)] sm:w-full p-0">
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
  )

  return (
    <div className="flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Activos (Instancias)</h2>
          <p className="text-muted-foreground">
            Gestione sus activos físicos reales basados en plantillas.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 shrink-0">
          <div className="flex bg-muted rounded-md p-1 items-center shrink-0">
            <Button 
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
              size="sm" 
              className="h-8 px-2"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button 
              variant={viewMode === 'table' ? 'secondary' : 'ghost'} 
              size="sm" 
              className="h-8 px-2"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          
          <Button variant="outline" onClick={() => setMapModalOpen(true)} className="flex items-center gap-2 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" /></svg>
            Ver en Mapa
          </Button>

          {canCreate && (
            <AsyncCombobox
              fetcher={async (query) => {
                const results = await assetTemplateService.getTemplates(query)
                return results.filter(t => t.isActive && !t.isSystemTemplate)
              }}
              labelKey="name"
              valueKey="id"
              onSelect={handleCreate}
              searchPlaceholder="Buscar plantilla por nombre..."
              emptyText="No se encontró ninguna plantilla activa."
              renderTrigger={(onClick) => (
                <Button onClick={onClick} size="icon" title="Agregar Activo" className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 gap-6 overflow-hidden min-h-0 mt-4">
        {/* Mobile Filter Button */}
        <div className="md:hidden shrink-0">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filtros
                </div>
                {Object.keys(catalogFilters).length > 0 && (
                  <Badge variant="secondary">{Object.keys(catalogFilters).length}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] sm:w-[350px] p-4 pt-10 flex flex-col">
              <SheetHeader className="mb-4 shrink-0">
                <SheetTitle>Filtros de Búsqueda</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-hidden">
                {renderFilters()}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Sidebar de Búsqueda y Filtros */}
        <div className="hidden md:flex w-64 flex-col gap-6 overflow-hidden min-h-0 shrink-0">
          {renderFilters()}
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
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {assets?.map((asset) => (
                    <div
                      key={asset.id}
                      className="border rounded-lg p-4 bg-card hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors shadow-sm flex flex-col justify-between"
                      onClick={() => navigate(`/assets/${asset.id}`)}
                    >
                       <div className="flex justify-between items-start mb-2">
                         <div>
                           <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                            {asset.healthRiskLevel && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 font-semibold shrink-0 inline-flex items-center gap-1",
                                  riskBadgeStyles[asset.healthRiskLevel] || riskBadgeStyles.Low
                                )}
                                title={
                                  asset.healthPredictedFailureDays != null
                                    ? `Falla estimada: ${asset.healthPredictedFailureDays >= 365 ? 'Más de 1 año (Óptimo)' : `${asset.healthPredictedFailureDays} días`}`
                                    : undefined
                                }
                              >
                                <Activity className="h-2.5 w-2.5" />
                                <span>Salud {riskLabels[asset.healthRiskLevel] || asset.healthRiskLevel}</span>
                                {asset.healthRiskProbability != null && (
                                  <span className="opacity-80">({(asset.healthRiskProbability * 100).toFixed(0)}%)</span>
                                )}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm font-medium text-muted-foreground">{asset.code}</p>
                            {asset.childrenCount > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground">
                                {asset.childrenCount} {asset.childrenCount === 1 ? 'hijo' : 'hijos'}
                              </Badge>
                            )}
                          </div>
                        </div>
                         {canDelete && (
                           <AlertDialog>
                             <AlertDialogTrigger asChild>
                               <Button
                                 variant="ghost"
                                 size="icon"
                                 className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                 onClick={(e) => e.stopPropagation()}
                                 disabled={deleteMutation.isPending}
                               >
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             </AlertDialogTrigger>
                             <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                               <AlertDialogHeader>
                                 <AlertDialogTitle>Eliminar el activo</AlertDialogTitle>
                                 <AlertDialogDescription>
                                   ¿Estás seguro de que deseas eliminar este activo?.
                                 </AlertDialogDescription>
                               </AlertDialogHeader>
                               <AlertDialogFooter>
                                 <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancelar</AlertDialogCancel>
                                 <AlertDialogAction
                                   onClick={(e) => {
                                     e.stopPropagation()
                                     deleteMutation.mutate(asset.id)
                                   }}
                                   className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                 >
                                   Eliminar
                                 </AlertDialogAction>
                               </AlertDialogFooter>
                             </AlertDialogContent>
                           </AlertDialog>
                         )}
                       </div>
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground break-all">
                        <span className="font-semibold">Padre:</span> {getParentName(asset.pathNames, asset.parentId)}
                        {asset.pathNames && asset.pathNames !== '/' && (
                          <div className="text-[10px] mt-1 opacity-70">Ruta completa: {asset.pathNames}</div>
                        )}
                      </div>


                    </div>
                  ))}
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Salud Predictiva</TableHead>
                        <TableHead>Padre</TableHead>
                        <TableHead>Hijos</TableHead>
                        <TableHead className="w-[80px] text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assets?.map((asset) => (
                        <TableRow 
                          key={asset.id}
                          className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                          onClick={() => navigate(`/assets/${asset.id}`)}
                        >
                          <TableCell className="font-medium">{asset.code}</TableCell>
                          <TableCell>{asset.name}</TableCell>
                          <TableCell>
                            {asset.state && (
                              <Badge
                                variant="secondary"
                                style={asset.stateColor ? { backgroundColor: asset.stateColor, color: '#fff' } : undefined}
                              >
                                {asset.state}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {asset.healthRiskLevel ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs font-semibold inline-flex items-center gap-1.5",
                                  riskBadgeStyles[asset.healthRiskLevel] || riskBadgeStyles.Low
                                )}
                                title={
                                  asset.healthPredictedFailureDays != null
                                    ? `Falla estimada: ${asset.healthPredictedFailureDays >= 365 ? 'Más de 1 año (Óptimo)' : `${asset.healthPredictedFailureDays} días`}`
                                    : undefined
                                }
                              >
                                <Activity className="h-3 w-3 shrink-0" />
                                <span>{riskLabels[asset.healthRiskLevel] || asset.healthRiskLevel}</span>
                                {asset.healthRiskProbability != null && (
                                  <span className="opacity-80">({(asset.healthRiskProbability * 100).toFixed(0)}%)</span>
                                )}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {getParentName(asset.pathNames, asset.parentId)}
                          </TableCell>
                          <TableCell>
                            {asset.childrenCount > 0 ? (
                              <Badge variant="outline">{asset.childrenCount}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {canDelete && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={deleteMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Eliminar el activo</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      ¿Estás seguro de que deseas eliminar este activo?.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        deleteMutation.mutate(asset.id)
                                      }}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoadingAssets && (
            <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Total: {pagedResult?.totalCount || 0} activos
                </span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / pág</SelectItem>
                    <SelectItem value="20">20 / pág</SelectItem>
                    <SelectItem value="50">50 / pág</SelectItem>
                    <SelectItem value="100">100 / pág</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <div className="flex items-center text-sm px-2">
                  Página {page} de {pagedResult?.totalPages || 1}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= (pagedResult?.totalPages || 1)}
                >
                  Siguiente
                </Button>
              </div>
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

      <AssetGlobalMapModal
        open={mapModalOpen}
        onOpenChange={setMapModalOpen}
        assets={assets || []}
      />
    </div>
  )
}
