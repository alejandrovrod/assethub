import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FormSheetLayout } from '@/components/form-sheet-layout'
import { CustomHtmlEditor } from '@/components/custom-html-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { communicationTemplateService } from '@/services/communication-template.service'
import type { CommunicationEntityScope } from '@/services/communication-template.service'
import { handleServerError } from '@/lib/handle-server-error'

const formSheetContentClass = 'flex flex-col p-0 h-full gap-0 overflow-hidden'

const translationSchema = z.object({
  locale: z.string().min(2, 'Idioma obligatorio (ej. es, en)'),
  subject: z.string().optional(),
  content: z.string().optional(),
  designJson: z.string().optional(),
})

const formSchema = z.object({
  code: z
    .string()
    .min(1, 'El código es obligatorio')
    .regex(/^[A-Z0-9-]+$/, 'Solo mayúsculas, números y guiones'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  entityScope: z.enum(['incident', 'maintenanceOrder', 'workTask', 'asset']),
  templateType: z.enum(['email', 'document']),
  translations: z.array(translationSchema).min(1, 'Agregá al menos un idioma'),
})

type FormValues = z.infer<typeof formSchema>

const VARIABLE_HINTS: Record<CommunicationEntityScope, string[]> = {
  incident: ['incident.title', 'incident.priority', 'incident.state', 'asset.name', 'recipient.name'],
  maintenanceOrder: ['order.id', 'order.title', 'order.kind', 'order.state', 'asset.name', 'asset.code', 'recipient.name'],
  workTask: ['task.id', 'task.title', 'task.state', 'task.type', 'task.priority', 'asset.name', 'recipient.name'],
  asset: ['asset.name', 'asset.code', 'asset.state', 'recipient.name'],
}

const SCOPE_LABELS: Record<CommunicationEntityScope, string> = {
  incident: 'Incidencia',
  maintenanceOrder: 'Orden de Mantenimiento',
  workTask: 'Tarea de Trabajo',
  asset: 'Activo',
}

interface TranslationFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
}

export function CommunicationTemplateFormSheet({
  open,
  onOpenChange,
  templateId,
}: TranslationFormSheetProps) {
  const queryClient = useQueryClient()
  const [activeLocaleTab, setActiveLocaleTab] = useState('es')
  const [createNewVersion, setCreateNewVersion] = useState(false)

  const isEditing = templateId !== null

  const { data: detail } = useQuery({
    queryKey: ['communication-template', templateId],
    queryFn: () => communicationTemplateService.getTemplateById(templateId!),
    enabled: open && isEditing,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      entityScope: 'maintenanceOrder',
      templateType: 'email',
      translations: [{ locale: 'es', subject: '', content: '', designJson: '' }],
    },
  })

  useEffect(() => {
    if (open && isEditing && detail) {
      setCreateNewVersion(false)
      const active = detail.versions.find((v) => v.id === detail.activeVersionId)
      form.reset({
        code: detail.code,
        name: detail.name,
        entityScope: detail.entityScope,
        templateType: detail.templateType,
        translations:
          active?.translations.map((t) => ({
            locale: t.locale,
            subject: t.subject ?? '',
            content: t.content,
            designJson: t.designJson ?? '',
          })) ?? [{ locale: 'es', subject: '', content: '', designJson: '' }],
      })
      if (active?.translations[0]) {
        setActiveLocaleTab(active.translations[0].locale)
      }
    } else if (open && !isEditing) {
      form.reset({
        code: '',
        name: '',
        entityScope: 'maintenanceOrder',
        templateType: 'email',
        translations: [{ locale: 'es', subject: '', content: '', designJson: '' }],
      })
      setActiveLocaleTab('es')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, detail])

  const formValues = form.watch()
  const translations = formValues.translations || []
  const templateType = formValues.templateType
  const entityScope = formValues.entityScope


  const createMutation = useMutation({
    mutationFn: communicationTemplateService.createTemplate,
    onSuccess: () => {
      toast.success('Plantilla creada exitosamente')
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
      onOpenChange(false)
    },
    onError: (error) => handleServerError({ error }),
  })

  const addVersionMutation = useMutation({
    mutationFn: (values: FormValues) =>
      communicationTemplateService.addVersion(templateId!, {
        translations: values.translations.map((t) => ({
          locale: t.locale,
          subject: values.templateType === 'email' ? t.subject || null : null,
          content: t.content ?? '',
          designJson: templateType === 'email' ? t.designJson : undefined,
        })),
      }),
    onSuccess: () => {
      toast.success('Nueva versión creada exitosamente')
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
      queryClient.invalidateQueries({ queryKey: ['communication-template'] })
      onOpenChange(false)
    },
    onError: (error) => handleServerError({ error }),
  })


  const updateVersionMutation = useMutation({
    mutationFn: (values: FormValues) =>
      communicationTemplateService.updateVersion(templateId!, detail!.activeVersionId!, {
        translations: values.translations.map((t) => ({
          locale: t.locale,
          subject: values.templateType === 'email' ? t.subject || null : null,
          content: t.content ?? '',
          designJson: templateType === 'email' ? t.designJson : undefined,
        })),
      }),
    onSuccess: () => {
      toast.success('Versión actualizada exitosamente')
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
      queryClient.invalidateQueries({ queryKey: ['communication-template'] })
      onOpenChange(false)
    },
    onError: (error) => handleServerError({ error }),
  })

  const variables = useMemo(
    () => VARIABLE_HINTS[entityScope] ?? [],
    [entityScope]
  )

  const addLocale = () => {
    const current = form.getValues('translations')
    const used = new Set(current.map((t) => t.locale))
    const next = ['en', 'pt', 'fr', 'de', 'it'].find((l) => !used.has(l)) ?? 'en'
    form.setValue('translations', [
      ...current,
      { locale: next, subject: '', content: '', designJson: '' },
    ])
    setActiveLocaleTab(next)
  }

  const removeLocale = (locale: string) => {
    const current = form.getValues('translations')
    if (current.length <= 1) return
    form.setValue(
      'translations',
      current.filter((t) => t.locale !== locale)
    )
    if (activeLocaleTab === locale) {
      setActiveLocaleTab(current.filter((t) => t.locale !== locale)[0].locale)
    }
  }

  const onSubmit = (values: FormValues, action: 'create' | 'update_version' | 'new_version' = 'create') => {
    if (isEditing) {
      if (action === 'update_version') {
        updateVersionMutation.mutate(values)
      } else {
        addVersionMutation.mutate(values)
      }
    } else {
      createMutation.mutate({
        ...values,
        translations: values.translations.map((t) => ({
          locale: t.locale,
          subject: values.templateType === 'email' ? t.subject || null : null,
          content: t.content ?? '',
          designJson: templateType === 'email' ? t.designJson : undefined,
        })),
      })
    }
  }

  const isPending = createMutation.isPending || addVersionMutation.isPending || updateVersionMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={formSheetContentClass + ' w-[95vw] sm:max-w-6xl'}>
        <FormSheetLayout
          onSubmit={(e) => { e.preventDefault(); }}
          header={
            <SheetHeader className="p-6 pb-4 border-b">
              <SheetTitle>
                {isEditing
                  ? `Editar — ${detail?.name ?? ''}`
                  : 'Nueva Plantilla de Comunicación'}
              </SheetTitle>
            </SheetHeader>
          }
          footer={
            <div className="flex justify-end gap-2 border-t p-4 bg-background">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              {!isEditing ? (
                <Button type="button" onClick={form.handleSubmit((v) => onSubmit(v, 'create'))} disabled={isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear plantilla
                </Button>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="new-version-switch"
                      checked={createNewVersion}
                      onCheckedChange={setCreateNewVersion}
                    />
                    <Label htmlFor="new-version-switch" className="text-sm font-normal cursor-pointer select-none">
                      Guardar como versión nueva
                    </Label>
                  </div>
                  <Button 
                    type="button" 
                    onClick={form.handleSubmit((v) => onSubmit(v, createNewVersion ? 'new_version' : 'update_version'))} 
                    disabled={isPending || (!createNewVersion && !detail?.activeVersionId)}
                  >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {createNewVersion ? 'Crear Nueva Versión' : 'Guardar'}
                  </Button>
                </div>
              )}
            </div>
          }
        >
          <Form {...form}>
            <div className="flex flex-col h-full">
              {/* Top Configuration Bar */}
              <div className="flex flex-col gap-4 p-6 border-b shrink-0 bg-muted/20">
                {Object.keys(form.formState.errors).length > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Revisá los campos marcados: hay errores de validación.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="ORDER-CREATED"
                            disabled={isEditing}
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
                          <Input placeholder="Orden de mantenimiento creada" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="entityScope"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ámbito</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isEditing}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(Object.keys(SCOPE_LABELS) as CommunicationEntityScope[]).map(
                              (s) => (
                                <SelectItem key={s} value={s}>
                                  {SCOPE_LABELS[s]}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="templateType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isEditing}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="document">Documento</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 min-h-0 p-6 pt-4 flex flex-col">
                <Tabs value={activeLocaleTab} onValueChange={setActiveLocaleTab} className="flex flex-col h-full">
                  <div className="flex items-center gap-2 shrink-0 border-b pb-2">
                    <TabsList>
                      {translations.map((t) => (
                        <TabsTrigger key={t.locale} value={t.locale}>
                          <span className="uppercase">{t.locale}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLocale}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Idioma
                    </Button>
                    {translations.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLocale(activeLocaleTab)}
                      >
                        <Trash2 className="mr-1 h-4 w-4 text-destructive" />
                        Quitar
                      </Button>
                    )}
                  </div>

                  {translations.map((t, idx) => (
                    <TabsContent
                      key={t.locale}
                      value={t.locale}
                      className="flex-1 min-h-0 mt-4 flex flex-col gap-4"
                    >
                      {templateType === 'email' && (
                        <FormField
                          control={form.control}
                          name={`translations.${idx}.subject`}
                          render={({ field }) => (
                            <FormItem className="shrink-0">
                              <FormLabel>Asunto ({t.locale})</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Nueva orden {{order.title}}"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      
                      <div className="flex-1 min-h-0 flex gap-4">
                        {/* Editor Side */}
                        <div className="flex-1 flex flex-col gap-4">

                                <FormField
                                    control={form.control}
                                    name={`translations.${idx}.designJson`}
                                    render={({ field }) => (
                                    <FormItem className="flex-1 min-h-0 flex flex-col">
                                        <FormControl>
                                        {templateType === 'email' ? (
                                            <div className="flex-1 flex flex-col">
                                                <CustomHtmlEditor
                                                    value={field.value || ''}
                                                    variables={variables}
                                                    onChange={(html) => {
                                                        field.onChange(html)
                                                        form.setValue(`translations.${idx}.content`, html)
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <FormField
                                                control={form.control}
                                                name={`translations.${idx}.content`}
                                                render={({ field: contentField }) => (
                                                    <Textarea
                                                        className="flex-1 min-h-[300px] font-mono text-sm resize-none"
                                                        placeholder="Escribí el texto acá..."
                                                        {...contentField}
                                                    />
                                                )}
                                            />
                                        )}
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </div>
          </Form>
        </FormSheetLayout>
      </SheetContent>
    </Sheet>
  )
}
