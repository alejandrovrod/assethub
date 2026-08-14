import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, BookOpen, ChevronRight, Loader2, Edit, Trash2 } from 'lucide-react'
import { catalogService, type Catalog, type CatalogItem } from '@/services/catalog.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CatalogForm, type CatalogFormValues } from './components/catalog-form'
import { CatalogItemForm, type CatalogItemFormValues } from './components/catalog-item-form'
import { toast } from 'sonner'

export default function CatalogsPage() {
  const queryClient = useQueryClient()
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null)
  
  // Dialog States
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false)
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false)
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)

  // Queries
  const { data: catalogs, isLoading: catalogsLoading } = useQuery({
    queryKey: ['catalogs'],
    queryFn: catalogService.getCatalogs,
  })

  const { data: catalogItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['catalogItems', selectedCatalog?.code],
    queryFn: () => catalogService.getCatalogItems(selectedCatalog!.code),
    enabled: !!selectedCatalog,
  })

  // Mutations
  const createCatalogMutation = useMutation({
    mutationFn: catalogService.createCatalog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setIsCatalogDialogOpen(false)
      toast.success('Catálogo creado exitosamente')
    },
    onError: () => toast.error('Error al crear el catálogo'),
  })

  const updateCatalogMutation = useMutation({
    mutationFn: (data: { id: string, request: any }) => catalogService.updateCatalog(data.id, data.request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setIsCatalogDialogOpen(false)
      toast.success('Catálogo actualizado exitosamente')
    },
    onError: () => toast.error('Error al actualizar el catálogo'),
  })

  const createItemMutation = useMutation({
    mutationFn: (data: { code: string, request: any }) => catalogService.createCatalogItem(data.code, data.request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogItems', selectedCatalog?.code] })
      setIsItemDialogOpen(false)
      toast.success('Elemento creado exitosamente')
    },
    onError: () => toast.error('Error al crear el elemento'),
  })

  const updateItemMutation = useMutation({
    mutationFn: (data: { catalogCode: string, itemCode: string, request: any }) => 
      catalogService.updateCatalogItem(data.catalogCode, data.itemCode, data.request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogItems', selectedCatalog?.code] })
      setIsItemDialogOpen(false)
      toast.success('Elemento actualizado exitosamente')
    },
    onError: () => toast.error('Error al actualizar el elemento'),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemCode: string) => catalogService.deleteCatalogItem(selectedCatalog!.code, itemCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogItems', selectedCatalog?.code] })
      toast.success('Elemento eliminado')
    },
  })

  // Handlers
  const handleCatalogSubmit = (values: CatalogFormValues) => {
    if (editingCatalog) {
      updateCatalogMutation.mutate({
        id: editingCatalog.id,
        request: {
          label: values.label,
          targetModules: values.targetModules,
        }
      })
    } else {
      createCatalogMutation.mutate({
        code: values.code,
        label: values.label,
        targetModules: values.targetModules,
      })
    }
  }

  const handleItemSubmit = (values: CatalogItemFormValues) => {
    if (!selectedCatalog) return
    if (editingItem) {
      updateItemMutation.mutate({
        catalogCode: selectedCatalog.code,
        itemCode: editingItem.code,
        request: {
          newCode: values.code !== editingItem.code ? values.code : undefined,
          defaultLabel: values.defaultLabel,
          order: values.order,
          translations: { es: values.defaultLabel }
        }
      })
    } else {
      createItemMutation.mutate({
        code: selectedCatalog.code,
        request: {
          code: values.code,
          defaultLabel: values.defaultLabel,
          order: values.order,
          translations: { es: values.defaultLabel }
        }
      })
    }
  }

  const openNewCatalogDialog = () => {
    setEditingCatalog(null)
    setIsCatalogDialogOpen(true)
  }

  const openEditCatalogDialog = (catalog: Catalog) => {
    setEditingCatalog(catalog)
    setIsCatalogDialogOpen(true)
  }

  const openNewItemDialog = () => {
    setEditingItem(null)
    setIsItemDialogOpen(true)
  }

  const openEditItemDialog = (item: CatalogItem) => {
    setEditingItem(item)
    setIsItemDialogOpen(true)
  }

  return (
    <div className="flex flex-1 h-[calc(100vh-theme(spacing.16))] gap-6 p-6 pt-0">
      {/* Panel Izquierdo: Lista de Catálogos */}
      <Card className="w-1/3 flex flex-col h-full overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Catálogos
            </CardTitle>
            <CardDescription>Gestioná los catálogos base del sistema.</CardDescription>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={openNewCatalogDialog}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full px-4 pb-4">
            {catalogsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : catalogs?.length === 0 ? (
              <div className="text-center p-4 text-muted-foreground">No hay catálogos.</div>
            ) : (
              <div className="space-y-1">
                {catalogs?.map((catalog) => (
                  <div key={catalog.id} className="flex items-center gap-1 group">
                    <button
                      onClick={() => setSelectedCatalog(catalog)}
                      className={cn(
                        "flex-1 flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors hover:bg-muted",
                        selectedCatalog?.id === catalog.id ? "bg-muted font-medium" : "text-muted-foreground"
                      )}
                    >
                      <span className="truncate">{catalog.label}</span>
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => openEditCatalogDialog(catalog)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Panel Derecho: Detalles del Catálogo */}
      <Card className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedCatalog ? (
          <>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle>{selectedCatalog.label}</CardTitle>
                <CardDescription>Código: {selectedCatalog.code}</CardDescription>
              </div>
              <Button onClick={openNewItemDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Elemento
              </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full">
                {itemsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : catalogItems?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <p className="text-muted-foreground mb-4">Este catálogo no tiene elementos.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Código</TableHead>
                        <TableHead>Etiqueta</TableHead>
                        <TableHead className="w-[100px] text-right">Orden</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalogItems?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.code}</TableCell>
                          <TableCell>{item.label || item.code}</TableCell>
                          <TableCell className="text-right">{item.order}</TableCell>
                          <TableCell>
                             <div className="flex items-center gap-1">
                               <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  onClick={() => openEditItemDialog(item)}
                                >
                                 <Edit className="h-4 w-4" />
                               </Button>
                               <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => deleteItemMutation.mutate(item.code)}
                                >
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BookOpen className="h-12 w-12 mb-4 opacity-20" />
            <p>Seleccioná un catálogo para ver sus elementos</p>
          </div>
        )}
      </Card>

      {/* Modals */}
      <Dialog open={isCatalogDialogOpen} onOpenChange={setIsCatalogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCatalog ? 'Editar Catálogo' : 'Nuevo Catálogo'}</DialogTitle>
          </DialogHeader>
          <CatalogForm 
            initialData={editingCatalog} 
            onSubmit={handleCatalogSubmit} 
            onCancel={() => setIsCatalogDialogOpen(false)}
            isLoading={createCatalogMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Elemento' : 'Nuevo Elemento'}</DialogTitle>
          </DialogHeader>
          <CatalogItemForm 
            initialData={editingItem} 
            onSubmit={handleItemSubmit} 
            onCancel={() => setIsItemDialogOpen(false)}
            isLoading={createItemMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
