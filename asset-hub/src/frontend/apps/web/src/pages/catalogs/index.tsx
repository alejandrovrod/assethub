import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, BookOpen, ChevronRight, Loader2, Edit, Trash2 } from 'lucide-react'
import { catalogService, type Catalog, type CatalogItem } from '@/services/catalog.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CatalogForm, type CatalogFormValues } from './components/catalog-form'
import { CatalogItemForm, type CatalogItemFormValues } from './components/catalog-item-form'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'

export default function CatalogsPage() {
  const { can } = usePermissions()
  const { t } = useTranslation(['catalogs', 'common'])
  const canCreateCatalog = can('catalogs:create')
  const canUpdateCatalog = can('catalogs:update')
  const canCreateItem = can('catalog-items:create')
  const canUpdateItem = can('catalog-items:update')
  const canDeleteItem = can('catalog-items:delete')
  const queryClient = useQueryClient()
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null)
  
  // Dialog States
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false)
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false)
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)

  // Pagination
  const [itemPage, setItemPage] = useState(1)
  const [itemPageSize, setItemPageSize] = useState(10)

  useEffect(() => {
    setItemPage(1)
  }, [selectedCatalog?.id, itemPageSize])

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

  const itemTotalCount = catalogItems?.length || 0
  const itemTotalPages = Math.max(1, Math.ceil(itemTotalCount / itemPageSize))
  const currentItemPage = Math.min(itemPage, itemTotalPages)

  const pagedItems = useMemo(() => {
    if (!catalogItems) return []
    const start = (currentItemPage - 1) * itemPageSize
    return catalogItems.slice(start, start + itemPageSize)
  }, [catalogItems, currentItemPage, itemPageSize])

  // Mutations
  const createCatalogMutation = useMutation({
    mutationFn: catalogService.createCatalog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setIsCatalogDialogOpen(false)
      toast.success(t('toast.catalogCreated'))
    },
    onError: () => toast.error(t('toast.createCatalogError')),
  })

  const updateCatalogMutation = useMutation({
    mutationFn: (data: { id: string, request: any }) => catalogService.updateCatalog(data.id, data.request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setIsCatalogDialogOpen(false)
      toast.success(t('toast.catalogUpdated'))
    },
    onError: () => toast.error(t('toast.updateCatalogError')),
  })

  const createItemMutation = useMutation({
    mutationFn: (data: { code: string, request: any }) => catalogService.createCatalogItem(data.code, data.request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogItems', selectedCatalog?.code] })
      setIsItemDialogOpen(false)
      toast.success(t('toast.itemCreated'))
    },
    onError: () => toast.error(t('toast.createItemError')),
  })

  const updateItemMutation = useMutation({
    mutationFn: (data: { catalogCode: string, itemCode: string, request: any }) => 
      catalogService.updateCatalogItem(data.catalogCode, data.itemCode, data.request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogItems', selectedCatalog?.code] })
      setIsItemDialogOpen(false)
      toast.success(t('toast.itemUpdated'))
    },
    onError: () => toast.error(t('toast.updateItemError')),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemCode: string) => catalogService.deleteCatalogItem(selectedCatalog!.code, itemCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogItems', selectedCatalog?.code] })
      toast.success(t('toast.itemDeleted'))
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
              {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          {canCreateCatalog && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={openNewCatalogDialog}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full px-4 pb-4">
            {catalogsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : catalogs?.length === 0 ? (
              <div className="text-center p-4 text-muted-foreground">{t('empty.catalogs')}</div>
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
                    {canUpdateCatalog && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => openEditCatalogDialog(catalog)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
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
                <CardDescription>{t('common:labels.code')}: {selectedCatalog.code}</CardDescription>
              </div>
              {canCreateItem && (
                <Button onClick={openNewItemDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('newItem')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 min-h-0">
                {itemsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : catalogItems?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <p className="text-muted-foreground mb-4">{t('empty.items')}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">{t('common:labels.code')}</TableHead>
                        <TableHead>{t('labels.label')}</TableHead>
                        <TableHead className="w-[100px] text-right">{t('labels.order')}</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.code}</TableCell>
                          <TableCell>{item.label || item.code}</TableCell>
                          <TableCell className="text-right">{item.order}</TableCell>
                          <TableCell>
                             <div className="flex items-center gap-1">
                              {canUpdateItem && (
                                <Button 
                                   variant="ghost" 
                                   size="icon" 
                                   className="h-8 w-8"
                                   onClick={() => openEditItemDialog(item)}
                                 >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {canDeleteItem && (
                                <Button 
                                   variant="ghost" 
                                   size="icon" 
                                   className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                   onClick={() => deleteItemMutation.mutate(item.code)}
                                 >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                             </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
              {/* Pagination Controls */}
              {!itemsLoading && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {t('pagination.totalItems', { count: itemTotalCount })}
                    </span>
                    <Select value={String(itemPageSize)} onValueChange={(v) => setItemPageSize(Number(v))}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">{t('pagination.perPage', { count: 10 })}</SelectItem>
                        <SelectItem value="20">{t('pagination.perPage', { count: 20 })}</SelectItem>
                        <SelectItem value="50">{t('pagination.perPage', { count: 50 })}</SelectItem>
                        <SelectItem value="100">{t('pagination.perPage', { count: 100 })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setItemPage(p => Math.max(1, p - 1))}
                      disabled={currentItemPage === 1}
                    >
                      {t('common:pagination.previous')}
                    </Button>
                    <div className="flex items-center text-sm px-2">
                      {t('common:pagination.page', { page: currentItemPage })} {t('common:pagination.of', { total: itemTotalPages })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setItemPage(p => Math.min(itemTotalPages, p + 1))}
                      disabled={currentItemPage >= itemTotalPages}
                    >
                      {t('common:pagination.next')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BookOpen className="h-12 w-12 mb-4 opacity-20" />
            <p>{t('empty.selectCatalog')}</p>
          </div>
        )}
      </Card>

      {/* Modals */}
      <Dialog open={isCatalogDialogOpen} onOpenChange={setIsCatalogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCatalog ? t('dialog.editCatalog') : t('dialog.newCatalog')}</DialogTitle>
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
            <DialogTitle>{editingItem ? t('dialog.editItem') : t('newItem')}</DialogTitle>
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
