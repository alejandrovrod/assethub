import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Loader2, Warehouse as WarehouseIcon, PencilLine, CheckCircle2, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { inventoryService, type CreateWarehouseRequest } from '@/services/inventory.service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'

const schema = z.object({
  name: z.string().min(2, 'El nombre es requerido'),
  code: z.string().min(1, 'El código es requerido').max(20),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function WarehousesPage() {
  const { can } = usePermissions()
  const canCreate = can('warehouses:create')
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: inventoryService.getWarehouses,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (body: CreateWarehouseRequest) => inventoryService.createWarehouse(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success('Almacén creado correctamente')
      setOpen(false)
      reset()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.title || 'Error al crear el almacén')
    },
  })

  const onSubmit = (data: FormData) => createMutation.mutate(data)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Almacenes</h1>
          <p className="text-muted-foreground text-sm">
            Gestión de ubicaciones físicas de inventario.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Almacén
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <WarehouseIcon className="h-4 w-4 text-primary" />
            Almacenes registrados
          </CardTitle>
          <CardDescription>
            {warehouses.length} almacén{warehouses.length !== 1 ? 'es' : ''} configurado{warehouses.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <WarehouseIcon className="h-10 w-10 opacity-30" />
              <p className="text-sm">No hay almacenes configurados.</p>
              {canCreate && (
                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear el primero
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map(w => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{w.code}</code>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <PencilLine className="h-3 w-3 text-muted-foreground" />
                        {w.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[240px] truncate">
                      {w.description || '—'}
                    </TableCell>
                    <TableCell>
                      {w.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                          <XCircle className="h-3 w-3" />
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {w.createdAt ? format(parseApiDate(w.createdAt), 'dd MMM yyyy', { locale: es }) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md" aria-describedby="warehouse-sheet-desc">
          <SheetHeader>
            <SheetTitle>Nuevo Almacén</SheetTitle>
            <SheetDescription id="warehouse-sheet-desc">
              Completá los datos para registrar un nuevo almacén.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 mt-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-code">Código</Label>
              <Input id="wh-code" placeholder="ALM-01" {...register('code')} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-name">Nombre</Label>
              <Input id="wh-name" placeholder="Almacén Principal" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-desc">Descripción <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea id="wh-desc" rows={3} placeholder="Ubicación, notas..." {...register('description')} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); reset() }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Almacén
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
