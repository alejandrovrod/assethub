import { useEffect, useMemo } from 'react'
import { useForm, useFormContext, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { assetTemplateService } from '@/services/asset-template.service'
import { toast } from 'sonner'
import { SchemaBuilder } from './schema-builder'
import { LifecycleCanvas } from './lifecycle-canvas'
import { MaintenanceChecklistBuilder } from './maintenance-checklist-builder'
import { SchemaFieldPreview } from './schema-field-preview'
import { FormSheetLayout, formSheetContentClass } from '@/components/form-sheet-layout'
import { Info, FileText, List, GitBranch, CheckSquare, Eye } from 'lucide-react'

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

function SchemaBuilderField() {
  const form = useFormContext<FormValues>()
  return (
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
  )
}

function LifecycleCanvasField() {
  const form = useFormContext<FormValues>()
  const schemaJson = useWatch({ control: form.control, name: 'schemaJson' })
  return (
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
  )
}

function MaintenanceChecklistField() {
  const form = useFormContext<FormValues>()
  return (
    <FormField
      control={form.control}
      name="maintenanceChecklist"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <MaintenanceChecklistBuilder value={field.value || ''} onChange={field.onChange} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function PreviewTabContent() {
  const form = useFormContext<FormValues>()
  const schemaJson = useWatch({ control: form.control, name: 'schemaJson' })
  const lifecycleStates = useWatch({ control: form.control, name: 'lifecycleStates' })
  const maintenanceChecklist = useWatch({ control: form.control, name: 'maintenanceChecklist' })

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
        enumOptions: prop.enum?.join(', ') || undefined,
        catalogCode: prop.catalogCode || undefined,
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

  const checklistTasks = useMemo(() => {
    try {
      const parsed = JSON.parse(maintenanceChecklist || '{}')
      return Array.isArray(parsed.tasks) ? parsed.tasks : []
    } catch {
      return []
    }
  }, [maintenanceChecklist])

  return (
    <TabsContent value="preview" className="flex flex-col gap-6 mt-0 overflow-y-auto">
      <Alert className="bg-muted border-border">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Esta es una vista aproximada de cómo se verá la plantilla para el usuario final.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Atributos del activo</h4>
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

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Checklist de mantenimiento</h4>
        {checklistTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tareas configuradas.</p>
        ) : (
          <ul className="list-decimal list-inside text-sm space-y-1">
            {checklistTasks.map((task: any, idx: number) => (
              <li key={idx}>{task.title || 'Tarea sin nombre'}</li>
            ))}
          </ul>
        )}
      </div>
    </TabsContent>
  )
}

export function AssetTemplateFormSheet({ open, onOpenChange, template }: Props) {
  const queryClient = useQueryClient()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      businessEntityTypeId: '00000000-0000-0000-0000-000000000000',
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

  const errors = Object.keys(form.formState.errors).length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={`${formSheetContentClass} w-full sm:max-w-[95vw]`}>
        <Form {...form}>
          <FormSheetLayout
            onSubmit={form.handleSubmit(onSubmit, (err) => console.log('FORM ERRORS:', err))}
            header={
              <SheetHeader className="p-6 pb-4">
                <SheetTitle>{template ? 'Editar Plantilla' : 'Nueva Plantilla'}</SheetTitle>
                <SheetDescription>
                  Configurá paso a paso los datos básicos, atributos, ciclo de vida y checklist de la
                  plantilla de activo.
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
            {errors && (
              <Alert variant="destructive" className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Revisá los campos marcados en rojo antes de guardar.
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="general" className="flex flex-col flex-1 min-h-0">
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
                <TabsTrigger value="checklist">
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Checklist
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

                <div className="bg-muted/30 rounded-md p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">¿Qué es una plantilla de activo?</p>
                  <p>
                    Es la definición de un tipo de activo (vehículo, herramienta, equipo). Los activos
                    creados con esta plantilla heredarán los atributos, estados y checklist que
                    configures en las siguientes pestañas.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="attributes" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    Los atributos son las características que completarán los usuarios al crear un
                    activo de esta plantilla.
                  </AlertDescription>
                </Alert>
                <SchemaBuilderField />
              </TabsContent>

              <TabsContent value="lifecycle" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    El ciclo de vida define los estados por los que puede pasar un activo y las
                    transiciones permitidas entre ellos.
                  </AlertDescription>
                </Alert>
                <LifecycleCanvasField />
              </TabsContent>

              <TabsContent value="checklist" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    El checklist se utiliza como base para las órdenes de mantenimiento preventivo de
                    los activos de esta plantilla.
                  </AlertDescription>
                </Alert>
                <MaintenanceChecklistField />
              </TabsContent>
              <PreviewTabContent />
            </Tabs>
          </FormSheetLayout>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
