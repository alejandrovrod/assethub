import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
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

const formSchema = (t: TFunction<'maintenance'>) => z.object({
  code: z.string().min(1, t('workflowTemplates.form.validation.codeRequired')).max(50),
  name: z.string().min(1, t('workflowTemplates.form.validation.nameRequired')).max(100),
  type: z.enum(['incident', 'preventive'], { message: t('workflowTemplates.form.validation.typeRequired') }),
  description: z.string().max(500).optional(),
  schemaJson: z.string().refine((val) => {
    if (!val) return true
    try {
      JSON.parse(val)
      return true
    } catch {
      return false
    }
  }, t('workflowTemplates.form.validation.invalidJson')),
  lifecycleStates: z.string().refine((val) => {
    if (!val) return true
    try {
      JSON.parse(val)
      return true
    } catch {
      return false
    }
  }, t('workflowTemplates.form.validation.invalidJson')),
})

type FormValues = z.infer<ReturnType<typeof formSchema>>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId?: string
  onSuccess?: () => void
}

export function WorkflowTemplateFormSheet({ open, onOpenChange, templateId, onSuccess }: Props) {
  const { t } = useTranslation(['maintenance', 'common'])
  const queryClient = useQueryClient()

  const { data: template, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['workflow-template', templateId],
    queryFn: () => WorkflowTemplateService.getById(templateId!),
    enabled: !!templateId && open,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema(t)),
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
      toast.success(t('workflowTemplates.toast.created'))
      onSuccess?.()
    },
    onError: () => toast.error(t('workflowTemplates.toast.createError')),
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => WorkflowTemplateService.update(templateId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-template', templateId] })
      toast.success(t('workflowTemplates.toast.updated'))
      onSuccess?.()
    },
    onError: () => toast.error(t('workflowTemplates.toast.updateError')),
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
      <SheetContent className="sm:max-w-[1200px] w-[95vw] flex flex-col p-0" aria-describedby={undefined}>
        <div className="p-6 pb-2 border-b shrink-0">
          <SheetHeader>
            <SheetTitle>{templateId ? t('workflowTemplates.form.editTitle') : t('workflowTemplates.form.createTitle')}</SheetTitle>
            <SheetDescription>
              {t('workflowTemplates.form.description')}
            </SheetDescription>
          </SheetHeader>
        </div>

        {isLoadingTemplate ? (
          <div className="flex-1 flex items-center justify-center">
            {t('workflowTemplates.form.loading')}
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">
                {errors && (
                  <Alert variant="destructive" className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      {t('workflowTemplates.form.reviewFields')}
                    </AlertDescription>
                  </Alert>
                )}

                <Tabs defaultValue="general" className="flex flex-col">
                  <TabsList className="self-start mb-4 flex-wrap h-auto">
                    <TabsTrigger value="general">
                      <FileText className="h-4 w-4 mr-2" />
                      {t('common:labels.general')}
                    </TabsTrigger>
                    <TabsTrigger value="attributes">
                      <List className="h-4 w-4 mr-2" />
                      {t('workflowTemplates.form.tabAttributes')}
                    </TabsTrigger>
                    <TabsTrigger value="lifecycle">
                      <GitBranch className="h-4 w-4 mr-2" />
                      {t('workflowTemplates.form.tabLifecycle')}
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="h-4 w-4 mr-2" />
                      {t('workflowTemplates.form.tabPreview')}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="flex flex-col gap-6 mt-0">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('common:labels.code')}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('workflowTemplates.form.codePlaceholder')}
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
                            <FormLabel>{t('common:labels.name')}</FormLabel>
                            <FormControl>
                              <Input placeholder={t('workflowTemplates.form.namePlaceholder')} {...field} />
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
                          <FormLabel>{t('workflowTemplates.form.workflowType')}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="incident">{t('detail.related.incident')}</SelectItem>
                              <SelectItem value="preventive">{t('workflowTemplates.form.typePreventive')}</SelectItem>
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
                          <FormLabel>{t('common:labels.description')}</FormLabel>
                          <FormControl>
                            <Textarea placeholder={t('workflowTemplates.form.descriptionPlaceholder')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-muted/30 rounded-md p-4 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">{t('workflowTemplates.form.whatIsTitle')}</p>
                      <p>
                        {t('workflowTemplates.form.whatIsBody')}
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="attributes" className="flex flex-col gap-6 mt-0">
                    <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertDescription>
                        {t('workflowTemplates.form.attributesAlert')}
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
                        {t('workflowTemplates.form.lifecycleAlert')}
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
                        {t('workflowTemplates.form.previewAlert')}
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{t('workflowTemplates.form.attributesSectionTitle')}</h4>
                      {previewFields.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('detail.noAttributes')}</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {previewFields.map((field) => (
                            <SchemaFieldPreview key={field.keyName} field={field} />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{t('workflowTemplates.form.lifecycleSectionTitle')}</h4>
                      {lifecycleSummary.states.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('workflowTemplates.form.noStates')}</p>
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
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? t('form.saving') : t('workflowTemplates.form.saveTemplate')}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  )
}
