import { z } from 'zod'
import { useResolvedSchema } from '@/hooks/use-resolved-schema'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetService, Asset } from '@/services/asset.service'
import { AssetTemplate } from '@/services/asset-template.service'
import Form from '@rjsf/core'
import { customValidator as validator } from '@/lib/rjsf-validator'
import { handleServerError } from '@/lib/handle-server-error'
import { FileUploadWidget } from '@/components/widgets/FileUploadWidget'
import { EmployeeSelectWidget } from '@/components/widgets/EmployeeSelectWidget'
import { TeamSelectWidget } from '@/components/widgets/TeamSelectWidget'
import { cn } from '@/lib/utils'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form as UiForm,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { FormSheetLayout, formSheetContentClass } from '@/components/form-sheet-layout'

const formSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  parentId: z.string().nullable().optional(),
})

type AssetFormValues = z.infer<typeof formSchema>

interface AssetFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset?: Asset | null
  template: AssetTemplate
}

export function AssetFormSheet({ open, onOpenChange, asset, template }: AssetFormSheetProps) {
  const queryClient = useQueryClient()
  const [propertiesJson, setPropertiesJson] = useState<any>({})
  
  const { data: allAssets } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetService.getAssets(),
    enabled: open
  })

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      parentId: null,
    },
  })

  // Reset form and dynamic properties when asset changes
  useEffect(() => {
    if (asset) {
      form.reset({
        code: asset.code,
        name: asset.name,
        parentId: asset.parentId || null,
      })
      try {
        setPropertiesJson(JSON.parse(asset.propertiesJson))
      } catch (e) {
        setPropertiesJson({})
      }
    } else {
      form.reset({
        code: '',
        name: '',
      })
      setPropertiesJson({})
    }
  }, [asset, form])

  const createMutation = useMutation({
    mutationFn: assetService.createAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      toast.success('El activo se ha creado exitosamente.')
      onOpenChange(false)
    },
    onError: (error: unknown) => {
      handleServerError(error)
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => assetService.updateAsset(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      toast.success('El activo se ha actualizado exitosamente.')
      onOpenChange(false)
    },
    onError: (error: unknown) => {
      handleServerError(error)
    }
  })

  function onSubmit(values: AssetFormValues) {
    // Validamos el propertiesJson contra el schema si es necesario
    // pero @rjsf/core ya maneja la validación antes de dejarnos hacer submit
    
    const payload = {
      ...values,
      assetTemplateId: template.id,
      propertiesJson: JSON.stringify(propertiesJson)
    }

    if (asset) {
      updateMutation.mutate({ id: asset.id, data: payload })
    } else {
      createMutation.mutate({
        ...payload,
        parentId: payload.parentId || undefined
      })
    }
  }

  const { schema, uiSchema, isResolving } = useResolvedSchema(template?.schemaJson || '{}')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn(formSheetContentClass, "w-full sm:max-w-[100vw] sm:w-[95vw] lg:w-[90vw]")} aria-describedby={undefined}>
        <UiForm {...form}>
          <FormSheetLayout
            onSubmit={form.handleSubmit(onSubmit)}
            header={
              <SheetHeader className="p-6 pb-4">
                <SheetTitle>{asset ? 'Editar' : 'Nuevo'} Activo: {template.name}</SheetTitle>
                <SheetDescription>
                  Complete los datos generales y los atributos específicos de {template.name}.
                </SheetDescription>
              </SheetHeader>
            }
            footer={
              <>
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar Activo'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: V-001" disabled={!!asset} {...field} />
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
                        <Input placeholder="Ej: Vehículo Utilitario" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!asset && (
                  <FormField
                    control={form.control}
                    name="parentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Activo Padre (Opcional)</FormLabel>
                        <Select onValueChange={(val) => field.onChange(val === 'none' ? null : val)} value={field.value || 'none'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar padre..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">-- Ninguno --</SelectItem>
                            {allAssets?.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name} ({a.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* RJSF rendered form */}
              {Object.keys(schema).length > 0 && (
                <div className="mt-8 border-t pt-4">
                  <h4 className="text-sm font-medium mb-4">Atributos Dinámicos</h4>
                  <div className="rjsf-tailwind">
                  {isResolving ? (
                    <div className="text-center p-4 text-muted-foreground text-sm">Cargando catálogos...</div>
                  ) : template?.schemaJson && (
                    <Form
                    schema={schema || {}}
                    uiSchema={uiSchema || {}}
                    validator={validator}
                    formData={propertiesJson}
                    onChange={(e) => setPropertiesJson(e.formData)}
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
                </div>
              )}

            </div>
          </FormSheetLayout>
        </UiForm>
      </SheetContent>
    </Sheet>
  )
}
