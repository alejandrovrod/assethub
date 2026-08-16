import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { assetTemplateService } from '@/services/asset-template.service'
import { toast } from 'sonner'
import { SchemaBuilder } from './schema-builder'
import { LifecycleCanvas } from './lifecycle-canvas'
import { FormSheetLayout, formSheetContentClass } from '@/components/form-sheet-layout'

const formSchema = z.object({
  code: z.string().min(1, 'Código es requerido').max(50),
  name: z.string().min(1, 'Nombre es requerido').max(100),
  description: z.string().max(500).optional(),
  businessEntityTypeId: z.string().optional(),
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
  maintenanceChecklist: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: any
}

export function AssetTemplateFormSheet({ open, onOpenChange, template }: Props) {
  const queryClient = useQueryClient()
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      businessEntityTypeId: '00000000-0000-0000-0000-000000000000', // Mock UUID for now
      schemaJson: '{\n  "type": "object",\n  "properties": {}\n}',
      lifecycleStates: '{\n  "initialState": "Active",\n  "transitions": {\n    "Active": ["Inactive"],\n    "Inactive": ["Active"]\n  }\n}',
      maintenanceChecklist: '',
    },
  })

  useEffect(() => {
    if (open) {
      if (template) {
        form.reset({
          code: template.code,
          name: template.name,
          description: template.description || '',
          businessEntityTypeId: template.businessEntityTypeId || '00000000-0000-0000-0000-000000000000',
          schemaJson: template.schemaJson || '{\n  "type": "object",\n  "properties": {}\n}',
          lifecycleStates: typeof template.lifecycleStates === 'string' 
            ? template.lifecycleStates 
            : JSON.stringify(template.lifecycleStates, null, 2) || '{\n  "initialState": "Active",\n  "transitions": {\n    "Active": ["Inactive"],\n    "Inactive": ["Active"]\n  }\n}',
          maintenanceChecklist: template.maintenanceChecklist || '',
        })
      } else {
        form.reset({
          code: '',
          name: '',
          description: '',
          businessEntityTypeId: '00000000-0000-0000-0000-000000000000',
          schemaJson: '{\n  "type": "object",\n  "properties": {}\n}',
          lifecycleStates: '{\n  "initialState": "Active",\n  "transitions": {\n    "Active": ["Inactive"],\n    "Inactive": ["Active"]\n  }\n}',
          maintenanceChecklist: '',
        })
      }
    }
  }, [open, template, form])

  const createMutation = useMutation({
    mutationFn: assetTemplateService.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success('Plantilla creada exitosamente')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al crear la plantilla'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) => assetTemplateService.updateTemplate(template.id, {
      name: data.name,
      description: data.description || '',
      schemaJson: data.schemaJson,
      allowedChildTemplateIds: [],
      lifecycleStates: JSON.parse(data.lifecycleStates || '{}'),
      maintenanceChecklist: data.maintenanceChecklist || ''
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success('Plantilla actualizada exitosamente')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al actualizar la plantilla'),
  })

  const onSubmit = (data: FormValues) => {
    if (template) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate({
        ...data,
        description: data.description || '',
        businessEntityTypeId: data.businessEntityTypeId || '00000000-0000-0000-0000-000000000000',
        allowedChildTemplateIds: [],
        lifecycleStates: JSON.parse(data.lifecycleStates || '{}'),
        maintenanceChecklist: data.maintenanceChecklist || ''
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={`${formSheetContentClass} w-full sm:max-w-3xl md:max-w-5xl lg:max-w-[85vw] xl:max-w-[90vw]`}>
        <Form {...form}>
          <FormSheetLayout
            onSubmit={form.handleSubmit(onSubmit, (err) => console.log('FORM ERRORS:', err))}
            header={
              <SheetHeader className="p-6 pb-4">
                <SheetTitle>{template ? 'Editar Plantilla' : 'Nueva Plantilla'}</SheetTitle>
                <SheetDescription>
                  Configurá los datos básicos y el esquema JSON de atributos para la plantilla de activo.
                </SheetDescription>
              </SheetHeader>
            }
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Guardando...' : 'Guardar Plantilla'}
                </Button>
              </>
            }
          >
            {Object.keys(form.formState.errors).length > 0 && (
              <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
                <strong>Error de Validación:</strong>
                <pre className="mt-2 text-xs">{JSON.stringify(form.formState.errors, null, 2)}</pre>
              </div>
            )}
            <div className="flex flex-col gap-6">
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej: VEHICULO" 
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
                          <Input placeholder="Ej: Vehículos Ligeros" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                  <FormField
                    control={form.control}
                    name="maintenanceChecklist"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Checklist de Mantenimiento Preventivo (JSON)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Ej: { &quot;tasks&quot;: [&quot;Revisar aceite&quot;, &quot;Revisar filtros&quot;] }" {...field} className="font-mono text-sm h-32" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>
            </div>
          </FormSheetLayout>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
