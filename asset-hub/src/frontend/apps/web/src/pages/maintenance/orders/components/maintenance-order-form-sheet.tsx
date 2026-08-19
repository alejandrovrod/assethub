import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { toast } from 'sonner'
import { Loader2, Package, Clock } from 'lucide-react'
import {
  maintenanceOrderService,
  type MaintenanceOrderSummary,
  type MaintenanceOrderKind,
  KIND_LABELS,
} from '@/services/maintenance-order.service'
import { assetService } from '@/services/asset.service'
import { preventivePlanService } from '@/services/preventive-plan.service'

const formSchema = z.object({
  kind: z.enum(['corrective', 'preventive']),
  title: z.string().min(1, 'El título es requerido').max(200),
  description: z.string().max(2000).optional(),
  assetId: z.string().min(1, 'El activo es requerido'),
  preventivePlanId: z.string().optional(),
  incidentId: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: MaintenanceOrderSummary
  onSuccess?: () => void
}

export function MaintenanceOrderFormSheet({ open, onOpenChange, order, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const isEditing = !!order
  const [assetLabel, setAssetLabel] = useState('')

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kind: 'corrective',
      title: '',
      description: '',
      assetId: '',
      preventivePlanId: '',
      incidentId: '',
    },
  })

  useEffect(() => {
    if (order) {
      form.reset({
        kind: order.kind as MaintenanceOrderKind,
        title: order.title,
        description: '',
        assetId: order.assetId,
        preventivePlanId: order.preventivePlanId || '',
        incidentId: order.incidentId || '',
      })
      setAssetLabel(order.assetName || '')
    } else {
      form.reset({
        kind: 'corrective',
        title: '',
        description: '',
        assetId: '',
        preventivePlanId: '',
        incidentId: '',
      })
      setAssetLabel('')
    }
  }, [order, open, form])

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      maintenanceOrderService.create({
        kind: values.kind,
        title: values.title,
        description: values.description || undefined,
        assetId: values.assetId,
        preventivePlanId: values.preventivePlanId || undefined,
        incidentId: values.incidentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      toast.success('Orden creada')
      form.reset()
      setAssetLabel('')
      onSuccess?.()
    },
    onError: () => toast.error('Error al crear la orden'),
  })

  const updateMutation = useMutation({
    mutationFn: (values: FormValues) =>
      maintenanceOrderService.update(order!.id, {
        title: values.title,
        description: values.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-order', order!.id] })
      toast.success('Orden actualizada')
      onSuccess?.()
    },
    onError: () => toast.error('Error al actualizar la orden'),
  })

  const onSubmit = (values: FormValues) => {
    if (isEditing) {
      updateMutation.mutate(values)
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Editar orden' : 'Nueva orden de mantenimiento'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Modificá los datos de la orden.'
              : 'Creá una nueva orden de mantenimiento correctiva o preventiva.'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              {!isEditing && (
                <FormField
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(['corrective', 'preventive'] as const).map((k) => (
                            <SelectItem key={k} value={k}>
                              {KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isEditing && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tipo:</span>
                  <Badge variant="outline">{KIND_LABELS[order!.kind]}</Badge>
                </div>
              )}

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Título de la orden" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descripción opcional" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activo</FormLabel>
                    <AsyncCombobox<{ id: string; name: string }>
                      fetcher={async (query) => {
                        const items = await assetService.getAssets(query || undefined)
                        return items.map((a: any) => ({ id: a.id, name: a.name }))
                      }}
                      labelKey="name"
                      valueKey="id"
                      placeholder="Buscar activo..."
                      searchPlaceholder="Escriba para buscar..."
                      emptyText="No se encontraron activos."
                      onSelect={(item) => {
                        field.onChange(item.id)
                        setAssetLabel(item.name)
                      }}
                      renderTrigger={(onClick) => (
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          onClick={onClick}
                          className="w-full justify-between font-normal"
                        >
                          {assetLabel || 'Buscar activo...'}
                          <Package className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      )}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isEditing && (
                <FormField
                  control={form.control}
                  name="preventivePlanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Clock className="h-4 w-4" /> Plan preventivo (opcional)
                      </FormLabel>
                      <AsyncCombobox<{ id: string; name: string }>
                        fetcher={async (query) => {
                          const plans = await preventivePlanService.getAll()
                          const filtered = query
                            ? plans.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
                            : plans
                          return filtered.map(p => ({ id: p.id, name: p.name }))
                        }}
                        labelKey="name"
                        valueKey="id"
                        placeholder="Buscar plan..."
                        searchPlaceholder="Escriba para buscar..."
                        emptyText="No se encontraron planes."
                        onSelect={(item) => field.onChange(item.id)}
                        renderTrigger={(onClick) => (
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            onClick={onClick}
                            className="w-full justify-between font-normal"
                          >
                            {field.value ? 'Plan seleccionado' : 'Buscar plan...'}
                            <Clock className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        )}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </form>
          </Form>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={createMutation.isPending || updateMutation.isPending}>
            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
