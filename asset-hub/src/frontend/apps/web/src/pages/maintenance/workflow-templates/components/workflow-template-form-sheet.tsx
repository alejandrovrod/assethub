import { useEffect, useMemo } from 'react'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WorkflowTemplateService } from '@/services/workflow-template.service'
import { toast } from 'sonner'
import { LifecycleCanvas } from '@/pages/assets/components/lifecycle-canvas'
import { SchemaBuilder } from '@/pages/assets/components/schema-builder'
import { SchemaFieldPreview } from '@/pages/assets/components/schema-field-preview'
import { Info, FileText, List, GitBranch, Eye } from 'lucide-react'

const formSchema = z.object({
  code: z.string().min(1, 'Código es requerido').max(50),
  name: z.string().min(1, 'Nombre es requerido').max(100),
  type: z.enum(['incident', 'preventive'], { message: 'Tipo es requerido' }),
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
    onError: () => toast.error('Error al crear la plantilla'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => WorkflowTemplateService.update(templateId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-template', templateId] })
      toast.success('Plantilla actualizada exitosamente')
      onSuccess?.()
    },
    onError: () => toast.error('Error al actualizar la plantilla'),
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

  const schemaJson = form.watch('schemaJson')
  const lifecycleStates = form.watch('lifecycleStates')

  const previewFields = useMemo(() => {
    try {
      const schema = JSON.parse(schemaJson || '{}')
      return Object.entries(schema.properties || {}).map(([key, prop]: [string, any]) => ({
        keyName: key,
        title: prop.title || key,
        type: prop.type === 'array' && prop.items?.format === 'data-url' ? 'files'
          : prop.format === 'data-url' ? 'file'
          : prop.format === 'date' ? 'date'
          : prop.catalogCode ? 'catalog'
          : prop.enum ? 'enum'
          : prop.type || 'string',
        required: (schema.required || []).includes(key),
        enumOptions: prop.enum?.join(', '),
        catalogCode: prop.catalogCode,
      }))
    } catch {
      return []
    }
  }, [schemaJson])

  const lifecycleSummary = useMemo(() => {
    try {
      const parsed = JSON.parse(lifecycleStates || '{}')
      const states = Object.keys(parsed.transitions || {})
      return {
        initial: parsed.initialState || (states[0] || ''),
        states,
        transitions: parsed.transitions || {},
      }
    } catch {
      return { initial: '', states: [], transitions: {} }
    }
  }, [lifecycleStates])

  const errors = Object.keys(form.formState.errors).length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[800px] w-[90vw] flex flex-col p-0" aria-describedby={undefined}>
        <div className="p-6 pb-2 border-b shrink-0">
          <SheetHeader>
            <SheetTitle>{templateId ? 'Editar Plantilla de Flujo' : 'Nueva Plantilla de Flujo'}</SheetTitle>
            <SheetDescription>
              Configurá paso a paso los datos básicos, atributos y ciclo de vida de la plantilla de
              flujo.
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
                {errors && (
                  <Alert variant="destructive" className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Revisá los campos marcados en rojo antes de guardar.
                    </AlertDescription>
                  </Alert>
                )}

                <Tabs defaultValue="general" className="flex flex-col">
                  <TabsList className="self-start mb-4 flex-wrap h-auto">
                    <TabsTrigger value="general">
                      <FileText className="h-4 w-4 mr-2" />
                      General
                    </TabsTrigger>
                    <TabsTrigger value="attributes">
                      <List className="h-4 w-4 mr-2" />
                      Atributos
                    </TabsTrigger>
                    <TabsTrigger value="lifecycle">
                      <GitBranch className="h-4 w-4 mr-2" />
                      Ciclo de Vida
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="h-4 w-4 mr-2" />
                      Vista Previa
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="flex flex-col gap-6 mt-0">
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
                                <SelectValue />
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

                    <div className="bg-muted/30 rounded-md p-4 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">¿Qué es una plantilla de flujo?</p>
                      <p>
                        Define los estados y atributos de una incidencia o un plan de mantenimiento.
                        Las instancias creadas con esta plantilla seguirán el ciclo de vida que
                        configures en las siguientes pestañas.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="attributes" className="flex flex-col gap-6 mt-0">
                    <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertDescription>
                        Los atributos son los datos adicionales que se pedirán al crear una incidencia
                        o plan con esta plantilla.
                      </AlertDescription>
                    </Alert>
                    <FormField
                      control={form.control}
                      name="schemaJson"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <SchemaBuilder value={field.value} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="lifecycle" className="flex flex-col gap-6 mt-0">
                    <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertDescription>
                        El ciclo de vida define los estados por los que pasará una instancia de este
                        flujo y las transiciones permitidas entre ellos.
                      </AlertDescription>
                    </Alert>
                    <FormField
                      control={form.control}
                      name="lifecycleStates"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <LifecycleCanvas
                              value={field.value}
                              onChange={field.onChange}
                              schemaJson={schemaJson}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="flex flex-col gap-6 mt-0">
                    <Alert className="bg-muted border-border">
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Esta es una vista aproximada de cómo se verá la plantilla para el usuario
                        final.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Atributos del flujo</h4>
                      {previewFields.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No hay atributos configurados.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {previewFields.map((field) => (
                            <SchemaFieldPreview key={field.keyName} field={field} />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Ciclo de vida</h4>
                      {lifecycleSummary.states.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No hay estados configurados.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {lifecycleSummary.states.map((state) => (
                            <Badge
                              key={state}
                              variant={state === lifecycleSummary.initial ? 'default' : 'outline'}
                            >
                              {state === lifecycleSummary.initial && (
                                <Info className="h-3 w-3 mr-1" />
                              )}
                              {state}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
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
