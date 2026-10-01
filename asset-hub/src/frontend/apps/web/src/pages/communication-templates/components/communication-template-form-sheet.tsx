import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { TFunction } from 'i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useTranslation } from 'react-i18next'

const formSheetContentClass = 'flex flex-col p-0 h-full gap-0 overflow-hidden'

const formSchema = (t: TFunction<'communication'>) => {
  const translationSchema = z.object({
    locale: z.string().min(2, t('form.validation.localeRequired')),
    subject: z.string().optional(),
    content: z.string().optional(),
    designJson: z.string().optional(),
  })

  return z.object({
    code: z
      .string()
      .min(1, t('form.validation.codeRequired'))
      .regex(/^[A-Z0-9-]+$/, t('form.validation.codeFormat')),
    name: z.string().min(1, t('form.validation.nameRequired')),
    entityScope: z.enum(['incident', 'maintenanceOrder', 'workTask', 'asset']),
    templateType: z.enum(['email', 'document']),
    translations: z.array(translationSchema).min(1, t('form.validation.minLocale')),
  })
}

type FormValues = z.infer<ReturnType<typeof formSchema>>

const VARIABLE_HINTS: Record<CommunicationEntityScope, string[]> = {
  incident: ['incident.title', 'incident.priority', 'incident.state', 'asset.name', 'recipient.name'],
  maintenanceOrder: ['order.id', 'order.title', 'order.kind', 'order.state', 'asset.name', 'asset.code', 'recipient.name'],
  workTask: ['task.id', 'task.title', 'task.state', 'task.type', 'task.priority', 'asset.name', 'recipient.name'],
  asset: ['asset.name', 'asset.code', 'asset.state', 'recipient.name'],
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
  const { t } = useTranslation(['communication', 'common'])
  const [activeLocaleTab, setActiveLocaleTab] = useState('es')
  const [createNewVersion, setCreateNewVersion] = useState(false)
  const [testEmailOpen, setTestEmailOpen] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  const isEditing = templateId !== null

  const { data: detail } = useQuery({
    queryKey: ['communication-template', templateId],
    queryFn: () => communicationTemplateService.getTemplateById(templateId!),
    enabled: open && isEditing,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema(t)),
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
          active?.translations.map((tr) => ({
            locale: tr.locale,
            subject: tr.subject ?? '',
            content: tr.content,
            designJson: tr.designJson ?? '',
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

  const scopeLabels: Record<CommunicationEntityScope, string> = {
    incident: t('form.scopeOptions.incident'),
    maintenanceOrder: t('form.scopeOptions.maintenanceOrder'),
    workTask: t('form.scopeOptions.workTask'),
    asset: t('form.scopeOptions.asset'),
  }


  const createMutation = useMutation({
    mutationFn: communicationTemplateService.createTemplate,
    onSuccess: () => {
      toast.success(t('toast.created'))
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
      onOpenChange(false)
    },
    onError: (error) => handleServerError({ error }),
  })

  const addVersionMutation = useMutation({
    mutationFn: (values: FormValues) =>
      communicationTemplateService.addVersion(templateId!, {
        translations: values.translations.map((tr) => ({
          locale: tr.locale,
          subject: values.templateType === 'email' ? tr.subject || null : null,
          content: tr.content ?? '',
          designJson: templateType === 'email' ? tr.designJson : undefined,
        })),
      }),
    onSuccess: () => {
      toast.success(t('toast.versionCreated'))
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
      queryClient.invalidateQueries({ queryKey: ['communication-template'] })
      onOpenChange(false)
    },
    onError: (error) => handleServerError({ error }),
  })


  const updateVersionMutation = useMutation({
    mutationFn: (values: FormValues) =>
      communicationTemplateService.updateVersion(templateId!, detail!.activeVersionId!, {
        translations: values.translations.map((tr) => ({
          locale: tr.locale,
          subject: values.templateType === 'email' ? tr.subject || null : null,
          content: tr.content ?? '',
          designJson: templateType === 'email' ? tr.designJson : undefined,
        })),
      }),
    onSuccess: () => {
      toast.success(t('toast.versionUpdated'))
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
      queryClient.invalidateQueries({ queryKey: ['communication-template'] })
      onOpenChange(false)
    },
    onError: (error) => handleServerError({ error }),
  })

  const sendTestEmailMutation = useMutation({
    mutationFn: (to: string) =>
      communicationTemplateService.sendTestEmail(templateId!, {
        to,
        locale: activeLocaleTab,
        // Envía el contenido actual del editor (aún sin guardar) para que la
        // prueba refleje exactamente lo que el usuario está viendo; si el
        // editor está vacío, el backend usa la versión activa guardada
        translations: (form.getValues('translations') ?? [])
          .filter((tr) => (tr.content ?? '').trim().length > 0)
          .map((tr) => ({
            locale: tr.locale,
            subject: templateType === 'email' ? tr.subject || null : null,
            content: tr.content ?? '',
          })),
      }),
    onMutate: () => toast.loading(t('toast.testSending')),
    onSuccess: (_data, _to, ctx) => {
      if (ctx) toast.dismiss(ctx)
      toast.success(t('toast.testSent', { to: _to }))
      setTestEmailOpen(false)
    },
    onError: (error, _to, ctx) => {
      if (ctx) toast.dismiss(ctx)
      handleServerError({ error })
    },
  })


  const variables = useMemo(
    () => VARIABLE_HINTS[entityScope] ?? [],
    [entityScope]
  )

  const addLocale = () => {
    const current = form.getValues('translations')
    const used = new Set(current.map((tr) => tr.locale))
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
      current.filter((tr) => tr.locale !== locale)
    )
    if (activeLocaleTab === locale) {
      setActiveLocaleTab(current.filter((tr) => tr.locale !== locale)[0].locale)
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
        translations: values.translations.map((tr) => ({
          locale: tr.locale,
          subject: values.templateType === 'email' ? tr.subject || null : null,
          content: tr.content ?? '',
          designJson: templateType === 'email' ? tr.designJson : undefined,
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
                  ? t('form.editTitle', { name: detail?.name ?? '' })
                  : t('form.createTitle')}
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
                {t('common:actions.cancel')}
              </Button>
              {!isEditing ? (
                <Button type="button" onClick={form.handleSubmit((v) => onSubmit(v, 'create'))} disabled={isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('form.createTemplate')}
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
                      {t('form.saveAsNewVersion')}
                    </Label>
                  </div>
                  {templateType === 'email' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setTestEmail('')
                        setTestEmailOpen(true)
                      }}
                      disabled={isPending || sendTestEmailMutation.isPending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {t('form.sendTest')}
                    </Button>
                  )}
                  <Button
                    type="button" 
                    onClick={form.handleSubmit((v) => onSubmit(v, createNewVersion ? 'new_version' : 'update_version'))} 
                    disabled={isPending || (!createNewVersion && !detail?.activeVersionId)}
                  >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {createNewVersion ? t('form.createNewVersion') : t('common:actions.save')}
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
                      {t('form.validationAlert')}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common:labels.code')}</FormLabel>
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
                        <FormLabel>{t('common:labels.name')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('form.namePlaceholder')} {...field} />
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
                        <FormLabel>{t('form.scope')}</FormLabel>
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
                            {(Object.keys(scopeLabels) as CommunicationEntityScope[]).map(
                              (s) => (
                                <SelectItem key={s} value={s}>
                                  {scopeLabels[s]}
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
                        <FormLabel>{t('common:labels.type')}</FormLabel>
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
                            <SelectItem value="email">{t('form.typeOptions.email')}</SelectItem>
                            <SelectItem value="document">{t('form.typeOptions.document')}</SelectItem>
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
                      {translations.map((tr) => (
                        <TabsTrigger key={tr.locale} value={tr.locale}>
                          <span className="uppercase">{tr.locale}</span>
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
                      {t('common:language.label')}
                    </Button>
                    {translations.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLocale(activeLocaleTab)}
                      >
                        <Trash2 className="mr-1 h-4 w-4 text-destructive" />
                        {t('common:actions.remove')}
                      </Button>
                    )}
                  </div>

                  {translations.map((tr, idx) => (
                    <TabsContent
                      key={tr.locale}
                      value={tr.locale}
                      className="flex-1 min-h-0 mt-4 flex flex-col gap-4"
                    >
                      {templateType === 'email' && (
                        <FormField
                          control={form.control}
                          name={`translations.${idx}.subject`}
                          render={({ field }) => (
                            <FormItem className="shrink-0">
                              <FormLabel>{t('form.subjectLabel', { locale: tr.locale })}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={t('form.subjectPlaceholder')}
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
                                                        placeholder={t('form.contentPlaceholder')}
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

      <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('form.testEmailTitle')}</DialogTitle>
            <DialogDescription>
              {t('form.testEmailDescription', { locale: activeLocaleTab.toUpperCase() })}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (testEmail.trim()) sendTestEmailMutation.mutate(testEmail.trim())
            }}
          >
            <div className="flex flex-col gap-4">
              <Input
                type="email"
                required
                autoFocus
                placeholder={t('form.testEmailPlaceholder')}
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTestEmailOpen(false)}
                  disabled={sendTestEmailMutation.isPending}
                >
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={sendTestEmailMutation.isPending || !testEmail.trim()}>
                  {sendTestEmailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common:actions.send')}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
