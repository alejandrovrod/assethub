import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { assetService, AssetMaterialDto } from '@/services/asset.service'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { apiClient as api } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

const schema = z.object({
  catalogItemId: z.string().min(1, { error: () => i18n.t('assets:validation.materialRequired') }),
  catalogItemLabel: z.string().optional(),
  quantity: z.coerce.number().positive({ error: () => i18n.t('assets:validation.quantityPositive') }),
  unitOfMeasure: z.string().min(1, { error: () => i18n.t('assets:validation.unitRequired') }),
  isCritical: z.boolean().default(false),
  notes: z.string().optional()
})

type FormData = z.infer<typeof schema>

interface Props {
  assetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  materialToEdit?: AssetMaterialDto
}

export function AssetMaterialFormSheet({ assetId, open, onOpenChange, materialToEdit }: Props) {
  const { t } = useTranslation(['assets', 'common'])
  const { can } = usePermissions()
  const canUpdate = can('assets:update')
  const queryClient = useQueryClient()
  const isEditing = !!materialToEdit

  const form = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      catalogItemId: '',
      catalogItemLabel: '',
      quantity: 1,
      unitOfMeasure: 'Unidad',
      isCritical: false,
      notes: ''
    }
  })

  // Set selected label separately for display in the combobox trigger button
  const [selectedLabel, setSelectedLabel] = useState('')

  useEffect(() => {
    if (open) {
      if (materialToEdit) {
        form.reset({
          catalogItemId: materialToEdit.catalogItemId,
          catalogItemLabel: materialToEdit.catalogItemLabel,
          quantity: materialToEdit.quantity,
          unitOfMeasure: materialToEdit.unitOfMeasure,
          isCritical: materialToEdit.isCritical,
          notes: materialToEdit.notes || ''
        })
        setSelectedLabel(materialToEdit.catalogItemLabel)
      } else {
        form.reset({
          catalogItemId: '',
          catalogItemLabel: '',
          quantity: 1,
          unitOfMeasure: 'Unidad',
          isCritical: false,
          notes: ''
        })
        setSelectedLabel('')
      }
    }
  }, [open, materialToEdit, form])

  const createMutation = useMutation({
    mutationFn: (data: FormData) => assetService.addMaterial(assetId, {
      catalogItemId: data.catalogItemId,
      quantity: data.quantity,
      unitOfMeasure: data.unitOfMeasure,
      isCritical: data.isCritical,
      notes: data.notes
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-materials', assetId] })
      toast.success(t('toast.materialAdded'))
      onOpenChange(false)
    },
    onError: handleServerError
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => assetService.updateMaterial(assetId, materialToEdit!.id, {
      quantity: data.quantity,
      unitOfMeasure: data.unitOfMeasure,
      isCritical: data.isCritical,
      notes: data.notes
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-materials', assetId] })
      toast.success(t('toast.materialUpdated'))
      onOpenChange(false)
    },
    onError: handleServerError
  })

  const onSubmit = (data: FormData) => {
    if (isEditing) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md w-full">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('material.editTitle') : t('material.addTitle')}</SheetTitle>
          <SheetDescription>
            {isEditing ? t('material.editDescription') : t('material.addDescription')}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4 mt-6">
            
            <FormField
              control={form.control as any}
              name="catalogItemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('material.catalogLabel')}</FormLabel>
                  <FormControl>
                    <AsyncCombobox<{ id: string; name: string }>
                      minSearchChars={1}
                      fetcher={async (query) => {
                        const params = new URLSearchParams({ locale: 'es', search: query })
                        const { data } = await api.get<{ items: Array<{ id: string; label: string }> }>(`/catalogs/parts/items?${params}`)
                        return data.items.map(i => ({ id: i.id, name: i.label }))
                      }}
                      labelKey="name"
                      valueKey="id"
                      placeholder={t('material.searchPlaceholder')}
                      searchPlaceholder={t('material.searchPrompt')}
                      emptyText={t('material.noMaterials')}
                      onSelect={(item) => {
                        field.onChange(item.id)
                        form.setValue('catalogItemLabel', item.name)
                        setSelectedLabel(item.name)
                      }}
                      renderTrigger={(onClick) => (
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          onClick={onClick}
                          disabled={isEditing}
                          className="w-full justify-between font-normal text-sm"
                        >
                          {selectedLabel || t('material.searchPlaceholder')}
                          <span className="ml-2 opacity-50">▼</span>
                        </Button>
                      )}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('material.catalogHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control as any}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('material.quantity')}</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control as any}
                name="unitOfMeasure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('material.unitOfMeasure')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control as any}
              name="isCritical"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>{t('material.criticalPart')}</FormLabel>
                    <FormDescription>
                      {t('material.criticalHint')}
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control as any}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('material.additionalNotes')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t('material.notesPlaceholder')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={isPending || !canUpdate}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common:actions.save')}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
