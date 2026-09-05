import { useEffect, useState } from 'react'
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
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, Tag, Box, ClipboardList } from 'lucide-react'
import { incidentService } from '@/services/incident.service'
import { WorkflowTemplateService } from '@/services/workflow-template.service'
import { assetService } from '@/services/asset.service'
import { toast } from 'sonner'
import { usePropagatedProperties } from '@/hooks/use-propagated-properties'
import FormSchema from '@rjsf/core'
import { customValidator as validator } from '@/lib/rjsf-validator'
import { useResolvedSchema } from '@/hooks/use-resolved-schema'
import { FileUploadWidget } from '@/components/widgets/FileUploadWidget'
import { EmployeeSelectWidget } from '@/components/widgets/EmployeeSelectWidget'
import { TeamSelectWidget } from '@/components/widgets/TeamSelectWidget'
import { FormSheetLayout, formSheetContentClass } from '@/components/form-sheet-layout'
import { cn } from '@/lib/utils'

const formSchema = z.object({
  title: z.string().min(1, 'Título es requerido').max(200),
  description: z.string().optional(),
  assetId: z.string().min(1, 'Activo es requerido'),
  WorkflowTemplateId: z.string().min(1, 'Plantilla es requerida'),
  typeId: z.string().optional(),
  priorityId: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (id: string) => void
  assetId?: string
  hideAssetSelector?: boolean
  targetAssetState?: string
  title?: string
  description?: string
}

export function ReportIncidentSheet({ open, onOpenChange, onSuccess, assetId, hideAssetSelector, targetAssetState, title, description }: Props) {
  const queryClient = useQueryClient()
  
  const [schemaData, setSchemaData] = useState<any>({})

  const [assetLabel, setAssetLabel] = useState<string>('')


  const { data: templates } = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: () => WorkflowTemplateService.search(undefined, false),
    enabled: open,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      assetId: assetId ?? '',
      WorkflowTemplateId: '',
      typeId: '00000000-0000-0000-0000-000000000000', // Mock UUIDs
      priorityId: '00000000-0000-0000-0000-000000000000',
    },
  })

  const selectedTemplateId = form.watch('WorkflowTemplateId')

  const { data: selectedAsset } = useQuery({
    queryKey: ['asset', form.watch('assetId')],
    queryFn: () => assetService.getAssetById(form.watch('assetId')),
    enabled: !!form.watch('assetId'),
  })

  useEffect(() => {
    if (selectedAsset) {
      setAssetLabel(`${selectedAsset.code} - ${selectedAsset.name}`)
    }
  }, [selectedAsset])

  const { data: selectedTemplate } = useQuery({
    queryKey: ['workflow-template', selectedTemplateId],
    queryFn: () => WorkflowTemplateService.getById(selectedTemplateId),
    enabled: !!selectedTemplateId,
  })

  const { schema, uiSchema, isResolving } = useResolvedSchema(selectedTemplate?.schemaJson || '{}')

  const effectiveAssetId = form.watch('assetId') || assetId
  const { propagatedPropertiesJson } = usePropagatedProperties(effectiveAssetId)

  useEffect(() => {
    if (open) {
      form.reset({
        title: '',
        description: '',
        assetId: assetId ?? '',
        WorkflowTemplateId: '',
        typeId: '00000000-0000-0000-0000-000000000000',
        priorityId: '00000000-0000-0000-0000-000000000000',
      })
      setSchemaData({})
    }
  }, [open, form, assetId])

  // Pre-fill schemaData when template schema or propagated properties are loaded
  useEffect(() => {
    if (!selectedTemplate?.schemaJson) return
    try {
      const templateSchema = JSON.parse(selectedTemplate.schemaJson)
      if (!templateSchema.properties) return

      const assetProps = propagatedPropertiesJson ? JSON.parse(propagatedPropertiesJson) : {}
      const assetSchema = selectedAsset?.schemaJson ? JSON.parse(selectedAsset.schemaJson) : null

      setSchemaData((prev: any) => {
        const next = { ...prev }
        for (const tKey of Object.keys(templateSchema.properties)) {
          if (next[tKey] !== undefined && next[tKey] !== '') continue
          const tProp = templateSchema.properties[tKey]

          // 1. Direct key match
          if (assetProps[tKey] !== undefined) {
            next[tKey] = assetProps[tKey]
            continue
          }

          // 2. Match by catalogCode or title from asset schema
          if (assetSchema?.properties) {
            for (const aKey of Object.keys(assetSchema.properties)) {
              const aProp = assetSchema.properties[aKey]
              const hasSameCatalog = tProp.catalogCode && aProp.catalogCode && tProp.catalogCode === aProp.catalogCode
              const hasSameTitle = tProp.title && aProp.title && tProp.title.toLowerCase().trim() === aProp.title.toLowerCase().trim()
              if ((hasSameCatalog || hasSameTitle) && assetProps[aKey] !== undefined) {
                next[tKey] = assetProps[aKey]
                break
              }
            }
          }
        }
        return next
      })
    } catch (e) {
      console.error('Error prefilling incident template properties', e)
    }
  }, [selectedTemplate, propagatedPropertiesJson, selectedAsset])

  const reportMutation = useMutation({
    mutationFn: incidentService.report,
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      if (assetId) {
        queryClient.invalidateQueries({ queryKey: ['asset', assetId] })
        queryClient.invalidateQueries({ queryKey: ['incidents', 'asset', assetId] })
        queryClient.invalidateQueries({ queryKey: ['assets'] })
      }
      toast.success('Incidencia reportada exitosamente')
      onSuccess?.(id)
    },
    onError: () => toast.error('Error al reportar la incidencia')
  })

  const onSubmit = (values: FormValues) => {
    const filteredProps: Record<string, any> = {}
    if (schema?.properties) {
      for (const key of Object.keys(schema.properties)) {
        if (schemaData[key] !== undefined) {
          filteredProps[key] = schemaData[key]
        }
      }
    } else {
      Object.assign(filteredProps, schemaData)
    }

    const payload = {
      ...values,
      typeId: values.typeId || '00000000-0000-0000-0000-000000000000',
      priorityId: values.priorityId || '00000000-0000-0000-0000-000000000000',
      propertiesJson: Object.keys(filteredProps).length > 0 ? JSON.stringify(filteredProps) : undefined,
      targetAssetState,
      attachments: [],
    }

    reportMutation.mutate(payload)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn(formSheetContentClass, "sm:max-w-[700px] w-[95vw]")}>
        <Form {...form}>
          <FormSheetLayout
            onSubmit={form.handleSubmit(onSubmit)}
            header={
              <SheetHeader className="px-6 py-4 bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 text-primary rounded-md">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <SheetTitle className="text-xl">{title ?? 'Reportar Incidencia'}</SheetTitle>
                    <SheetDescription>
                      {description ?? 'Creá una nueva incidencia asignada a un activo.'}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
            }
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={reportMutation.isPending} className="min-w-[150px]">
                  {reportMutation.isPending ? 'Guardando...' : 'Reportar Incidencia'}
                </Button>
              </>
            }
          >
            <div className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Resumen del problema" {...field} />
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
                    <Textarea placeholder="Detalles de la incidencia..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-6">
              {!hideAssetSelector ? (
                <FormField
                  control={form.control}
                  name="assetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-muted-foreground">
                        <Box className="h-4 w-4" />
                        Activo
                      </FormLabel>
                      <FormControl>
                        <AsyncCombobox<{ id: string; name: string; code: string }>
                          fetcher={async (query) => {
                            const result = await assetService.getAssets(query || undefined)
                            return result.items.map((a: any) => ({ id: a.id, name: a.name, code: a.code }))
                          }}
                          labelKey="name"
                          valueKey="id"
                          placeholder="Seleccione un activo"
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
                              className="w-full justify-between font-normal bg-background h-10"
                            >
                              {assetLabel || 'Seleccione un activo'}
                              <Box className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="assetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-muted-foreground">
                        <Box className="h-4 w-4" />
                        Activo
                      </FormLabel>
                      <FormControl>
                        <Input value={assetLabel || field.value} disabled />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="WorkflowTemplateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-muted-foreground">
                      <Tag className="h-4 w-4" />
                      Plantilla (Tipo)
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccione una plantilla" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {templates?.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {schema && (
              <Card className="mt-8 overflow-hidden border-primary/20 bg-muted/20">
                <div className="bg-primary/5 px-4 py-3 border-b border-primary/10 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-primary">Propiedades Adicionales</h4>
                </div>
                <div className="p-4 rjsf-tailwind">
                  {isResolving ? (
                    <div className="text-sm text-muted-foreground">Cargando catálogos...</div>
                  ) : (
                    <FormSchema 
                      schema={schema} 
                      uiSchema={uiSchema}
                      validator={validator} 
                      formData={schemaData} 
                      onChange={e => setSchemaData(e.formData)} 
                      widgets={{ 
                        FileWidget: FileUploadWidget,
                        EmployeeSelectWidget,
                        TeamSelectWidget
                      }}
                      tagName="div"
                      children={<></>}
                    />
                  )}
                </div>
              </Card>
            )}
            </div>
          </FormSheetLayout>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
