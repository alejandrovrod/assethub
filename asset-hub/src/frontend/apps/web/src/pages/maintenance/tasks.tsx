import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { Plus, Loader2, Pencil, Trash2, LayoutList, Kanban, Calendar, User, AlertCircle } from 'lucide-react'
import { workTaskService, type WorkTaskSummary, type WorkTaskState, STATE_LABELS } from '@/services/work-task.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WorkTaskDetail } from './components/work-task-detail'
import { WorkTaskFormSheet } from './components/work-task-form-sheet'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const STATE_OPTIONS: { value: WorkTaskState | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'todo', label: 'Por hacer' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'done', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
]

const STATE_VARIANTS: Record<WorkTaskState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  todo: 'secondary',
  in_progress: 'default',
  done: 'default',
  cancelled: 'destructive',
}

export default function MaintenanceTasks() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTaskId = searchParams.get('selected')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<WorkTaskSummary | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [stateFilter, setStateFilter] = useState<WorkTaskState | 'all'>('all')
  const [view, setView] = useState<'list' | 'kanban'>('list')

  const { data, isLoading } = useQuery({
    queryKey: ['work-tasks', stateFilter, searchTerm],
    queryFn: () =>
      workTaskService.getAll({
        state: stateFilter === 'all' ? undefined : stateFilter,
        search: searchTerm || undefined,
        pageSize: 100,
      }),
  })

  const items = data?.items || []

  useEffect(() => {
    if (selectedTaskId) {
      if (!selectedTask || selectedTask.id !== selectedTaskId) {
        const found = items.find((t) => t.id === selectedTaskId)
        if (found) {
          setSelectedTask(found)
        } else {
          workTaskService.getById(selectedTaskId)
            .then((task) => setSelectedTask(task as WorkTaskSummary))
            .catch(console.error)
        }
      }
    } else {
      setSelectedTask(undefined)
    }
  }, [selectedTaskId, items, selectedTask])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workTaskService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-tasks'] })
      toast.success('Tarea eliminada')
      if (selectedTask?.id) {
        setSearchParams((prev) => {
          prev.delete('selected')
          return prev
        }, { replace: true })
      }
    },
    onError: () => toast.error('Error al eliminar la tarea'),
  })

  const handleCreate = () => {
    setIsFormOpen(true)
  }

  const handleRowClick = (task: WorkTaskSummary) => {
    setSearchParams((prev) => {
      prev.set('selected', task.id)
      return prev
    })
  }

  const tasksByState: Record<WorkTaskState, WorkTaskSummary[]> = {
    todo: [],
    in_progress: [],
    done: [],
    cancelled: [],
  }
  for (const task of items) {
    tasksByState[task.state].push(task)
  }

  return (
    <div className="flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Main list */}
        <Card className={`flex flex-1 flex-col overflow-hidden ${selectedTask ? 'max-w-[55%]' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle>Tareas de Mantenimiento</CardTitle>
              <CardDescription>
                Seguimiento de tareas de mantenimiento, asignaciones y vencimientos.
              </CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva tarea
            </Button>
          </CardHeader>

          <div className="px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-b">
            <Input
              placeholder="Buscar por título..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={stateFilter}
              onValueChange={(value) => setStateFilter(value as WorkTaskState | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tabs value={view} onValueChange={(value) => setView(value as 'list' | 'kanban')} className="ml-auto">
              <TabsList>
                <TabsTrigger value="list" className="flex items-center gap-1">
                  <LayoutList className="h-4 w-4" />
                  Lista
                </TabsTrigger>
                <TabsTrigger value="kanban" className="flex items-center gap-1">
                  <Kanban className="h-4 w-4" />
                  Kanban
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length > 0 ? (
                view === 'list' ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead>Asignado</TableHead>
                        <TableHead>Activo</TableHead>
                        <TableHead>Prioridad</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((task) => (
                        <TableRow
                          key={task.id}
                          className="cursor-pointer"
                          onClick={() => handleRowClick(task)}
                        >
                          <TableCell className="font-medium max-w-xs truncate" title={task.title}>
                            {task.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATE_VARIANTS[task.state]}>{STATE_LABELS[task.state]}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {task.dueAt
                              ? format(new Date(task.dueAt), 'dd MMM yyyy', { locale: es })
                              : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {task.assignedEmployeeName || task.assignedTeamName || '—'}
                          </TableCell>
                          <TableCell className="text-sm max-w-xs truncate" title={task.assetName}>
                            {task.assetName || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{task.priorityLabel || task.priorityCatalogItemId}</Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <TooltipProvider>
                              <div className="flex items-center justify-end gap-1">
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
                                      <AlertDialogTitle>¿Eliminar tarea?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta acción eliminará la tarea &quot;{task.title}&quot;. No se puede
                                        deshacer.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteMutation.mutate(task.id)}>
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
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(['todo', 'in_progress', 'done', 'cancelled'] as WorkTaskState[]).map((state) => (
                      <div key={state} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-1">
                          <h3 className="text-sm font-medium">{STATE_LABELS[state]}</h3>
                          <Badge variant="outline">{tasksByState[state].length}</Badge>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-2 space-y-2 min-h-[120px]">
                          {tasksByState[state].map((task) => (
                            <Card
                              key={task.id}
                              className="cursor-pointer hover:shadow-sm"
                              onClick={() => handleRowClick(task)}
                            >
                              <CardContent className="p-3 space-y-2">
                                <p className="text-sm font-medium line-clamp-2" title={task.title}>
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {task.dueAt && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(task.dueAt), 'dd MMM', { locale: es })}
                                    </span>
                                  )}
                                  {(task.assignedEmployeeName || task.assignedTeamName) && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {task.assignedEmployeeName || task.assignedTeamName}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline" className="text-xs">
                                    {task.priorityLabel || task.priorityCatalogItemId}
                                  </Badge>
                                  {task.assetName && (
                                    <span className="text-xs text-muted-foreground truncate max-w-[80px]" title={task.assetName}>
                                      {task.assetName}
                                    </span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p>No hay tareas de mantenimiento.</p>
                  <Button variant="link" onClick={handleCreate}>
                    Crear la primera
                  </Button>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selectedTask && (
          <WorkTaskDetail
            task={selectedTask}
            onClose={() => {
              setSelectedTask(undefined)
              setSearchParams((prev) => {
                prev.delete('selected')
                return prev
              }, { replace: true })
            }}
          />
        )}
      </div>

      <WorkTaskFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
      />
    </div>
  )
}
