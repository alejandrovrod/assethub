import { useEffect, useMemo, useState } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { assetTemplateService } from '@/services/asset-template.service'
import { toast } from 'sonner'
import { SchemaBuilder } from './schema-builder'
import { LifecycleCanvas } from './lifecycle-canvas'
import { MaintenanceChecklistBuilder } from './maintenance-checklist-builder'
import { SchemaFieldPreview, type SchemaFieldDefinition } from './schema-field-preview'
import { FormSheetLayout, formSheetContentClass } from '@/components/form-sheet-layout'
import { Info, FileText, List, GitBranch, CheckSquare, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

type PreviewField = SchemaFieldDefinition & { tab: string; section?: string }

const formSchema = z.object({
  code: z.string().min(1, { error: () => i18n.t('assets:validation.codeRequired') }).max(50),
  name: z.string().min(1, { error: () => i18n.t('assets:validation.nameRequired') }).max(100),
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
  }, { error: () => i18n.t('assets:validation.invalidJson') }),
  lifecycleStates: z.string().refine((val) => {
    if (!val) return true
    try {
      JSON.parse(val)
      return true
    } catch {
      return false
    }
  }, { error: () => i18n.t('assets:validation.invalidJson') }),
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
  const { t } = useTranslation(['assets', 'common'])
  const form = useFormContext<FormValues>()
  const schemaJson = useWatch({ control: form.control, name: 'schemaJson' })
  const lifecycleStates = useWatch({ control: form.control, name: 'lifecycleStates' })
  const maintenanceChecklist = useWatch({ control: form.control, name: 'maintenanceChecklist' })
  const [activePreviewTab, setActivePreviewTab] = useState<string | null>(null)

  const preview = useMemo(() => {
    try {
      const schema = JSON.parse(schemaJson || '{}')
      const allProps = { ...(schema.properties || {}) }
      
      if (schema.dependencies) {
        Object.values(schema.dependencies).forEach((config: any) => {
          if (config.oneOf) {
            config.oneOf.forEach((opt: any) => {
              if (opt.properties) {
                // Do not include the parent condition field itself, just the dependent ones
                Object.entries(opt.properties).forEach(([k, propDef]: [string, any]) => {
                  if (k !== Object.keys(opt.properties)[0]) { // The first key is usually the parent condition
                    allProps[k] = propDef
                  }
                })
              }
            })
          }
        })
      }

      const rawFields: PreviewField[] = Object.entries(allProps).map(([key, prop]: [string, any]) => ({
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
        tab: typeof prop.tab === 'string' && prop.tab.trim() ? prop.tab.trim() : 'General',
        section: typeof prop.section === 'string' && prop.section.trim() ? prop.section.trim() : undefined,
      }))
      
      // Filter out duplicate fields (because multiple catch blocks might define the same field logic)
      const fields = Array.from(new Map(rawFields.map(f => [f.keyName, f])).values())
      // Tab order: x-form-tabs metadata first, then first appearance in properties.
      const tabs: string[] = []
      const pushTab = (t: string) => { if (t && !tabs.includes(t)) tabs.push(t) }
      const xTabs = Array.isArray(schema['x-form-tabs']) ? schema['x-form-tabs'] : []
      xTabs.forEach((t: unknown) => { if (typeof t === 'string') pushTab(t.trim()) })
      fields.forEach((f) => pushTab(f.tab))
      if (tabs.length === 0) tabs.push('General')
      return { fields, tabs }
    } catch {
      return { fields: [] as PreviewField[], tabs: [] as string[] }
    }
  }, [schemaJson])

  const previewFields = preview.fields

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

  const renderPreviewGroup = (group: PreviewField[]) => {
    const sectionless = group.filter((f) => !f.section)
    const sectionOrder: string[] = []
    group.forEach((f) => {
      if (f.section && !sectionOrder.includes(f.section)) sectionOrder.push(f.section)
    })
    return (
      <div className="space-y-4">
        {sectionless.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionless.map((f) => (
              <SchemaFieldPreview key={f.keyName} field={f} />
            ))}
          </div>
        )}
        {sectionOrder.map((section) => (
          <div key={section}>
            <h5 className="text-sm font-semibold">{section}</h5>
            <Separator className="my-2" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group
                .filter((f) => f.section === section)
                .map((f) => (
                  <SchemaFieldPreview key={f.keyName} field={f} />
                ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const previewTabValue =
    activePreviewTab && preview.tabs.includes(activePreviewTab) ? activePreviewTab : preview.tabs[0]

  return (
    <TabsContent value="preview" className="flex flex-col gap-6 mt-0 overflow-y-auto">
      <Alert className="bg-muted border-border">
        <Info className="h-4 w-4" />
        <AlertDescription>
          {t('preview.approximateView')}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t('preview.assetAttributes')}</h4>
        {previewFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.noAttributes')}</p>
        ) : preview.tabs.length >= 2 ? (
          <Tabs value={previewTabValue} onValueChange={setActivePreviewTab}>
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
              {preview.tabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="h-auto px-3 py-1.5">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
            {preview.tabs.map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-3">
                {renderPreviewGroup(preview.fields.filter((f) => f.tab === tab))}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          renderPreviewGroup(preview.fields)
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t('preview.lifecycle')}</h4>
        {lifecycleSummary.states.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.noStates')}</p>
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
        <h4 className="text-sm font-semibold">{t('preview.maintenanceChecklist')}</h4>
        {checklistTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.noTasks')}</p>
        ) : (
          <ul className="list-decimal list-inside text-sm space-y-1">
            {checklistTasks.map((task: any, idx: number) => (
              <li key={idx}>{task.title || t('preview.untitledTask')}</li>
            ))}
          </ul>
        )}
      </div>
    </TabsContent>
  )
}

export function AssetTemplateFormSheet({ open, onOpenChange, template }: Props) {
  const { t } = useTranslation(['assets', 'common'])
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

  const normalizeLifecycleStates = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson || '{}')
      if (!parsed.initialState) {
        const stateKeys = Object.keys(parsed.states || parsed.transitions || {})
        if (stateKeys.length > 0) {
          parsed.initialState = stateKeys[0]
        } else {
          parsed.initialState = 'Active'
        }
      }
      return parsed
    } catch {
      return { initialState: 'Active', transitions: {}, states: {} }
    }
  }

  const createMutation = useMutation({
    mutationFn: assetTemplateService.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success(t('toast.templateCreated'))
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.detail || t('toast.templateCreateError')
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      assetTemplateService.updateTemplate(template.id, {
        name: data.name,
        description: data.description || '',
        schemaJson: data.schemaJson,
        allowedChildTemplateIds: [],
        lifecycleStates: normalizeLifecycleStates(data.lifecycleStates),
        maintenanceChecklist: data.maintenanceChecklist || '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success(t('toast.templateUpdated'))
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.detail || t('toast.templateUpdateError')
      toast.error(msg)
    },
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
        lifecycleStates: normalizeLifecycleStates(data.lifecycleStates),
        maintenanceChecklist: data.maintenanceChecklist || '',
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
                <SheetTitle>{template ? t('form.editTemplate') : t('form.newTemplate')}</SheetTitle>
                <SheetDescription>
                  {t('form.templateDescription')}
                </SheetDescription>
              </SheetHeader>
            }
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? t('form.saving') : t('form.saveTemplate')}
                </Button>
              </>
            }
          >
            {errors && (
              <Alert variant="destructive" className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {t('form.checkMarkedFields')}
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="general" className="flex flex-col flex-1 min-h-0">
              <TabsList className="self-start mb-4 flex-wrap h-auto">
                <TabsTrigger value="general">
                  <FileText className="h-4 w-4 mr-2" />
                  {t('tabs.general')}
                </TabsTrigger>
                <TabsTrigger value="attributes">
                  <List className="h-4 w-4 mr-2" />
                  {t('form.tabAttributes')}
                </TabsTrigger>
                <TabsTrigger value="lifecycle">
                  <GitBranch className="h-4 w-4 mr-2" />
                  {t('form.tabLifecycle')}
                </TabsTrigger>
                <TabsTrigger value="checklist">
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {t('form.tabChecklist')}
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-2" />
                  {t('form.tabPreview')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="flex flex-col gap-6 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.code')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('form.templateCodePlaceholder')}
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
                        <FormLabel>{t('fields.name')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('form.templateNamePlaceholder')} {...field} />
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
                      <FormLabel>{t('table.headers.description')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('form.descriptionPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-muted/30 rounded-md p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">{t('form.whatIsTemplateTitle')}</p>
                  <p>
                    {t('form.whatIsTemplateBody')}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="attributes" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    {t('form.attributesAlert')}
                  </AlertDescription>
                </Alert>
                <SchemaBuilderField />
              </TabsContent>

              <TabsContent value="lifecycle" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    {t('form.lifecycleAlert')}
                  </AlertDescription>
                </Alert>
                <LifecycleCanvasField />
              </TabsContent>

              <TabsContent value="checklist" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    {t('form.checklistAlert')}
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
