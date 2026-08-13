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

const formSchema = z.object({
  code: z.string().min(1, { message: "El código es obligatorio." }),
  defaultLabel: z.string().min(1, { message: "La etiqueta es obligatoria." }),
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
              <FormLabel>Código</FormLabel>
              <FormControl>
                <Input placeholder="Ej: LAPTOP" {...field} disabled={!!initialData} />
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
              <FormLabel>Etiqueta</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Computadora Portátil" {...field} />
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
              <FormLabel>Orden</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
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
