import { useEffect, useState, useMemo } from 'react'
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
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, Tag, Box, ClipboardList } from 'lucide-react'
import { incidentService } from '@/services/incident.service'
import { incidentTemplateService } from '@/services/incident-template.service'
import { assetService } from '@/services/asset.service'
import { toast } from 'sonner'
import FormSchema from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'

const formSchema = z.object({
  title: z.string().min(1, 'Título es requerido').max(200),
  description: z.string().optional(),
  assetId: z.string().min(1, 'Activo es requerido'),
  incidentTemplateId: z.string().min(1, 'Plantilla es requerida'),
  typeId: z.string().optional(),
  priorityId: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (id: string) => void
}

export function ReportIncidentSheet({ open, onOpenChange, onSuccess }: Props) {
  const queryClient = useQueryClient()
  
  const [schemaData, setSchemaData] = useState<any>({})

  const { data: assets } = useQuery({
    queryKey: ['assets-summary'],
    queryFn: () => assetService.getAssets(),
    enabled: open,
  })

  const { data: templates } = useQuery({
    queryKey: ['incident-templates'],
    queryFn: () => incidentTemplateService.search(undefined, false),
    enabled: open,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      assetId: '',
      incidentTemplateId: '',
      typeId: '00000000-0000-0000-0000-000000000000', // Mock UUIDs
      priorityId: '00000000-0000-0000-0000-000000000000',
    },
  })

  const selectedTemplateId = form.watch('incidentTemplateId')

  const { data: selectedTemplate } = useQuery({
    queryKey: ['incident-template', selectedTemplateId],
    queryFn: () => incidentTemplateService.getById(selectedTemplateId),
    enabled: !!selectedTemplateId,
  })

  const schema = useMemo(() => {
    if (!selectedTemplate?.schemaJson) return null
    try {
      return JSON.parse(selectedTemplate.schemaJson)
    } catch {
      return null
    }
  }, [selectedTemplate])

  useEffect(() => {
    if (open) {
      form.reset()
      setSchemaData({})
    }
  }, [open, form])

  const reportMutation = useMutation({
    mutationFn: incidentService.report,
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      toast.success('Incidencia reportada exitosamente')
      onSuccess?.(id)
    },
    onError: () => toast.error('Error al reportar la incidencia')
  })

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      typeId: values.typeId || '00000000-0000-0000-0000-000000000000',
      priorityId: values.priorityId || '00000000-0000-0000-0000-000000000000',
      propertiesJson: Object.keys(schemaData).length > 0 ? JSON.stringify(schemaData) : undefined,
      attachments: [],
    }

    reportMutation.mutate(payload)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[700px] w-[95vw] flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-md">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-xl">Reportar Incidencia</SheetTitle>
              <SheetDescription>
                Creá una nueva incidencia asignada a un activo.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
            <ScrollArea className="flex-1 p-6">
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
              <FormField
                control={form.control}
                name="assetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-muted-foreground">
                      <Box className="h-4 w-4" />
                      Activo
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Seleccione un activo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {assets?.map((asset: any) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.name} ({asset.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="incidentTemplateId"
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
                <div className="p-4 rjsf-theme-default">
                  <FormSchema
                    schema={schema}
                    validator={validator}
                    formData={schemaData}
                    onChange={(e) => setSchemaData(e.formData)}
                    children={<></>} // Hide default submit button
                  />
                </div>
              </Card>
            )}
              </div>
            </ScrollArea>

            <div className="p-6 border-t bg-background mt-auto flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={reportMutation.isPending} className="min-w-[150px]">
                {reportMutation.isPending ? 'Guardando...' : 'Reportar Incidencia'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
