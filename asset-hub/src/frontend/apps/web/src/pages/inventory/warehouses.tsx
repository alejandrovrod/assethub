import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Loader2, Warehouse as WarehouseIcon, PencilLine, CheckCircle2, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

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
import { parseApiDate } from '@/lib/utils'
import { useFormat } from '@/lib/format'
import { usePermissions } from '@/hooks/use-permissions'

function getWarehouseSchema(t: TFunction<'inventory'>) {
  return z.object({
    name: z.string().min(2, t('warehouses.form.validation.nameRequired')),
    code: z.string().min(1, t('warehouses.form.validation.codeRequired')).max(20),
    description: z.string().optional(),
  })
}

type FormData = z.infer<ReturnType<typeof getWarehouseSchema>>

export default function WarehousesPage() {
  const { t } = useTranslation(['inventory', 'common'])
  const { formatDate } = useFormat()
  const { can } = usePermissions()
  const canCreate = can('warehouses:create')
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: inventoryService.getWarehouses,
  })

  const warehouseSchema = useMemo(() => getWarehouseSchema(t), [t])
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(warehouseSchema),
  })

  const createMutation = useMutation({
    mutationFn: (body: CreateWarehouseRequest) => inventoryService.createWarehouse(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success(t('warehouses.toast.created'))
      setOpen(false)
      reset()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.title || t('warehouses.toast.createError'))
    },
  })

  const onSubmit = (data: FormData) => createMutation.mutate(data)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('warehouses.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('warehouses.subtitle')}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('warehouses.newWarehouse')}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <WarehouseIcon className="h-4 w-4 text-primary" />
            {t('warehouses.registered.title')}
          </CardTitle>
          <CardDescription>
            {t('warehouses.registered.count', { count: warehouses.length })}
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
              <p className="text-sm">{t('warehouses.empty.title')}</p>
              {canCreate && (
                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('warehouses.empty.createFirst')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common:labels.code')}</TableHead>
                  <TableHead>{t('common:labels.name')}</TableHead>
                  <TableHead>{t('common:labels.description')}</TableHead>
                  <TableHead>{t('common:labels.status')}</TableHead>
                  <TableHead>{t('common:labels.createdAt')}</TableHead>
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
                          {t('common:status.active')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                          <XCircle className="h-3 w-3" />
                          {t('common:status.inactive')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {w.createdAt ? formatDate(parseApiDate(w.createdAt), { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
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
            <SheetTitle>{t('warehouses.newWarehouse')}</SheetTitle>
            <SheetDescription id="warehouse-sheet-desc">
              {t('warehouses.form.sheetDescription')}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 mt-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-code">{t('common:labels.code')}</Label>
              <Input id="wh-code" placeholder={t('warehouses.form.codePlaceholder')} {...register('code')} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-name">{t('common:labels.name')}</Label>
              <Input id="wh-name" placeholder={t('warehouses.form.namePlaceholder')} {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-desc">{t('common:labels.description')} <span className="text-muted-foreground">{t('warehouses.form.optionalHint')}</span></Label>
              <Textarea id="wh-desc" rows={3} placeholder={t('warehouses.form.descriptionPlaceholder')} {...register('description')} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); reset() }}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('warehouses.form.submit')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
