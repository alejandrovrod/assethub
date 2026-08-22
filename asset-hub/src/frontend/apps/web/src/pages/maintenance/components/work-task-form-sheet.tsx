import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/date-picker'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Loader2, Users, Box, AlertTriangle, CalendarDays, FileText, ClipboardList } from 'lucide-react'
import { workTaskService, type WorkTaskSummary, type CreateWorkTaskRequest } from '@/services/work-task.service'
import { catalogService, type CatalogItem } from '@/services/catalog.service'
import { assetService } from '@/services/asset.service'
import { preventivePlanService } from '@/services/preventive-plan.service'
import { usePropagatedProperties } from '@/hooks/use-propagated-properties'
import { PropagatedPropertiesDisplay } from './propagated-properties-display'

import { apiClient as api } from '@/lib/api-client'

const TASK_TYPE_CATALOG_CODE = 'tasktype'
const PRIORITY_CATALOG_CODE = 'priority'

interface TeamOption { id: string; name: string }

const formSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(200),
  description: z.string().max(2000).optional(),
  dueAt: z.date().optional(),
  taskTypeCatalogItemId: z.string().min(1, 'El tipo de tarea es requerido'),
  priorityCatalogItemId: z.string().min(1, 'La prioridad es requerida'),
  assignedEmployeeId: z.string().optional(),
  assignedTeamId: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface Prefill {
  assetId?: string
  incidentId?: string
  maintenanceOrderId?: string
  preventivePlanId?: string
  taskRecurrenceId?: string
  propertiesJson?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: Prefill
  task?: WorkTaskSummary
  onSuccess?: () => void
}

function toIsoDate(date: Date | undefined): string | undefined {
  if (!date) return undefined
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return d.toISOString().split('T')[0]
}

export function WorkTaskFormSheet({ open, onOpenChange, prefill, task, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const isEditing = !!task
  const [assignedTeamName, setAssignedTeamName] = useState(task?.assignedTeamName ?? '')
  const [propertiesJson, setPropertiesJson] = useState((task as any)?.propertiesJson || prefill?.propertiesJson || '{}')

  const { data: taskTypes } = useQuery({
    queryKey: ['catalog-items', TASK_TYPE_CATALOG_CODE],
    queryFn: () => catalogService.getCatalogItems(TASK_TYPE_CATALOG_CODE, 'es'),
    enabled: open,
  })

  const { data: priorities } = useQuery({
    queryKey: ['catalog-items', PRIORITY_CATALOG_CODE],
    queryFn: () => catalogService.getCatalogItems(PRIORITY_CATALOG_CODE, 'es'),
    enabled: open,
  })

  const { data: prefilledAsset } = useQuery({
    queryKey: ['asset', prefill?.assetId],
    queryFn: () => assetService.getAssetById(prefill!.assetId!),
    enabled: open && !!prefill?.assetId,
  })

  const { data: prefilledPlan } = useQuery({
    queryKey: ['preventive-plan', prefill?.preventivePlanId],
    queryFn: () => preventivePlanService.getById(prefill!.preventivePlanId!),
    enabled: open && !!prefill?.preventivePlanId,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      dueAt: undefined,
      taskTypeCatalogItemId: '',
      priorityCatalogItemId: '',
      assignedEmployeeId: '',
      assignedTeamId: '',
    },
  })

  const relatedEntity = useMemo(() => {
    if (!prefill) return null
    if (prefill.assetId) {
      return { icon: Box, label: 'Activo', value: prefilledAsset?.name ?? prefill.assetId }
    }
    if (prefill.incidentId) {
      return { icon: AlertTriangle, label: 'Incidencia', value: prefill.incidentId }
    }
    if (prefill.maintenanceOrderId) {
      return { icon: FileText, label: 'Orden de mantenimiento', value: prefill.maintenanceOrderId }
    }
    if (prefill.preventivePlanId) {
      return { icon: CalendarDays, label: 'Plan preventivo', value: prefilledPlan?.name ?? prefill.preventivePlanId }
    }
    if (prefill.taskRecurrenceId) {
      return { icon: ClipboardList, label: 'Recurrencia', value: prefill.taskRecurrenceId }
    }
    return null
  }, [prefill, prefilledAsset, prefilledPlan])

  useEffect(() => {
    if (!open) return
    if (isEditing) {
      form.reset({
        title: task.title,
        description: task.description || '',
        dueAt: task.dueAt ? new Date(task.dueAt) : undefined,
        taskTypeCatalogItemId: task.taskTypeCatalogItemId,
        priorityCatalogItemId: task.priorityCatalogItemId,
        assignedTeamId: task.assignedTeamId ?? '',
      })
      if ((task as any).propertiesJson) setPropertiesJson((task as any).propertiesJson)
    } else {
      setAssignedTeamName('')
      setPropertiesJson(prefill?.propertiesJson && prefill.propertiesJson !== '{}' ? prefill.propertiesJson : (propagatedPropertiesJson || '{}'))
      form.reset({
        title: '',
        description: '',
        dueAt: undefined,
        taskTypeCatalogItemId: '',
        priorityCatalogItemId: '',
        assignedTeamId: '',
      })
    }
  }, [open, task, form])

  const { propagatedPropertiesJson } = usePropagatedProperties(prefill?.assetId)

  useEffect(() => {
    if (!open) return
    if (!isEditing && (!prefill?.propertiesJson || prefill.propertiesJson === '{}') && propagatedPropertiesJson) {
      setPropertiesJson(propagatedPropertiesJson)
    }
  }, [propagatedPropertiesJson, open, isEditing, prefill?.propertiesJson])

  const createMutation = useMutation({
    mutationFn: workTaskService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-tasks'] })
      toast.success('Tarea creada exitosamente')
      onOpenChange(false)
      onSuccess?.()
    },
    onError: (error: any) => {
      const message = error?.response?.data?.title || error?.message || 'Error al crear la tarea'
      toast.error(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: CreateWorkTaskRequest) => workTaskService.update(task!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-tasks'] })
      toast.success('Tarea actualizada exitosamente')
      onOpenChange(false)
      onSuccess?.()
    },
    onError: (error: any) => {
      const message = error?.response?.data?.title || error?.message || 'Error al actualizar la tarea'
      toast.error(message)
    },
  })

  const onSubmit = (values: FormValues) => {
    const payload: CreateWorkTaskRequest = {
      title: values.title,
      description: values.description || undefined,
      dueAt: toIsoDate(values.dueAt),
      taskTypeCatalogItemId: values.taskTypeCatalogItemId,
      priorityCatalogItemId: values.priorityCatalogItemId,
      assetId: (prefill?.maintenanceOrderId || prefill?.incidentId || prefill?.preventivePlanId || prefill?.taskRecurrenceId) ? undefined : prefill?.assetId,
      incidentId: prefill?.incidentId,
      maintenanceOrderId: prefill?.maintenanceOrderId,
      preventivePlanId: prefill?.preventivePlanId,
      taskRecurrenceId: prefill?.taskRecurrenceId,
      propertiesJson: propertiesJson,
      assignedEmployeeId: values.assignedEmployeeId || undefined,
      assignedTeamId: values.assignedTeamId || undefined,
    }

    if (isEditing) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const renderCatalogSelect = (
    fieldName: keyof FormValues,
    label: string,
    items?: CatalogItem[],
    placeholder = 'Seleccionar...'
  ) => (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={typeof field.value === 'string' ? field.value : undefined}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {items?.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 h-full">
        <SheetHeader className="p-6 pb-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-md">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-xl">
                {isEditing ? 'Editar Tarea' : 'Nueva Tarea de Trabajo'}
              </SheetTitle>
              <SheetDescription>
                {isEditing
                  ? 'Modificá los datos de la tarea.'
                  : 'Creá una tarea de trabajo y asignala al responsable.'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <ScrollArea className="flex-1 px-6 py-6">
              <div className="space-y-6">
                {relatedEntity && (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Entidad relacionada
                    </span>
                    <div className="flex items-center gap-2">
                      <relatedEntity.icon className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{relatedEntity.label}</span>
                      <Badge variant="secondary" className="font-normal">
                        {relatedEntity.value}
                      </Badge>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input placeholder="Resumen de la tarea" {...field} />
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
                        <Textarea rows={3} placeholder="Detalles opcionales..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de vencimiento</FormLabel>
                      <FormControl>
                        <DatePicker
                          selected={field.value}
                          onSelect={field.onChange}
                          placeholder="Seleccionar fecha"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  {renderCatalogSelect('taskTypeCatalogItemId', 'Tipo de tarea', taskTypes)}
                  {renderCatalogSelect('priorityCatalogItemId', 'Prioridad', priorities)}
                </div>



                {(prefill?.assetId || task?.assetId) && (
                  <PropagatedPropertiesDisplay 
                    assetId={(prefill?.assetId || task?.assetId)!} 
                    propertiesJson={propertiesJson} 
                    inlineEdit={true}
                    onChange={setPropertiesJson}
                  />
                )}
              </div>
            </ScrollArea>

            <div className="p-6 border-t bg-background mt-auto flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="min-w-[150px]">
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : isEditing ? (
                  'Guardar cambios'
                ) : (
                  'Crear tarea'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
