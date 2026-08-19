import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Calendar,
  User,
  Users,
  History,
  MessageSquare,
  Package,
  AlertTriangle,
  FileText,
  ClipboardList,
  Loader2,
  Save,
  Send,
  ArrowRight,
  Link as LinkIcon,
} from 'lucide-react'
import {
  workTaskService,
  type WorkTaskSummary,
  type WorkTaskState,
  STATE_LABELS,
} from '@/services/work-task.service'
import { catalogService } from '@/services/catalog.service'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { apiClient as api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'

const PRIORITY_CATALOG_CODE = 'priority'
const TASK_TYPE_CATALOG_CODE = 'tasktype'

const STATE_VARIANTS: Record<WorkTaskState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  todo: 'secondary',
  in_progress: 'default',
  done: 'default',
  cancelled: 'destructive',
}

const ALLOWED_TRANSITIONS: Record<WorkTaskState, WorkTaskState[]> = {
  todo: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
}

interface WorkTaskDetailProps {
  task: WorkTaskSummary
  onClose: () => void
}

interface EmployeeOption { id: string; name: string }
interface TeamOption { id: string; name: string }

export function WorkTaskDetail({ task, onClose }: WorkTaskDetailProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('details')

  const { data: detail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['work-task', task.id],
    queryFn: () => workTaskService.getById(task.id),
  })

  const { data: historyEntries, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['work-task-history', task.id],
    queryFn: () => workTaskService.getHistory(task.id),
  })

  const { data: comments, isLoading: isLoadingComments } = useQuery({
    queryKey: ['work-task-comments', task.id],
    queryFn: () => workTaskService.getComments(task.id),
  })

  const { data: priorityItems } = useQuery({
    queryKey: ['catalog-items', PRIORITY_CATALOG_CODE],
    queryFn: () => catalogService.getCatalogItems(PRIORITY_CATALOG_CODE, 'es'),
  })

  const { data: taskTypeItems } = useQuery({
    queryKey: ['catalog-items', TASK_TYPE_CATALOG_CODE],
    queryFn: () => catalogService.getCatalogItems(TASK_TYPE_CATALOG_CODE, 'es'),
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [priorityCatalogItemId, setPriorityCatalogItemId] = useState('')
  const [taskTypeCatalogItemId, setTaskTypeCatalogItemId] = useState('')
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('')
  const [assignedTeamId, setAssignedTeamId] = useState('')
  const [assignedEmployeeName, setAssignedEmployeeName] = useState('')
  const [assignedTeamName, setAssignedTeamName] = useState('')

  useEffect(() => {
    if (detail) {
      setTitle(detail.title || task.title || '')
      setDescription(detail.description || '')
      setDueAt(detail.dueAt ? detail.dueAt.slice(0, 10) : '')
      setPriorityCatalogItemId(detail.priorityCatalogItemId)
      setTaskTypeCatalogItemId(detail.taskTypeCatalogItemId)
      setAssignedEmployeeId(detail.assignedEmployeeId || '')
      setAssignedTeamId(detail.assignedTeamId || '')
      setAssignedEmployeeName(task.assignedEmployeeName || '')
      setAssignedTeamName(task.assignedTeamName || '')
    }
  }, [detail, task])

  const updateMutation = useMutation({
    mutationFn: () =>
      workTaskService.update(task.id, {
        title: title || detail?.title || task.title,
        description,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        priorityCatalogItemId,
        taskTypeCatalogItemId,
        assignedEmployeeId: assignedEmployeeId || null,
        assignedTeamId: assignedTeamId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['work-task', task.id] })
      toast.success('Tarea actualizada')
    },
    onError: () => toast.error('Error al actualizar la tarea'),
  })

  const stateMutation = useMutation({
    mutationFn: (state: WorkTaskState) => workTaskService.changeState(task.id, state),
    onSuccess: (data) => {
      queryClient.setQueryData(['work-task', task.id], data)
      queryClient.invalidateQueries({ queryKey: ['work-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['work-task-history', task.id] })
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('Error al cambiar el estado'),
  })

  const assignMutation = useMutation({
    mutationFn: () =>
      workTaskService.assign(task.id, {
        assignedEmployeeId: assignedEmployeeId || undefined,
        assignedTeamId: assignedTeamId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['work-task', task.id] })
      toast.success('Asignación actualizada')
    },
    onError: () => toast.error('Error al asignar la tarea'),
  })

  const commentMutation = useMutation({
    mutationFn: (text: string) => workTaskService.addComment(task.id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-task-comments', task.id] })
      toast.success('Comentario agregado')
    },
    onError: () => toast.error('Error al agregar el comentario'),
  })

  const [commentText, setCommentText] = useState('')

  const handleSave = () => {
    updateMutation.mutate()
    if (assignedEmployeeId !== (detail?.assignedEmployeeId || '') || assignedTeamId !== (detail?.assignedTeamId || '')) {
      assignMutation.mutate()
    }
  }

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    commentMutation.mutate(commentText.trim(), {
      onSuccess: () => setCommentText(''),
    })
  }

  const displayedTask = detail || task
  const state = displayedTask.state
  const allowedStates = ALLOWED_TRANSITIONS[state] || []

  return (
    <Card className="flex flex-col overflow-hidden w-[45%] h-full">
      <CardHeader className="flex flex-row items-start justify-between border-b pb-4">
        <div className="min-w-0 flex-1">
          <Input
            className="text-lg font-semibold h-9 px-2 -ml-2 border-transparent hover:border-input focus-visible:border-input bg-transparent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={state === 'done' || state === 'cancelled'}
            placeholder="Título de la tarea"
          />
          <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={STATE_VARIANTS[state]}>{STATE_LABELS[state]}</Badge>
            {displayedTask.dueAt && (
              <span className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Vence {format(new Date(displayedTask.dueAt), 'dd MMM yyyy', { locale: es })}
              </span>
            )}
          </CardDescription>

          <div className="mt-4 border rounded-md p-2 bg-muted/10">
            {(!displayedTask.maintenanceOrderId && !displayedTask.incidentId && !displayedTask.preventivePlanId) && (
              <Badge variant="secondary" className="w-fit mb-2">Tarea Independiente</Badge>
            )}

            <div className="grid gap-1 text-sm">
              <RelatedLink
                icon={<FileText className="h-4 w-4" />}
                label="Orden de mantenimiento"
                name={displayedTask.maintenanceOrderTitle}
                id={displayedTask.maintenanceOrderId}
                to={displayedTask.maintenanceOrderId ? `/maintenance/orders?selected=${displayedTask.maintenanceOrderId}` : undefined}
                isPrimary={!!displayedTask.maintenanceOrderId}
              />
              <RelatedLink
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Incidencia"
                name={displayedTask.incidentTitle}
                id={displayedTask.incidentId}
                to={displayedTask.incidentId ? `/maintenance/incidents/${displayedTask.incidentId}` : undefined}
                isPrimary={!displayedTask.maintenanceOrderId && !!displayedTask.incidentId}
              />
              <RelatedLink
                icon={<ClipboardList className="h-4 w-4" />}
                label="Plan preventivo"
                name={displayedTask.preventivePlanName}
                id={displayedTask.preventivePlanId}
                to={displayedTask.preventivePlanId ? `/maintenance/preventive-plans?selected=${displayedTask.preventivePlanId}` : undefined}
                isPrimary={!displayedTask.maintenanceOrderId && !displayedTask.incidentId && !!displayedTask.preventivePlanId}
              />
              <RelatedLink
                icon={<Package className="h-4 w-4" />}
                label="Activo"
                name={displayedTask.assetName}
                id={displayedTask.assetId}
                to={displayedTask.assetId ? `/assets/${displayedTask.assetId}` : undefined}
                isPrimary={!displayedTask.maintenanceOrderId && !displayedTask.incidentId && !displayedTask.preventivePlanId && !!displayedTask.assetId}
              />
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="mx-4 mt-4 w-fit">
            <TabsTrigger value="details">Detalle</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="comments">Comentarios</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-auto px-4 pb-4">
            {isLoadingDetail ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-5 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="wt-description">Descripción</Label>
                  <Textarea
                    id="wt-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Sin descripción"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wt-dueAt">Vencimiento</Label>
                    <Input
                      id="wt-dueAt"
                      type="date"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Prioridad</Label>
                    <Select value={priorityCatalogItemId} onValueChange={setPriorityCatalogItemId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar prioridad" />
                      </SelectTrigger>
                      <SelectContent>
                        {priorityItems?.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label>Tipo de tarea</Label>
                    <Select value={taskTypeCatalogItemId} onValueChange={setTaskTypeCatalogItemId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {taskTypeItems?.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" /> Asignación
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        Empleado asignado
                      </Label>
                      <AsyncCombobox<EmployeeOption>
                        fetcher={async (query) => {
                          const { data } = await api.get<{ items: Array<{ id: string; firstName: string; lastName: string }> }>('/employees', {
                            params: { search: query, isActive: true },
                          })
                          return data.items.map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))
                        }}
                        labelKey="name"
                        valueKey="id"
                        placeholder="Buscar empleado..."
                        searchPlaceholder="Escriba para buscar..."
                        emptyText="No se encontraron empleados."
                        onSelect={(item) => {
                          setAssignedEmployeeId(item.id)
                          setAssignedEmployeeName(item.name)
                        }}
                        renderTrigger={(onClick) => (
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            onClick={onClick}
                            className="w-full justify-between font-normal"
                          >
                            {assignedEmployeeId ? assignedEmployeeName || assignedEmployeeId : 'Buscar empleado...'}
                            <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        Equipo asignado
                      </Label>
                      <AsyncCombobox<TeamOption>
                        fetcher={async (query) => {
                          const { data } = await api.get<{ items: TeamOption[] }>('/teams', {
                            params: { search: query },
                          })
                          return data.items
                        }}
                        labelKey="name"
                        valueKey="id"
                        placeholder="Buscar equipo..."
                        searchPlaceholder="Escriba para buscar..."
                        emptyText="No se encontraron equipos."
                        onSelect={(item) => {
                          setAssignedTeamId(item.id)
                          setAssignedTeamName(item.name)
                        }}
                        renderTrigger={(onClick) => (
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            onClick={onClick}
                            className="w-full justify-between font-normal"
                          >
                            {assignedTeamId ? assignedTeamName || assignedTeamId : 'Buscar equipo...'}
                            <Users className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Cambiar estado</h4>
                  <div className="flex flex-wrap gap-2">
                    {allowedStates.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No hay transiciones disponibles</span>
                    ) : (
                      allowedStates.map((target) => (
                        <Button
                          key={target}
                          variant="outline"
                          size="sm"
                          onClick={() => stateMutation.mutate(target)}
                          disabled={stateMutation.isPending}
                        >
                          {STATE_LABELS[target]}
                        </Button>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending || assignMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Guardar cambios
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-auto px-4 pb-4">
            <ScrollArea className="h-full">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !historyEntries || historyEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-md">
                  No hay historial de cambios.
                </div>
              ) : (
                <div className="relative space-y-4 pl-2 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                  {historyEntries.map((entry) => (
                    <div key={entry.id} className="relative flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted">
                        <History className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          {entry.fromState && (
                            <Badge variant="outline">{STATE_LABELS[entry.fromState as WorkTaskState] || entry.fromState}</Badge>
                          )}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge>{STATE_LABELS[entry.toState as WorkTaskState] || entry.toState}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(entry.changedAt), 'PPp', { locale: es })}
                          {entry.changedByName && ` · ${entry.changedByName}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="comments" className="flex flex-col flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="flex-1 pr-2">
              {isLoadingComments ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !comments || comments.length === 0 ? (
                <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-md">
                  No hay comentarios.
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="border rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
                      <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {format(new Date(comment.createdAt), 'PPp', { locale: es })}
                        {comment.createdByName && ` · ${comment.createdByName}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <form onSubmit={handleAddComment} className="mt-4 flex gap-2">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Escribir comentario..."
                className="min-h-[60px] resize-none"
              />
              <Button type="submit" size="icon" disabled={commentMutation.isPending || !commentText.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function RelatedLink({
  icon,
  label,
  name,
  id,
  to,
  isPrimary,
}: {
  icon: React.ReactNode
  label: string
  name?: string
  id?: string
  to?: string
  isPrimary?: boolean
}) {
  if (!id) return null
  const display = name || id

  return (
    <div className={`flex items-center gap-2 ${isPrimary ? 'bg-muted/50 p-2 rounded-md border' : 'p-2'}`}>
      <div className={isPrimary ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      {to ? (
        <Link to={to} className={`text-sm truncate hover:underline ${isPrimary ? 'font-semibold text-foreground' : 'font-medium'}`}>
          {display}
        </Link>
      ) : (
        <span className={`text-sm truncate ${isPrimary ? 'font-semibold text-foreground' : ''}`}>{display}</span>
      )}
      {isPrimary && <Badge variant="outline" className="ml-auto text-[10px] uppercase h-5">Origen</Badge>}
    </div>
  )
}
