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
import type { Catalog } from "@/services/catalog.service"

const formSchema = z.object({
  code: z.string().min(2, { message: "El código debe tener al menos 2 caracteres." }),
  label: z.string().min(2, { message: "La etiqueta debe tener al menos 2 caracteres." }),
})

export type CatalogFormValues = z.infer<typeof formSchema>

interface CatalogFormProps {
  initialData?: Catalog | null
  onSubmit: (data: CatalogFormValues) => void
  onCancel: () => void
  isLoading?: boolean
}

export function CatalogForm({ initialData, onSubmit, onCancel, isLoading }: CatalogFormProps) {
  const form = useForm<CatalogFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: initialData?.code || "",
      label: initialData?.label || "",
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
              <FormLabel>Código</FormLabel>
              <FormControl>
                <Input placeholder="Ej: ASSET_TYPE" {...field} disabled={!!initialData} />
              </FormControl>
              <FormDescription>Identificador único del catálogo (solo mayúsculas y guiones bajos recomendado).</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Etiqueta</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Tipo de Activo" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
