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
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Loader2, Package, Clock, FileText, Link as LinkIcon, Wrench } from 'lucide-react'
import {
  maintenanceOrderService,
  type MaintenanceOrderSummary,
  KIND_LABELS,
} from '@/services/maintenance-order.service'
import { assetService } from '@/services/asset.service'
import { preventivePlanService } from '@/services/preventive-plan.service'
import { catalogService } from '@/services/catalog.service'

import { usePropagatedProperties } from '@/hooks/use-propagated-properties'
import { PropagatedPropertiesDisplay } from '../../components/propagated-properties-display'

const formSchema = z.object({
  kind: z.string().min(1, 'El tipo es requerido'),
  title: z.string().min(1, 'El título es requerido').max(200),
  description: z.string().max(2000).optional(),
  assetId: z.string().min(1, 'El activo es requerido'),
  preventivePlanId: z.string().optional(),
  incidentId: z.string().optional(),
  generateChecklistTasks: z.boolean().default(false),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: MaintenanceOrderSummary
  onSuccess?: (data?: { id: string }) => void
  initialAssetId?: string
  initialAssetLabel?: string
}

import { useQuery } from '@tanstack/react-query'

export function MaintenanceOrderFormSheet({ open, onOpenChange, order, onSuccess, initialAssetId, initialAssetLabel }: Props) {
  const queryClient = useQueryClient()
  
  const { data: taskTypes } = useQuery({
    queryKey: ['catalog', 'tasktype'],
    queryFn: () => catalogService.getCatalogItems('tasktype'),
    enabled: open,
  })
  const isEditing = !!order
  const [assetLabel, setAssetLabel] = useState(initialAssetLabel || '')

  const [propertiesJson, setPropertiesJson] = useState((order as any)?.propertiesJson || '{}')

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      kind: 'corrective',
      title: '',
      description: '',
      assetId: initialAssetId || '',
      preventivePlanId: '',
      incidentId: '',
      generateChecklistTasks: false,
    },
  })

  useEffect(() => {
    if (order) {
      form.reset({
        kind: order.kind,
        title: order.title,
        description: '',
        assetId: order.assetId,
        preventivePlanId: order.preventivePlanId || '',
        incidentId: order.incidentId || '',
      })
      setAssetLabel(order.assetName || '')
    } else {
      form.reset({
        kind: taskTypes?.[0]?.code || '',
        title: '',
        description: '',
        assetId: initialAssetId || '',
        preventivePlanId: '',
        incidentId: '',
        generateChecklistTasks: false,
      })
      setAssetLabel(initialAssetLabel || '')
    }
  }, [order, open, form, initialAssetId, initialAssetLabel, taskTypes])

  const { propagatedPropertiesJson } = usePropagatedProperties(form.watch('assetId'))

  useEffect(() => {
    if (!open) return
    if (!isEditing && propagatedPropertiesJson) {
      setPropertiesJson(propagatedPropertiesJson)
    }
  }, [propagatedPropertiesJson, open, isEditing])

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      maintenanceOrderService.create({
        kind: values.kind,
        title: values.title,
        description: values.description || undefined,
        assetId: values.assetId,
        preventivePlanId: values.preventivePlanId || undefined,
        incidentId: values.incidentId || undefined,
        propertiesJson,
        generateChecklistTasks: values.generateChecklistTasks,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] })
      toast.success('Orden creada')
      form.reset()
      setAssetLabel('')
      onSuccess?.(data)
    },
    onError: () => toast.error('Error al crear la orden'),
  })

  const updateMutation = useMutation({
    mutationFn: (values: FormValues) =>
      maintenanceOrderService.update(order!.id, {
        title: values.title,
        description: values.description || undefined,
        propertiesJson,
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
      <SheetContent className="sm:max-w-lg flex flex-col p-0 h-full">
        <SheetHeader className="p-6 pb-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            {isEditing ? 'Editar orden' : 'Nueva orden de mantenimiento'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Modificá los datos de la orden.'
              : 'Creá una nueva orden de mantenimiento correctiva o preventiva.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden min-h-0">
            <ScrollArea className="flex-1 px-6 min-h-0">
              <div className="space-y-6 pt-4 pb-6">
              
              {/* Sección Principal */}
              <div className="space-y-4 p-4 border rounded-xl bg-card shadow-sm">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" />
                  Información Principal
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isEditing && (
                    <FormField
                      control={form.control}
                      name="kind"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || (taskTypes?.[0]?.code ?? '')}>
                            <FormControl>
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Seleccionar tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {taskTypes?.map((t) => (
                                <SelectItem key={t.code} value={t.code}>
                                  {t.label}
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
                    <div className="flex items-center gap-2 mt-8">
                      <span className="text-sm font-medium">Tipo:</span>
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                        {taskTypes?.find(t => t.code === order!.kind)?.label || KIND_LABELS[order!.kind] || order!.kind}
                      </Badge>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="md:col-span-1">
                        <FormLabel>Título</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ej. Revisión de motor" className="bg-background" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4 p-4 border rounded-xl bg-card shadow-sm">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Agregá detalles adicionales, observaciones o instrucciones específicas para esta orden..." 
                          rows={4} 
                          className="bg-background resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 p-4 border rounded-xl bg-muted/30">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                  <LinkIcon className="w-4 h-4" />
                  Vínculos
                </h4>

                <FormField
                  control={form.control}
                  name="assetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activo asociado</FormLabel>
                      <FormControl>
                        {initialAssetId ? (
                           <div className="flex items-center gap-3 p-3 bg-background border rounded-lg">
                             <div className="p-2 bg-primary/10 text-primary rounded-md">
                               <Package className="w-4 h-4" />
                             </div>
                             <div className="flex flex-col">
                               <span className="text-sm font-medium leading-none mb-1">{initialAssetLabel?.split('-')[1]?.trim() || initialAssetLabel}</span>
                               <span className="text-xs text-muted-foreground">{initialAssetLabel?.split('-')[0]?.trim()}</span>
                             </div>
                           </div>
                        ) : (
                          <AsyncCombobox<{ id: string; name: string; code: string }>
                            fetcher={async (query) => {
                              const items = await assetService.getAssets(query || undefined)
                              return items.map((a: any) => ({ id: a.id, name: a.name, code: a.code }))
                            }}
                            labelKey="name"
                            valueKey="id"
                            placeholder="Buscar activo..."
                            searchPlaceholder="Escriba para buscar..."
                            emptyText="No se encontraron activos."
                            onSelect={(item) => {
                              field.onChange(item.id)
                              setAssetLabel(`${item.code} - ${item.name}`)
                            }}
                            renderTrigger={(onClick) => (
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                onClick={onClick}
                                className="w-full justify-between font-normal bg-background"
                              >
                                {assetLabel || 'Buscar activo...'}
                                <Package className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            )}
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isEditing && (
                  <FormField
                    control={form.control}
                    name="preventivePlanId"
                    render={({ field }) => (
                      <FormItem className="pt-2">
                        <FormLabel className="flex items-center gap-2">
                          Plan preventivo (opcional)
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
                          placeholder="Vincular a un plan..."
                          searchPlaceholder="Escriba para buscar..."
                          emptyText="No se encontraron planes."
                          onSelect={(item) => field.onChange(item.id)}
                          renderTrigger={(onClick) => (
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              onClick={onClick}
                              className="w-full justify-between font-normal bg-background"
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

                {!isEditing && form.watch('assetId') && (
                  <FormField
                    control={form.control}
                    name="generateChecklistTasks"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-background">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">Tareas de plantilla</FormLabel>
                          <SheetDescription className="text-xs">
                            Generar tareas base usando el checklist de la plantilla del activo
                          </SheetDescription>
                        </div>
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>
              
              {(form.watch('assetId') || order?.workflowTemplateId) && (
                <PropagatedPropertiesDisplay 
                  assetId={form.watch('assetId')} 
                  workflowTemplateId={order?.workflowTemplateId}
                  propertiesJson={propertiesJson} 
                  inlineEdit={true}
                  onChange={setPropertiesJson}
                />
              )}
              </div>
            </ScrollArea>

            <div className="p-6 border-t bg-background mt-auto flex justify-end gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
