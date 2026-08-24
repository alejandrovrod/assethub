import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Play, Pause, Pencil, Trash2, RotateCw } from 'lucide-react'
import { preventivePlanService, type PreventivePlanSummary } from '@/services/preventive-plan.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PreventivePlanFormSheet } from './components/preventive-plan-form-sheet'
import { PreventivePlanExecutionLog } from './components/preventive-plan-execution-log'
import { PreventivePlanCalendar } from './components/preventive-plan-calendar'
import { PreventivePlanGeneratedItems } from './components/preventive-plan-generated-items'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ENTITY_TYPE_LABELS: Record<string, string> = {
  WorkTask: 'Tarea',
  MaintenanceOrder: 'Orden',
  Both: 'Ambas',
}

function cronToHuman(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length < 5) return cron

  const [min, , dom, mon, dow] = parts

  if (cron === '0 0 1 * *') return 'Mensual (día 1)'
  if (cron === '0 0 * * 1') return 'Semanal (lunes)'
  if (cron === '0 0 * * *') return 'Diario'
  if (dom !== '*' && mon === '*') return `Mensual (día ${dom})`
  if (dow !== '*') return `Semanal`
  if (min.startsWith('*/')) return `Cada ${min.slice(2)} min`

  return cron
}

export default function PreventivePlansPage() {
  const queryClient = useQueryClient()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PreventivePlanSummary | undefined>()
  const [selectedPlan, setSelectedPlan] = useState<PreventivePlanSummary | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const { data: plans, isLoading } = useQuery({
    queryKey: ['preventive-plans', activeFilter],
    queryFn: () =>
      preventivePlanService.getAll(
        activeFilter === 'all' ? undefined : { active: activeFilter === 'active' }
      ),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => preventivePlanService.toggleActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success('Estado del plan actualizado')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => preventivePlanService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success('Plan eliminado')
    },
  })

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => preventivePlanService.evaluate(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['preventive-plans'] })
      toast.success(
        `Evaluado: ${result.generatedWorkTasks} tareas, ${result.generatedMaintenanceOrders} órdenes, ${result.skippedAssets} omitidos`
      )
    },
    onError: () => {
      toast.error('Error al evaluar el plan')
    },
  })

  const handleCreate = () => {
    setEditingPlan(undefined)
    setIsFormOpen(true)
  }

  const handleEdit = (plan: PreventivePlanSummary) => {
    setEditingPlan(plan)
    setIsFormOpen(true)
  }

  const handleRowClick = (plan: PreventivePlanSummary) => {
    setSelectedPlan(plan)
  }

  const filteredPlans = plans?.filter((p) =>
    searchTerm ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) : true
  )

  return (
    <div className="flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Main list */}
        <Card className={`flex flex-1 flex-col overflow-hidden ${selectedPlan ? 'max-w-[55%]' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle>Planes de Mantenimiento</CardTitle>
              <CardDescription>
                Programá tareas y órdenes de mantenimiento preventivo recurrentes.
              </CardDescription>
            </div>
            <Button size="icon" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
            </Button>
          </CardHeader>

          <div className="px-4 py-3 flex items-center gap-3 border-b">
            <Input
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Tabs value={activeFilter} onValueChange={setActiveFilter} className="ml-auto">
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="active">Activos</TabsTrigger>
                <TabsTrigger value="paused">Pausados</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPlans && filteredPlans.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Objetivo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Frecuencia</TableHead>
                      <TableHead>Próxima ejecución</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlans.map((plan) => (
                      <TableRow
                        key={plan.id}
                        className="cursor-pointer"
                        onClick={() => handleRowClick(plan)}
                      >
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {plan.targetType === 'Asset' ? plan.assetName : plan.assetTemplateName}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ENTITY_TYPE_LABELS[plan.generatedEntityType] || plan.generatedEntityType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cronToHuman(plan.cronExpression)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {plan.nextRunAt
                            ? format(new Date(plan.nextRunAt.endsWith('Z') ? plan.nextRunAt : `${plan.nextRunAt}Z`), 'dd MMM yyyy HH:mm', { locale: es })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                            {plan.isActive ? 'Activo' : 'Pausado'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEdit(plan)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Editar</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleMutation.mutate(plan.id)}
                                  >
                                    {plan.isActive ? (
                                      <Pause className="h-4 w-4" />
                                    ) : (
                                      <Play className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {plan.isActive ? 'Pausar' : 'Reanudar'}
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => evaluateMutation.mutate(plan.id)}
                                    disabled={evaluateMutation.isPending}
                                  >
                                    <RotateCw
                                      className={`h-4 w-4 ${evaluateMutation.isPending ? 'animate-spin' : ''}`}
                                    />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Ejecutar ahora</TooltipContent>
                              </Tooltip>

                              <AlertDialog>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent>Eliminar</TooltipContent>
                                </Tooltip>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar plan?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción eliminará el plan &quot;{plan.name}&quot;. Los
                                      elementos generados previamente no se verán afectados.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(plan.id)}
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <p>No hay planes de mantenimiento.</p>
                  <Button variant="link" onClick={handleCreate}>
                    Crear el primero
                  </Button>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selectedPlan && (
          <Card className="flex flex-col overflow-hidden w-[45%]">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle className="text-lg">{selectedPlan.name}</CardTitle>
                <CardDescription>{selectedPlan.description}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPlan(undefined)}>
                ✕
              </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <Tabs defaultValue="calendar" className="flex flex-col h-full">
                <TabsList className="mx-4 mt-4 w-fit">
                  <TabsTrigger value="calendar">Calendario</TabsTrigger>
                  <TabsTrigger value="logs">Bitácora</TabsTrigger>
                  <TabsTrigger value="generated">Generados</TabsTrigger>
                  <TabsTrigger value="details">Detalle</TabsTrigger>
                </TabsList>
                <TabsContent value="calendar" className="flex-1 overflow-auto px-4 pb-4">
                  <PreventivePlanCalendar planId={selectedPlan.id} />
                </TabsContent>
                <TabsContent value="logs" className="flex-1 overflow-auto px-4 pb-4">
                  <PreventivePlanExecutionLog planId={selectedPlan.id} />
                </TabsContent>
                <TabsContent value="generated" className="flex-1 overflow-hidden px-4 pb-4">
                  <PreventivePlanGeneratedItems planId={selectedPlan.id} />
                </TabsContent>
                <TabsContent value="details" className="flex-1 overflow-auto px-4 pb-4">
                  <div className="space-y-3 pt-2">
                    <DetailRow label="Objetivo" value={
                      selectedPlan.targetType === 'Asset'
                        ? `Activo: ${selectedPlan.assetName}`
                        : `Plantilla: ${selectedPlan.assetTemplateName}`
                    } />
                    <DetailRow label="Tipo generado" value={ENTITY_TYPE_LABELS[selectedPlan.generatedEntityType] || selectedPlan.generatedEntityType} />
                    <DetailRow label="Frecuencia" value={`${cronToHuman(selectedPlan.cronExpression)} (${selectedPlan.cronExpression})`} />
                    <DetailRow label="Días hasta vencimiento" value={String(selectedPlan.dueDateOffsetDays)} />
                    <DetailRow label="Asignación automática" value={selectedPlan.autoAssign ? 'Sí' : 'No'} />
                    <DetailRow label="Estado" value={selectedPlan.isActive ? 'Activo' : 'Pausado'} />
                    {selectedPlan.lastRunAt && (
                      <DetailRow label="Última ejecución" value={format(new Date(selectedPlan.lastRunAt.endsWith('Z') ? selectedPlan.lastRunAt : `${selectedPlan.lastRunAt}Z`), 'dd MMM yyyy HH:mm', { locale: es })} />
                    )}
                    {selectedPlan.endsAt && (
                      <DetailRow label="Finaliza el" value={format(new Date(selectedPlan.endsAt.endsWith('Z') ? selectedPlan.endsAt : `${selectedPlan.endsAt}Z`), 'dd MMM yyyy', { locale: es })} />
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>

      <PreventivePlanFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        plan={editingPlan}
      />
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-border/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
