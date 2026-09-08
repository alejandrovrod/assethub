import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, Box } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { assetService, AssetMaterialDto } from '@/services/asset.service'
import { AssetMaterialFormSheet } from './asset-material-form-sheet'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Props {
  assetId: string
}

export function AssetMaterialsTable({ assetId }: Props) {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<AssetMaterialDto | undefined>()
  
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: materials, isLoading } = useQuery({
    queryKey: ['asset-materials', assetId],
    queryFn: () => assetService.getMaterials(assetId)
  })

  const deleteMutation = useMutation({
    mutationFn: (materialId: string) => assetService.deleteMaterial(assetId, materialId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-materials', assetId] })
      toast.success('Material eliminado exitosamente')
      setDeleteId(null)
    },
    onError: () => {
      toast.error('Error al eliminar el material')
      setDeleteId(null)
    }
  })

  const handleAdd = () => {
    setEditingMaterial(undefined)
    setFormOpen(true)
  }

  const handleEdit = (material: AssetMaterialDto) => {
    setEditingMaterial(material)
    setFormOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">BOM / Materiales del Activo</h3>
        <Button onClick={handleAdd} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Repuesto
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Repuesto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-center">Criticidad</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!materials || materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <Box className="h-8 w-8 mb-2 opacity-50" />
                    <p>No hay materiales asignados a este activo.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              materials.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.catalogItemCode}</TableCell>
                  <TableCell>
                    <div>{m.catalogItemLabel}</div>
                    {m.notes && <div className="text-xs text-muted-foreground mt-1">{m.notes}</div>}
                  </TableCell>
                  <TableCell className="text-right">{m.quantity}</TableCell>
                  <TableCell>{m.unitOfMeasure}</TableCell>
                  <TableCell className="text-center">
                    {m.isCritical ? (
                      <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25">
                        Crítico
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(m.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AssetMaterialFormSheet
        assetId={assetId}
        open={formOpen}
        onOpenChange={setFormOpen}
        materialToEdit={editingMaterial}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remover Material
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas remover este repuesto del BOM de este activo? Esta acción no afectará al catálogo global.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
