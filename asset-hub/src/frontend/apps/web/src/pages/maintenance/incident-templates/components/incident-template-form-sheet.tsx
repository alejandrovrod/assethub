import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { incidentTemplateService } from '@/services/incident-template.service'
import { toast } from 'sonner'
import { LifecycleCanvas } from '@/pages/assets/components/lifecycle-canvas'
import { SchemaBuilder } from '@/pages/assets/components/schema-builder'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const formSchema = z.object({
  code: z.string().min(1, 'Código es requerido').max(50),
  name: z.string().min(1, 'Nombre es requerido').max(100),
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

export function IncidentTemplateFormSheet({ open, onOpenChange, templateId, onSuccess }: Props) {
  const queryClient = useQueryClient()
  
  const { data: template, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['incident-template', templateId],
    queryFn: () => incidentTemplateService.getById(templateId!),
    enabled: !!templateId && open,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
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
          description: '',
          schemaJson: '{\n  "type": "object",\n  "properties": {}\n}',
          lifecycleStates: '{\n  "initialState": "reported",\n  "states": {\n    "reported": {\n      "allowedTransitions": ["in_progress"]\n    },\n    "in_progress": {\n      "allowedTransitions": ["resolved"]\n    },\n    "resolved": {\n      "allowedTransitions": []\n    }\n  }\n}',
        })
      }
    }
  }, [open, template, templateId, form])

  const createMutation = useMutation({
    mutationFn: incidentTemplateService.create,
    onSuccess: () => {
      toast.success('Plantilla creada exitosamente')
      onSuccess?.()
    },
    onError: () => toast.error('Error al crear la plantilla')
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => incidentTemplateService.update(templateId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-template', templateId] })
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
      <SheetContent className="sm:max-w-[800px] w-[90vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{templateId ? 'Editar Plantilla' : 'Nueva Plantilla'}</SheetTitle>
          <SheetDescription>
            Configurá los detalles básicos, propiedades dinámicas y ciclo de vida de la incidencia.
          </SheetDescription>
        </SheetHeader>

        {isLoadingTemplate ? (
          <div className="py-8 text-center">Cargando plantilla...</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
              <Tabs defaultValue="general">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="schema">Propiedades (Schema)</TabsTrigger>
                  <TabsTrigger value="lifecycle">Ciclo de Vida</TabsTrigger>
                </TabsList>
                
                <TabsContent value="general" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: FIRE_ALARM" {...field} />
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
                            <Input placeholder="Ej: Alarma de Incendio" {...field} />
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
                          <Textarea placeholder="Describa el propósito de esta plantilla..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="schema" className="pt-4 h-[500px]">
                  <FormField
                    control={form.control}
                    name="schemaJson"
                    render={({ field }) => (
                      <FormItem className="h-full flex flex-col">
                        <FormLabel>Schema de Propiedades (React JSON Schema Form)</FormLabel>
                        <FormControl className="flex-1">
                          <SchemaBuilder 
                            value={field.value} 
                            onChange={field.onChange} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="lifecycle" className="pt-4 h-[500px]">
                  <FormField
                    control={form.control}
                    name="lifecycleStates"
                    render={({ field }) => (
                      <FormItem className="h-full flex flex-col">
                        <FormLabel>Configuración de Estados</FormLabel>
                        <FormControl className="flex-1">
                          <LifecycleCanvas 
                            value={field.value} 
                            onChange={field.onChange} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

              <SheetFooter className="mt-8">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Guardando...' : 'Guardar Plantilla'}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  )
}
