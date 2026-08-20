import { useEffect } from 'react'
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
import { WorkflowTemplateService } from '@/services/workflow-template.service'
import { toast } from 'sonner'
import { LifecycleCanvas } from '@/pages/assets/components/lifecycle-canvas'
import { SchemaBuilder } from '@/pages/assets/components/schema-builder'


const formSchema = z.object({
  code: z.string().min(1, 'Código es requerido').max(50),
  name: z.string().min(1, 'Nombre es requerido').max(100),
  type: z.enum(['incident', 'preventive'], { required_error: 'Tipo es requerido' }),
  description: z.string().max(500).optional(),
  schemaJson: z.string().refine((val) => {
    if (!val) return true
    try {
      JSON.parse(val)
      return true
    } catch {
      return false
    }
  }, 'Debe ser un JSON válido'),
  lifecycleStates: z.string().refine((val) => {
    if (!val) return true
    try {
      JSON.parse(val)
      return true
    } catch {
      return false
    }
  }, 'Debe ser un JSON válido'),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId?: string
  onSuccess?: () => void
}

export function WorkflowTemplateFormSheet({ open, onOpenChange, templateId, onSuccess }: Props) {
  const queryClient = useQueryClient()
  
  const { data: template, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['workflow-template', templateId],
    queryFn: () => WorkflowTemplateService.getById(templateId!),
    enabled: !!templateId && open,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'incident',
      description: '',
      schemaJson: '{\n  "type": "object",\n  "properties": {}\n}',
      lifecycleStates: '{\n  "initialState": "reported",\n  "states": {\n    "reported": {\n      "allowedTransitions": ["in_progress"]\n    },\n    "in_progress": {\n      "allowedTransitions": ["resolved"]\n    },\n    "resolved": {\n      "allowedTransitions": []\n    }\n  }\n}',
    },
  })

  useEffect(() => {
    if (open) {
      if (template) {
        form.reset({
          code: template.code,
          name: template.name,
          type: template.type as any || 'incident',
          description: template.description || '',
          schemaJson: template.schemaJson || '{\n  "type": "object",\n  "properties": {}\n}',
          lifecycleStates: typeof template.lifecycleStates === 'string' 
            ? template.lifecycleStates 
            : JSON.stringify(template.lifecycleStates, null, 2) || '{\n  "initialState": "reported",\n  "states": {}\n}',
        })
      } else if (!templateId) {
        form.reset({
          code: '',
          name: '',
          type: 'incident',
          description: '',
          schemaJson: '{\n  "type": "object",\n  "properties": {}\n}',
          lifecycleStates: '{\n  "initialState": "reported",\n  "states": {\n    "reported": {\n      "allowedTransitions": ["in_progress"]\n    },\n    "in_progress": {\n      "allowedTransitions": ["resolved"]\n    },\n    "resolved": {\n      "allowedTransitions": []\n    }\n  }\n}',
        })
      }
    }
  }, [open, template, templateId, form])

  const createMutation = useMutation({
    mutationFn: WorkflowTemplateService.create,
    onSuccess: () => {
      toast.success('Plantilla creada exitosamente')
      onSuccess?.()
    },
    onError: () => toast.error('Error al crear la plantilla')
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => WorkflowTemplateService.update(templateId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-template', templateId] })
      toast.success('Plantilla actualizada exitosamente')
      onSuccess?.()
    },
    onError: () => toast.error('Error al actualizar la plantilla')
  })

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      description: values.description || '',
      schemaJson: values.schemaJson,
      lifecycleStates: JSON.parse(values.lifecycleStates),
    }

    if (templateId) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[800px] w-[90vw] flex flex-col p-0" aria-describedby={undefined}>
        <div className="p-6 pb-2 border-b shrink-0">
          <SheetHeader>
            <SheetTitle>{templateId ? 'Editar Plantilla de Flujo' : 'Nueva Plantilla de Flujo'}</SheetTitle>
            <SheetDescription>
              Configurá los detalles básicos, el tipo (Incidencia o Mantenimiento) y el ciclo de vida.
            </SheetDescription>
          </SheetHeader>
        </div>

        {isLoadingTemplate ? (
          <div className="flex-1 flex items-center justify-center">
            Cargando plantilla...
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">
                {Object.keys(form.formState.errors).length > 0 && (
                  <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
                    <strong>Error de Validación:</strong>
                    <pre className="mt-2 text-xs">{JSON.stringify(form.formState.errors, null, 2)}</pre>
                  </div>
                )}
                <div className="flex flex-col gap-6 pb-6">
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ej: FALLA_MECANICA" 
                              readOnly={!!template} 
                              className={template ? "bg-muted cursor-not-allowed text-muted-foreground" : ""}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: Falla Mecánica General" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Flujo</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="incident">Incidencia</SelectItem>
                            <SelectItem value="preventive">Plan de Mantenimiento Preventivo</SelectItem>
                          </SelectContent>
                        </Select>
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
                          <Textarea placeholder="Breve descripción de la plantilla..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-6 pt-4 border-t">
                    <h4 className="text-sm font-medium">Configuración Visual (Schema & Ciclo de Vida)</h4>
                    
                    <FormField
                      control={form.control}
                      name="schemaJson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Esquema de Atributos</FormLabel>
                          <FormControl>
                            <SchemaBuilder value={field.value} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="lifecycleStates"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Flujo de Estados (Máquina de Estados)</FormLabel>
                          <FormControl>
                            <LifecycleCanvas 
                            value={field.value} 
                            onChange={field.onChange} 
                            schemaJson={form.watch('schemaJson')}
                          />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                </div>
              </div>

              <div className="p-6 border-t bg-background shrink-0 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Guardando...' : 'Guardar Plantilla'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  )
}

