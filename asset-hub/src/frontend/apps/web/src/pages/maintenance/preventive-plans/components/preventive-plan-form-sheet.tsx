import { useEffect, useMemo, useState } from 'react'
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { preventivePlanService, type PreventivePlanSummary } from '@/services/preventive-plan.service'
import { assetService } from '@/services/asset.service'
import { assetTemplateService } from '@/services/asset-template.service'
import { WorkflowTemplateService } from '@/services/workflow-template.service'
import { DatePicker } from '@/components/date-picker'
import { toast } from 'sonner'
import { Loader2, Package, Users, User } from 'lucide-react'
import { apiClient as api } from '@/lib/api-client'
import { parseApiDate } from '@/lib/utils'

const CRON_PRESETS = [
  { labelKey: 'preventivePlans.cron.dailyMidnight', value: '0 0 * * *' },
  { labelKey: 'preventivePlans.cron.weeklyMonday', value: '0 0 * * 1' },
  { labelKey: 'preventivePlans.cron.monthlyFirstDay', value: '0 0 1 * *' },
  { labelKey: 'preventivePlans.cron.everyHour', value: '0 * * * *' },
  { labelKey: 'preventivePlans.cron.every5Minutes', value: '*/5 * * * *' },
  { labelKey: 'preventivePlans.cron.custom', value: 'custom' },
] as const

const formSchema = (t: TFunction<'maintenance'>) => z
  .object({
    name: z.string().min(1, t('preventivePlans.form.validation.nameRequired')).max(200),
    description: z.string().max(1000).optional(),
    targetType: z.enum(['Asset', 'AssetTemplate']),
    assetId: z.string().optional(),
    assetTemplateId: z.string().optional(),
    workflowTemplateId: z.string().optional(),
    generatedEntityType: z.enum(['WorkTask', 'MaintenanceOrder', 'Both']),
    cronPreset: z.string().min(1),
    cronExpression: z.string().min(1, t('preventivePlans.form.validation.cronRequired')),
    dueDateOffsetDays: z.number().min(0, t('preventivePlans.form.validation.dueOffsetMin')),
    autoAssign: z.boolean(),
    defaultAssignedEmployeeId: z.string().optional(),
    defaultAssignedTeamId: z.string().optional(),
    allowedStates: z.array(z.string()),
    excludedStates: z.array(z.string()),
    endsAt: z.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.targetType === 'Asset' && !data.assetId) {
      ctx.addIssue({ code: 'custom', message: t('preventivePlans.form.validation.assetRequired'), path: ['assetId'] })
    }
    if (data.targetType === 'AssetTemplate' && !data.assetTemplateId) {
      ctx.addIssue({ code: 'custom', message: t('preventivePlans.form.validation.templateRequired'), path: ['assetTemplateId'] })
    }
    if ((data.generatedEntityType === 'MaintenanceOrder' || data.generatedEntityType === 'Both') && !data.workflowTemplateId) {
      ctx.addIssue({ code: 'custom', message: t('preventivePlans.form.validation.workflowRequired'), path: ['workflowTemplateId'] })
    }
  })

type FormValues = z.infer<ReturnType<typeof formSchema>>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan?: PreventivePlanSummary
}

function parseConditionRule(json?: string) {
  if (!json) return { allowedStates: [] as string[], excludedStates: [] as string[] }
  try {
    const parsed = JSON.parse(json)
    return {
      allowedStates: (parsed.allowedStates as string[]) ?? [],
      excludedStates: (parsed.excludedStates as string[]) ?? [],
    }
  } catch {
    return { allowedStates: [] as string[], excludedStates: [] as string[] }
  }
}

function buildConditionRuleJson(allowed: string[], excluded: string[]) {
  if (allowed.length === 0 && excluded.length === 0) return undefined
  return JSON.stringify({ allowedStates: allowed, excludedStates: excluded })
}

export function PreventivePlanFormSheet({ open, onOpenChange, plan }: Props) {
  const { t } = useTranslation(['maintenance', 'common'])
  const queryClient = useQueryClient()
  const isEditing = !!plan

  const [assetLabel, setAssetLabel] = useState<string>('')
  const [employeeLabel, setEmployeeLabel] = useState<string>('')
  const [teamLabel, setTeamLabel] = useState<string>('')

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema(t)),
    defaultValues: {
      name: '',
      description: '',
      targetType: 'Asset',
      workflowTemplateId: undefined,
      generatedEntityType: 'WorkTask',
      cronPreset: '0 0 1 * *',
      cronExpression: '0 0 1 * *',
      dueDateOffsetDays: 7,
      autoAssign: false,
      allowedStates: [],
      excludedStates: [],
    },
  })

  const targetType = form.watch('targetType')
  const cronPreset = form.watch('cronPreset')
  const generatedEntityType = form.watch('generatedEntityType')
  const selectedTemplateId = form.watch('assetTemplateId')
  const selectedAssetId = form.watch('assetId')
  const selectedEmployeeId = form.watch('defaultAssignedEmployeeId')
  const selectedTeamId = form.watch('defaultAssignedTeamId')

  const { data: templates } = useQuery({
    queryKey: ['asset-templates'],
    queryFn: () => assetTemplateService.getTemplates(),
    enabled: open,
  })

  const { data: workflowTemplates } = useQuery({
    queryKey: ['workflow-templates', 'all'],
    queryFn: async () => {
      const all = await WorkflowTemplateService.search(undefined, false)
      return all // Allow all templates (incident or preventive) to be selected
    },
    enabled: open,
  })

  // Removed getAssets query, we now use AsyncCombobox or fetch one asset
  const { data: selectedAsset } = useQuery({
    queryKey: ['asset', selectedAssetId],
    queryFn: () => assetService.getAssetById(selectedAssetId!),
    enabled: !!selectedAssetId,
  })

  const { data: selectedEmployee } = useQuery({
    queryKey: ['employee', selectedEmployeeId],
    queryFn: async () => {
      const { data } = await api.get(`/employees/${selectedEmployeeId}`)
      return data
    },
    enabled: !!selectedEmployeeId,
  })

  const { data: selectedTeam } = useQuery({
    queryKey: ['team', selectedTeamId],
    queryFn: async () => {
      const { data } = await api.get(`/teams/${selectedTeamId}`)
      return data
    },
    enabled: !!selectedTeamId,
  })

  const lifecycleStates = useMemo(() => {
    if (targetType === 'AssetTemplate' && selectedTemplateId) {
      const template = templates?.find((t) => t.id === selectedTemplateId)
      return Object.keys(template?.lifecycleStates?.states ?? {})
    }
    if (targetType === 'Asset' && selectedAsset) {
      const template = templates?.find((t) => t.id === selectedAsset.templateId)
      return Object.keys(template?.lifecycleStates?.states ?? {})
    }
    return []
  }, [targetType, selectedTemplateId, selectedAsset, templates])

  useEffect(() => {
    if (!open) return
    if (plan) {
      const conditions = parseConditionRule(plan.conditionRuleJson)
      const preset = CRON_PRESETS.find((p) => p.value === plan.cronExpression)
      setAssetLabel(plan.assetName ?? '')
      // Leave team and employee empty until their queries load the data
      form.reset({
        name: plan.name,
        description: plan.description ?? '',
        targetType: plan.targetType,
        assetId: plan.assetId ?? undefined,
        assetTemplateId: plan.assetTemplateId ?? undefined,
        workflowTemplateId: plan.workflowTemplateId ?? undefined,
        generatedEntityType: plan.generatedEntityType as FormValues['generatedEntityType'],
        cronPreset: preset?.value ?? 'custom',
        cronExpression: plan.cronExpression,
        dueDateOffsetDays: plan.dueDateOffsetDays,
        autoAssign: plan.autoAssign,
        defaultAssignedEmployeeId: plan.defaultAssignedEmployeeId ?? undefined,
        defaultAssignedTeamId: plan.defaultAssignedTeamId ?? undefined,
        allowedStates: conditions.allowedStates,
        excludedStates: conditions.excludedStates,
        endsAt: plan.endsAt ? parseApiDate(plan.endsAt) : undefined,
      })
    } else {
      setAssetLabel('')
      setEmployeeLabel('')
      setTeamLabel('')
      form.reset({
        name: '',
        description: '',
        targetType: 'Asset',
        workflowTemplateId: undefined,
        generatedEntityType: 'WorkTask',
        cronPreset: '0 0 1 * *',
        cronExpression: '0 0 1 * *',
        dueDateOffsetDays: 7,
        autoAssign: false,
        allowedStates: [],
        excludedStates: [],
      })
    }
  }, [open, plan, form])

  useEffect(() => {
    if (selectedEmployee) {
      setEmployeeLabel(`${selectedEmployee.firstName} ${selectedEmployee.lastName}`)
    }
  }, [selectedEmployee])

  useEffect(() => {
    if (selectedTeam) {
      setTeamLabel(selectedTeam.name)
    }
  }, [selectedTeam])

  useEffect(() => {
    if (cronPreset !== 'custom') {
      form.setValue('cronExpression', cronPreset)
    }
  }, [cronPreset, form])

  const createMutation = useMutation({
    mutationFn: preventivePlanService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success(t('preventivePlans.toast.created'))
      onOpenChange(false)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.title || error?.message || t('preventivePlans.toast.createError')
      toast.error(message)
      console.error('Create preventive plan error:', error)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof preventivePlanService.update>[1]) =>
      preventivePlanService.update(plan!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success(t('preventivePlans.toast.updated'))
      onOpenChange(false)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.title || error?.message || t('preventivePlans.toast.updateError')
      toast.error(message)
      console.error('Update preventive plan error:', error)
    },
  })

  const onSubmit = (values: FormValues) => {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      assetId: values.targetType === 'Asset' ? values.assetId : undefined,
      assetTemplateId: values.targetType === 'AssetTemplate' ? values.assetTemplateId : undefined,
      workflowTemplateId: (values.generatedEntityType === 'MaintenanceOrder' || values.generatedEntityType === 'Both') ? values.workflowTemplateId : undefined,
      generatedEntityType: values.generatedEntityType,
      cronExpression: values.cronExpression,
      dueDateOffsetDays: values.dueDateOffsetDays,
      conditionRuleJson: buildConditionRuleJson(values.allowedStates, values.excludedStates),
      autoAssign: values.autoAssign,
      defaultAssignedEmployeeId: values.autoAssign ? values.defaultAssignedEmployeeId : undefined,
      defaultAssignedTeamId: values.autoAssign ? values.defaultAssignedTeamId : undefined,
      endsAt: values.endsAt?.toISOString(),
    }

    if (isEditing) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 h-full">
        <SheetHeader className="p-6 pb-2 border-b shrink-0">
          <SheetTitle>{isEditing ? t('preventivePlans.form.editTitle') : t('preventivePlans.form.createTitle')}</SheetTitle>
          <SheetDescription>
            {t('preventivePlans.form.description')}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:labels.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('preventivePlans.form.namePlaceholder')} {...field} />
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
                    <FormLabel>{t('common:labels.description')}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder={t('preventivePlans.form.descriptionPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('preventivePlans.columns.target')}</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="Asset" id="target-asset" />
                          <label htmlFor="target-asset" className="text-sm">{t('preventivePlans.form.targetAsset')}</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="AssetTemplate" id="target-template" />
                          <label htmlFor="target-template" className="text-sm">{t('preventivePlans.form.targetTemplate')}</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {targetType === 'Asset' ? (
                <FormField
                  control={form.control}
                  name="assetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.asset')}</FormLabel>
                      <FormControl>
                        <AsyncCombobox<{ id: string; name: string; code: string }>
                          fetcher={async (query) => {
                            const result = await assetService.getAssets(query || undefined)
                            return result.items.map((a: any) => ({ id: a.id, name: a.name, code: a.code }))
                          }}
                          labelKey="name"
                          valueKey="id"
                          placeholder={t('form.filters.searchAsset')}
                          searchPlaceholder={t('form.searchTypePlaceholder')}
                          emptyText={t('form.noAssetsFound')}
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
                              className="w-full justify-between font-normal bg-background"
                            >
                              {assetLabel || t('form.filters.searchAsset')}
                              <Package className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                  name="assetTemplateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('preventivePlans.form.assetTemplate')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('preventivePlans.form.selectTemplatePlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {templates?.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="cronPreset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('preventivePlans.columns.frequency')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CRON_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {t(p.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {cronPreset === 'custom' && (
                <FormField
                  control={form.control}
                  name="cronExpression"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('preventivePlans.form.cronExpression')}</FormLabel>
                      <FormControl>
                        <Input placeholder="0 0 1 * *" {...field} />
                      </FormControl>
                      <FormDescription>{t('preventivePlans.form.cronFormat')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="generatedEntityType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('preventivePlans.form.deliverableType')}</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="WorkTask" id="type-task" />
                          <label htmlFor="type-task" className="text-sm">{t('preventivePlans.form.deliverableTask')}</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="MaintenanceOrder" id="type-order" />
                          <label htmlFor="type-order" className="text-sm">{t('detail.related.maintenanceOrder')}</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="Both" id="type-both" />
                          <label htmlFor="type-both" className="text-sm">{t('preventivePlans.entityType.both')}</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(generatedEntityType === 'MaintenanceOrder' || generatedEntityType === 'Both') && (
                <FormField
                  control={form.control}
                  name="workflowTemplateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('preventivePlans.form.workflowTemplate')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('preventivePlans.form.selectWorkflowPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {workflowTemplates?.map((wt) => (
                            <SelectItem key={wt.id} value={wt.id}>
                              {wt.name} ({wt.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t('preventivePlans.form.workflowDescription')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="dueDateOffsetDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('preventivePlans.detail.dueOffsetDays')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      />
                    </FormControl>
                    <FormDescription>{t('preventivePlans.form.dueOffsetDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="autoAssign"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">{t('preventivePlans.form.autoAssign')}</FormLabel>
                  </FormItem>
                )}
              />

              {form.watch('autoAssign') && (
                <div className="grid grid-cols-1 gap-4 pl-6">
                  <FormField
                    control={form.control}
                    name="defaultAssignedEmployeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('preventivePlans.form.employeeIdOptional')}</FormLabel>
                        <FormControl>
                          <AsyncCombobox<{ id: string; name: string }>
                            fetcher={async (query) => {
                              const { data } = await api.get<{ items: Array<{ id: string; firstName: string; lastName: string }> }>('/employees', {
                                params: { search: query, isActive: true },
                              })
                              return data.items.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))
                            }}
                            labelKey="name"
                            valueKey="id"
                            placeholder={t('form.filters.searchEmployee')}
                            searchPlaceholder={t('form.searchTypePlaceholder')}
                            emptyText={t('form.filters.noEmployees')}
                            onSelect={(item) => {
                              field.onChange(item.id)
                              setEmployeeLabel(item.name)
                            }}
                            renderTrigger={(onClick) => (
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                onClick={onClick}
                                className="w-full justify-between font-normal bg-background"
                              >
                                {employeeLabel || t('form.filters.searchEmployee')}
                                <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            )}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="defaultAssignedTeamId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('preventivePlans.form.teamIdOptional')}</FormLabel>
                        <FormControl>
                          <AsyncCombobox<{ id: string; name: string }>
                            fetcher={async (query) => {
                              const { data } = await api.get<{ items: Array<{ id: string; name: string }> }>('/teams', {
                                params: { search: query, isActive: true },
                              })
                              return data.items.map((t) => ({ id: t.id, name: t.name }))
                            }}
                            labelKey="name"
                            valueKey="id"
                            placeholder={t('form.filters.searchTeam')}
                            searchPlaceholder={t('form.searchTypePlaceholder')}
                            emptyText={t('form.filters.noTeams')}
                            onSelect={(item) => {
                              field.onChange(item.id)
                              setTeamLabel(item.name)
                            }}
                            renderTrigger={(onClick) => (
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                onClick={onClick}
                                className="w-full justify-between font-normal bg-background"
                              >
                                {teamLabel || t('form.filters.searchTeam')}
                                <Users className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            )}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {lifecycleStates.length > 0 && (
                <div className="space-y-4">
                  <FormLabel>{t('preventivePlans.form.stateConditions')}</FormLabel>
                  <FormDescription>
                    {t('preventivePlans.form.stateConditionsDescription')}
                  </FormDescription>

                  <FormField
                    control={form.control}
                    name="excludedStates"
                    render={() => (
                      <FormItem>
                        <FormLabel className="text-sm text-muted-foreground">{t('preventivePlans.form.excludedStates')}</FormLabel>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {lifecycleStates.map((state) => (
                            <FormField
                              key={`excluded-${state}`}
                              control={form.control}
                              name="excludedStates"
                              render={({ field }) => (
                                <FormItem className="flex items-center gap-1.5">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(state)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value ?? []
                                        field.onChange(
                                          checked
                                            ? [...current, state]
                                            : current.filter((s) => s !== state)
                                        )
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="!mt-0 text-xs font-normal">{state}</FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('preventivePlans.form.endsAtOptional')}</FormLabel>
                    <DatePicker
                      selected={field.value}
                      onSelect={field.onChange}
                      placeholder={t('preventivePlans.form.noEndDate')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            <div className="p-6 border-t bg-background shrink-0 flex flex-col gap-3">
              {Object.keys(form.formState.errors).length > 0 && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  <strong>{t('preventivePlans.form.fixErrors')}</strong>
                  <ul className="list-disc list-inside mt-1">
                    {Object.entries(form.formState.errors).map(([name, error]) => (
                      <li key={name}>{error?.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? t('common:actions.saveChanges') : t('preventivePlans.form.createPlan')}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
