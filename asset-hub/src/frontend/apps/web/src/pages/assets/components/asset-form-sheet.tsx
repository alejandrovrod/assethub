import { z } from 'zod'
import { useResolvedSchema } from '@/hooks/use-resolved-schema'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetService, Asset } from '@/services/asset.service'
import { AssetTemplate } from '@/services/asset-template.service'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { handleServerError } from '@/lib/handle-server-error'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'

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

  const { schema, isResolving } = useResolvedSchema(template.schemaJson)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-full flex flex-col p-0" aria-describedby={undefined}>
        <div className="p-6 pb-2">
          <SheetHeader>
            <SheetTitle>{asset ? 'Editar' : 'Nuevo'} Activo: {template.name}</SheetTitle>
            <SheetDescription>
              Complete los datos generales y los atributos específicos de {template.name}.
            </SheetDescription>
          </SheetHeader>
        </div>

        <ScrollArea className="flex-1 px-6">
          <UiForm {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-6 mt-4">
              
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
                      schema={schema} 
                      formData={propertiesJson}
                      validator={validator}
                      onChange={(e) => setPropertiesJson(e.formData)}
                      children={<></>} 
                    />
                  )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t mt-6">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar Activo'}
                </Button>
              </div>
            </form>
          </UiForm>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
