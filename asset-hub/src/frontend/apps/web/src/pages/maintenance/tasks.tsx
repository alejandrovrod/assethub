import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { Plus, Loader2, Trash2, LayoutList, Kanban, Calendar, User, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react'
import { workTaskService, type WorkTaskState, type WorkTaskSummary } from '@/services/work-task.service'
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
import { parseApiDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'

const STATE_OPTIONS = [
  { value: 'all', labelKey: 'common:status.all' },
  { value: 'todo', labelKey: 'tasks.states.todo' },
  { value: 'rework', labelKey: 'tasks.states.rework' },
  { value: 'in_progress', labelKey: 'tasks.states.inProgress' },
  { value: 'done', labelKey: 'tasks.states.done' },
  { value: 'cancelled', labelKey: 'tasks.states.cancelled' },
] as const

const TASK_STATE_KEYS = {
  todo: 'tasks.states.todo',
  rework: 'tasks.states.rework',
  in_progress: 'tasks.states.inProgress',
  done: 'tasks.states.done',
  cancelled: 'tasks.states.cancelled',
} as const

const STATE_VARIANTS: Record<WorkTaskState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  todo: 'secondary',
  rework: 'outline',
  in_progress: 'default',
  done: 'default',
  cancelled: 'destructive',
}

export default function MaintenanceTasks() {
  const { t } = useTranslation(['maintenance', 'common'])
  const { can } = usePermissions()
  const canCreate = can('tasks:create')
  const canDelete = can('tasks:delete')
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTaskId = searchParams.get('selected')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<WorkTaskSummary | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [stateFilter, setStateFilter] = useState<WorkTaskState | 'all'>('all')
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, stateFilter, pageSize])

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }))
  }

  const { data, isLoading } = useQuery({
    queryKey: ['work-tasks', stateFilter, searchTerm, page, pageSize],
    queryFn: () =>
      workTaskService.getAll({
        state: stateFilter === 'all' ? undefined : stateFilter,
        search: searchTerm || undefined,
        page,
        pageSize,
      }),
  })

  const items = data?.items || []
  const totalCount = data?.totalCount || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  type RowItem =
    | { type: 'order'; orderId: string; orderTitle: string; orderState?: string; taskCount: number; tasks: WorkTaskSummary[] }
    | { type: 'task'; task: WorkTaskSummary; isChild: boolean }

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, WorkTaskSummary[]>()
    const independent: WorkTaskSummary[] = []

    for (const task of items) {
      if (task.maintenanceOrderId) {
        const orderId = task.maintenanceOrderId
        if (!groups.has(orderId)) {
          groups.set(orderId, [])
        }
        groups.get(orderId)!.push(task)
      } else {
        independent.push(task)
      }
    }

    const rows: RowItem[] = []

    groups.forEach((tasks, orderId) => {
      const orderTitle = tasks[0].maintenanceOrderTitle || t('tasks.untitledOrder')
      const orderState = tasks[0].maintenanceOrderState
      rows.push({ type: 'order', orderId, orderTitle, orderState, taskCount: tasks.length, tasks })

      if (expandedOrders[orderId]) {
        for (const task of tasks) {
          rows.push({ type: 'task', task, isChild: true })
        }
      }
    })

    for (const task of independent) {
      rows.push({ type: 'task', task, isChild: false })
    }

    return rows
  }, [items, expandedOrders, t])

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
      toast.success(t('toast.taskDeleted'))
      if (selectedTask?.id) {
        setSearchParams((prev) => {
          prev.delete('selected')
          return prev
        }, { replace: true })
      }
    },
    onError: () => toast.error(t('toast.taskDeleteError')),
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
    rework: [],
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
              <CardTitle>{t('tasks.title')}</CardTitle>
              <CardDescription>
                {t('tasks.description')}
              </CardDescription>
            </div>
            {canCreate && (
              <Button size="icon" onClick={handleCreate}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>

          <div className="px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-b">
            <Input
              placeholder={t('tasks.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={stateFilter}
              onValueChange={(value) => setStateFilter(value as WorkTaskState | 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('tasks.filterByState')} />
              </SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tabs value={view} onValueChange={(value) => setView(value as 'list' | 'kanban')} className="ml-auto">
              <TabsList>
                <TabsTrigger value="list" className="flex items-center gap-1">
                  <LayoutList className="h-4 w-4" />
                  {t('tasks.views.list')}
                </TabsTrigger>
                <TabsTrigger value="kanban" className="flex items-center gap-1">
                  <Kanban className="h-4 w-4" />
                  {t('tasks.views.kanban')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length > 0 ? (
                view === 'list' ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common:labels.title')}</TableHead>
                        <TableHead>{t('common:labels.status')}</TableHead>
                        <TableHead>{t('tasks.columns.due')}</TableHead>
                        <TableHead>{t('tasks.columns.assigned')}</TableHead>
                        <TableHead>{t('fields.asset')}</TableHead>
                        <TableHead>{t('common:labels.priority')}</TableHead>
                        <TableHead className="text-right">{t('common:labels.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedTasks.map((row) => {
                        if (row.type === 'order') {
                          const isExpanded = expandedOrders[row.orderId]
                          return (
                            <TableRow
                              key={`order-${row.orderId}`}
                              className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleOrder(row.orderId)}
                            >
                              <TableCell colSpan={7} className="font-medium">
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                  <span>{row.orderTitle}</span>
                                  {row.orderState && (
                                    <Badge variant="outline" className="ml-2 uppercase text-[10px]">
                                      {row.orderState === 'draft' ? t('tasks.orderStates.draft') :
                                        row.orderState === 'approved' ? t('tasks.orderStates.approved') :
                                          row.orderState === 'scheduled' ? t('tasks.orderStates.scheduled') :
                                            row.orderState === 'in_progress' ? t('tasks.orderStates.inProgress') :
                                              row.orderState === 'done' ? t('tasks.orderStates.done') :
                                                row.orderState === 'verified' ? t('tasks.orderStates.verified') :
                                                  row.orderState === 'cancelled' ? t('tasks.orderStates.cancelled') : row.orderState}
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="ml-2">{t('tasks.taskCount', { count: row.taskCount })}</Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        } else {
                          const task = row.task
                          return (
                            <TableRow
                              key={`task-${task.id}`}
                              className={`cursor-pointer hover:bg-muted/50 transition-colors ${row.isChild ? 'bg-background/50' : ''} ${selectedTask?.id === task.id ? 'bg-muted' : ''}`}
                              onClick={() => handleRowClick(task)}
                            >
                              <TableCell className={`font-medium max-w-xs truncate ${row.isChild ? 'pl-8' : ''}`} title={task.title}>
                                {row.isChild && <div className="inline-block w-4 h-4 border-l-2 border-b-2 border-muted-foreground/30 mr-2 -translate-y-1 rounded-bl-sm" />}
                                {task.title}
                              </TableCell>
                              <TableCell>
                                <Badge variant={STATE_VARIANTS[task.state]}>{t(TASK_STATE_KEYS[task.state])}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {task.dueAt
                                  ? format(parseApiDate(task.dueAt), 'dd MMM yyyy', { locale: es })
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
                                    {canDelete && (
                                      <AlertDialog>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                              <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                          </AlertDialogTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('common:actions.delete')}</TooltipContent>
                                      </Tooltip>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>{t('dialog.deleteTaskTitle')}</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            {t('dialog.deleteTaskBody', { title: task.title })}
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteMutation.mutate(task.id)}>
                                            {t('common:actions.delete')}
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                       </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                  </div>
                                </TooltipProvider>
                              </TableCell>
                            </TableRow>
                          )
                        }
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(['todo', 'in_progress', 'done', 'cancelled'] as WorkTaskState[]).map((state) => (
                      <div key={state} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-1">
                          <h3 className="text-sm font-medium">{t(TASK_STATE_KEYS[state])}</h3>
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
                                      {format(parseApiDate(task.dueAt), 'dd MMM', { locale: es })}
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
                  <p>{t('empty.tasks')}</p>
                  {canCreate && (
                    <Button variant="link" onClick={handleCreate}>
                      {t('empty.createFirstTask')}
                    </Button>
                  )}
                </div>
              )}
            </ScrollArea>
            {/* Pagination Controls */}
            {!isLoading && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {t('tasks.totalCount', { count: totalCount })}
                  </span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">{t('pagination.perPage', { count: 10 })}</SelectItem>
                      <SelectItem value="20">{t('pagination.perPage', { count: 20 })}</SelectItem>
                      <SelectItem value="50">{t('pagination.perPage', { count: 50 })}</SelectItem>
                      <SelectItem value="100">{t('pagination.perPage', { count: 100 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    {t('common:pagination.previous')}
                  </Button>
                  <div className="flex items-center text-sm px-2">
                    {t('common:pagination.page', { page })} {t('common:pagination.of', { total: totalPages })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages}
                  >
                    {t('common:pagination.next')}
                  </Button>
                </div>
              </div>
            )}
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
