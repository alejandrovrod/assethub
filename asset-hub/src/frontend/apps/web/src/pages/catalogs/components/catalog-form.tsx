import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import type { Catalog } from "@/services/catalog.service"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"

const formSchema = z.object({
  code: z.string().min(2, { error: () => ({ message: i18n.t('catalogs:form.catalog.codeMinLength') }) }),
  label: z.string().min(2, { error: () => ({ message: i18n.t('catalogs:form.catalog.labelMinLength') }) }),
  targetModules: z.array(z.string()).optional(),
})

export type CatalogFormValues = z.infer<typeof formSchema>

interface CatalogFormProps {
  initialData?: Catalog | null
  onSubmit: (data: CatalogFormValues) => void
  onCancel: () => void
  isLoading?: boolean
}

export function CatalogForm({ initialData, onSubmit, onCancel, isLoading }: CatalogFormProps) {
  const { t } = useTranslation(['catalogs', 'common'])
  const form = useForm<CatalogFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: initialData?.code || "",
      label: initialData?.label || "",
      targetModules: initialData?.targetModules || [],
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common:labels.code')}</FormLabel>
              <FormControl>
                <Input placeholder={t('form.catalog.codePlaceholder')} {...field} disabled={!!initialData} />
              </FormControl>
              <FormDescription>{t('form.catalog.codeDescription')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.label')}</FormLabel>
              <FormControl>
                <Input placeholder={t('form.catalog.labelPlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="targetModules"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-base">{t('form.catalog.modules')}</FormLabel>
                <FormDescription>
                  {t('form.catalog.modulesDescription')}
                </FormDescription>
              </div>
              <FormField
                control={form.control}
                name="targetModules"
                render={({ field }) => {
                  const modules = [
                    { id: "Assets", label: t('form.catalog.moduleAssets') },
                    { id: "Incidents", label: t('form.catalog.moduleIncidents') },
                    { id: "Tasks", label: t('form.catalog.moduleTasks') },
                    { id: "Maintenance", label: t('form.catalog.moduleMaintenance') },
                    { id: "Orders", label: t('form.catalog.moduleOrders') },
                    { id: "Staff", label: t('form.catalog.moduleStaff') },
                  ];

                  return (
                    <div className="space-y-3">
                      {modules.map((module) => (
                        <FormItem
                          key={module.id}
                          className="flex flex-row items-start space-x-3 space-y-0"
                        >
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(module.id)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...(field.value || []), module.id])
                                  : field.onChange(
                                      field.value?.filter(
                                        (value) => value !== module.id
                                      )
                                    )
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">
                            {module.label}
                          </FormLabel>
                        </FormItem>
                      ))}
                    </div>
                  )
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t('form.saving') : t('common:actions.save')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
