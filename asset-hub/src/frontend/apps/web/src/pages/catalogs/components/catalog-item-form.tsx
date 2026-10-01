import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"

const formSchema = z.object({
  code: z.string().min(1, { error: () => ({ message: i18n.t('catalogs:form.item.codeRequired') }) }),
  defaultLabel: z.string().min(1, { error: () => ({ message: i18n.t('catalogs:form.item.labelRequired') }) }),
  order: z.any(),
})

export type CatalogItemFormValues = z.infer<typeof formSchema>

interface CatalogItemFormProps {
  initialData?: any | null
  onSubmit: (data: CatalogItemFormValues) => void
  onCancel: () => void
  isLoading?: boolean
}

export function CatalogItemForm({ initialData, onSubmit, onCancel, isLoading }: CatalogItemFormProps) {
    const { t } = useTranslation(['catalogs', 'common'])
    const form = useForm<CatalogItemFormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        code: initialData?.code || "",
        defaultLabel: initialData?.label || "",
        order: initialData?.order ?? 0,
      },
    })
  
    useEffect(() => {
      form.reset({
        code: initialData?.code || "",
        defaultLabel: initialData?.label || "",
        order: initialData?.order ?? 0,
      })
    }, [initialData, form])
  
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
                <Input placeholder={t('form.item.codePlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.label')}</FormLabel>
              <FormControl>
                <Input placeholder={t('form.item.labelPlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.order')}</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
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
