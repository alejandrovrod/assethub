import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Trash2 } from 'lucide-react'
import { maintenanceOrderService, type MaintenanceOrderState, type MaintenanceOrderPart } from '@/services/maintenance-order.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { apiClient as api } from '@/lib/api-client'

interface MaintenanceOrderPartsEditorProps {
  orderId: string
  state: MaintenanceOrderState
}

interface PartForm {
  catalogItemId: string
  catalogItemLabel: string
  quantity: number
  unitCost: number
}

export function MaintenanceOrderPartsEditor({ orderId, state }: MaintenanceOrderPartsEditorProps) {
  const queryClient = useQueryClient()
  const [newPart, setNewPart] = useState<PartForm>({
    catalogItemId: '',
    catalogItemLabel: '',
    quantity: 1,
    unitCost: 0,
  })
  const [showForm, setShowForm] = useState(false)

  const isLocked = state === 'verified'

  const { data: parts = [] } = useQuery({
    queryKey: ['maintenance-order-parts', orderId],
    queryFn: () => maintenanceOrderService.getParts(orderId),
  })

  const removeMutation = useMutation({
    mutationFn: (partId: string) => maintenanceOrderService.removePart(orderId, partId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order-parts', orderId] })
      toast.success('Parte eliminada')
    },
    onError: () => toast.error('Error al eliminar parte'),
  })

  const addMutation = useMutation({
    mutationFn: (payload: { catalogItemId: string; quantity: number; unitCost: number }) => {
      return maintenanceOrderService.addPart(orderId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order-parts', orderId] })
      toast.success('Parte agregada')
      setNewPart({ catalogItemId: '', catalogItemLabel: '', quantity: 1, unitCost: 0 })
      setShowForm(false)
    },
    onError: () => toast.error('Error al agregar parte'),
  })

  const handleAddPart = () => {
    if (!newPart.catalogItemId || newPart.quantity <= 0 || newPart.unitCost <= 0) {
      toast.error(`Completá todos los campos — id: ${newPart.catalogItemId}, qty: ${newPart.quantity}, cost: ${newPart.unitCost}`)
      return
    }
    addMutation.mutate({
      catalogItemId: newPart.catalogItemId,
      quantity: newPart.quantity,
      unitCost: newPart.unitCost,
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span className="text-muted-foreground">Partes / Repuestos</span>
        </h4>
        {!isLocked && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
          </Button>
        )}
      </div>

      {showForm && !isLocked && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="space-y-2">
            <Label>Item del catálogo</Label>
            <AsyncCombobox<{ id: string; name: string }>
              minSearchChars={1}
              fetcher={async (query) => {
                const params = new URLSearchParams({ locale: 'es', search: query })
                const { data } = await api.get<{ items: Array<{ id: string; label: string }> }>(`/catalogs/parts/items?${params}`)
                return data.items.map(i => ({ id: i.id, name: i.label }))
              }}
              labelKey="name"
              valueKey="id"
              placeholder="Buscar repuesto..."
              searchPlaceholder="Escriba para buscar..."
              emptyText="No se encontraron repuestos."
              onSelect={(item) => {
                setNewPart(prev => ({ ...prev, catalogItemId: item.id, catalogItemLabel: item.name }))
              }}
              renderTrigger={(onClick) => (
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  onClick={onClick}
                  className="w-full justify-between font-normal text-sm"
                >
                  {newPart.catalogItemLabel || 'Buscar repuesto...'}
                  <span className="ml-2 opacity-50">▼</span>
                </Button>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={newPart.quantity}
                onChange={(e) => setNewPart(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Costo unitario</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={newPart.unitCost}
                onChange={(e) => setNewPart(prev => ({ ...prev, unitCost: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAddPart} disabled={addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Agregar
            </Button>
          </div>
        </div>
      )}

      {parts.length > 0 && (
        <div className="space-y-2">
          {parts.map((part) => (
            <div key={part.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-background">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {part.catalogItemLabel || part.catalogItemId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {part.quantity} × ${part.unitCost.toFixed(2)} = <span className="font-medium text-foreground">${part.totalCost.toFixed(2)}</span>
                </p>
              </div>
              {!isLocked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(part.id)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Separator />
    </div>
  )
}
