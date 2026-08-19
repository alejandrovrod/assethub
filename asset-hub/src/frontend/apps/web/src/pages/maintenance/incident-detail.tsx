import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ArrowLeft, AlertTriangle, Pencil, Save, Image as ImageIcon, FileText, Download, ArrowRight, Clock, User } from 'lucide-react'
import { incidentService, IncidentAttachment, IncidentTimelineEvent } from '@/services/incident.service'
import { incidentTemplateService } from '@/services/incident-template.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageLightbox } from '@/components/widgets/image-lightbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { toast } from 'sonner'
import Form from '@rjsf/core'
import { customValidator as validator } from '@/lib/rjsf-validator'
import { FileUploadWidget } from '@/components/widgets/FileUploadWidget'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'
import { IncidentTasksWidget } from './components/incident-tasks-widget'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { handleServerError } from '@/lib/handle-server-error'
import { useResolvedSchema } from '@/hooks/use-resolved-schema'

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<any>({})
  const [isEditingDynamic, setIsEditingDynamic] = useState(false)

  // State Transition Modal
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false)
  const [pendingTargetState, setPendingTargetState] = useState<string | null>(null)
  const [transitionData, setTransitionData] = useState<Record<string, string>>({})

  const { data: incident, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidentService.getById(id!),
    enabled: !!id
  })

  const { data: template } = useQuery({
    queryKey: ['incident-template', incident?.incidentTemplateId],
    queryFn: () => incidentTemplateService.getById(incident!.incidentTemplateId!),
    enabled: !!incident?.incidentTemplateId
  })

  const { data: timelineEvents, isLoading: isLoadingTimeline } = useQuery({
    queryKey: ['incident-timeline', id],
    queryFn: () => incidentService.getTimeline(id!),
    enabled: !!id
  })

  // Set initial form data
  useEffect(() => {
    if (incident?.propertiesJson) {
      try {
        setFormData(JSON.parse(incident.propertiesJson))
      } catch (e) {
        setFormData({})
      }
    }
  }, [incident])

  const setCustomTitle = useBreadcrumbStore(state => state.setCustomTitle)
  useEffect(() => {
    if (incident?.title) {
      setCustomTitle(incident.title)
    }
    return () => setCustomTitle(null)
  }, [incident?.title, setCustomTitle])

  // Process template schema
  const { schema, isResolving } = useResolvedSchema(template?.schemaJson || '')

  const lifecycleConfig = useMemo(() => {
    if (!template?.lifecycleStates) return null
    return typeof template.lifecycleStates === 'string' 
      ? JSON.parse(template.lifecycleStates) 
      : template.lifecycleStates
  }, [template])

  const availableTransitions = useMemo(() => {
    if (!incident || !lifecycleConfig) return []
    // Support both formats just in case
    const fromTransitionsMap = lifecycleConfig.transitions?.[incident.state]
    const fromStateNode = lifecycleConfig.states?.[incident.state]?.allowedTransitions
    return fromTransitionsMap || fromStateNode || []
  }, [incident, lifecycleConfig])

  const transitionSchema = useMemo(() => {
    if (!lifecycleConfig || !pendingTargetState || !schema) return null
    const targetConfig = lifecycleConfig.states?.[pendingTargetState]
    if (targetConfig?.requiresFields && targetConfig.requiresFields.length > 0) {
      const subSchema: any = { type: 'object', properties: {}, required: [] }
      for (const field of targetConfig.requiresFields) {
        if ((schema as any)?.properties?.[field]) {
          subSchema.properties[field] = (schema as any).properties[field]
          subSchema.required.push(field)
        }
      }
      return subSchema
    }
    return targetConfig?.propertiesSchema || null
  }, [lifecycleConfig, pendingTargetState, schema])

  const stateMutation = useMutation({
    mutationFn: (args: { targetState: string, propertiesJson?: string }) => incidentService.changeState(id!, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      queryClient.invalidateQueries({ queryKey: ['incident-timeline', id] })
      toast.success('Estado actualizado')
      setTransitionDialogOpen(false)
      setPendingTargetState(null)
      setTransitionData({})
    },
    onError: (err) => handleServerError(err)
  })

  // We reuse state mutation for properties update if there's no dedicated update endpoint yet, 
  // or we could use the state change endpoint to just update properties with the same state.
  // Assuming there's no update endpoint yet, we just patch the state with the same state and new properties.
  const updatePropertiesMutation = useMutation({
    mutationFn: (propertiesJson: string) => incidentService.changeState(id!, { targetState: incident!.state, propertiesJson }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      queryClient.invalidateQueries({ queryKey: ['incident-timeline', id] })
      toast.success('Incidencia actualizada exitosamente')
      setIsEditingDynamic(false)
    },
    onError: (err) => handleServerError(err)
  })

  const handleStateClick = (targetState: string) => {
    const targetConfig = lifecycleConfig?.states?.[targetState]
    if (targetConfig?.requiresFields && targetConfig.requiresFields.length > 0) {
      setPendingTargetState(targetState)
      setTransitionDialogOpen(true)
    } else {
      // Just change state without additional properties
      stateMutation.mutate({ targetState })
    }
  }

  const getTransitionBlockReason = (targetState: string): string | null => {
    if (targetState !== 'closed') return null
    if (incident?.maintenanceOrder && incident.maintenanceOrder.state !== 'done' && incident.maintenanceOrder.state !== 'cancelled') {
      return 'No se puede cerrar: Hay una orden de mantenimiento correctiva activa.'
    }
    if (incident?.workTasks?.some(t => t.state !== 'done' && t.state !== 'cancelled')) {
      return 'No se puede cerrar: Hay tareas abiertas asociadas a esta incidencia.'
    }
    return null
  }

  const handleTransitionSubmit = () => {
    if (!pendingTargetState) return
    stateMutation.mutate({
      targetState: pendingTargetState,
      propertiesJson: JSON.stringify(transitionData)
    })
  }

  const handleDynamicSubmit = ({ formData }: any) => {
    updatePropertiesMutation.mutate(JSON.stringify(formData))
  }

  if (isLoading) {
    return <div className="flex h-[200px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  if (!incident) return <div>Incidencia no encontrada.</div>

  return (
    <div className="flex flex-col gap-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-lg border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/maintenance/incidents')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {incident.title}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-sm">Estado: {incident.state}</Badge>
              <span className="text-muted-foreground text-sm">Activo: {incident.assetName}</span>
              <span className="text-muted-foreground text-sm">
                | Reportado: {format(new Date(incident.createdAt || new Date()), 'PPp', { locale: es })}
              </span>
            </div>
          </div>
        </div>

        {/* TRANSITIONS BAR */}
        <div className="flex items-center gap-2 bg-card border rounded-lg p-1.5 shadow-sm">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold px-2">
            Cambiar estado a:
          </span>
          {availableTransitions.length === 0 ? (
            <span className="text-sm text-muted-foreground italic px-2">Ninguno disponible</span>
          ) : (
            availableTransitions.map((targetState: string) => {
              const blockReason = getTransitionBlockReason(targetState)
              return (
                <Button 
                  key={targetState} 
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handleStateClick(targetState)}
                  disabled={stateMutation.isPending || !!blockReason}
                  title={blockReason || `Cambiar a ${targetState}`}
                >
                  {targetState}
                </Button>
              )
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* LEFT COL - MAIN DATA */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="details">Detalles</TabsTrigger>
              <TabsTrigger value="timeline">Bitácora</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Descripción General</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{incident.description || 'Sin descripción.'}</p>
                </CardContent>
              </Card>

              {/* DYNAMIC PROPERTIES */}
              {schema && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle>Información de la Incidencia</CardTitle>
                      <CardDescription>
                        Atributos específicos ({template?.name}).
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsEditingDynamic(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {isResolving ? (
                      <div className="text-sm text-muted-foreground italic">Resolviendo catálogos...</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.keys(formData).length === 0 && (
                          <p className="text-muted-foreground text-sm italic col-span-full">
                            No hay atributos configurados.
                          </p>
                        )}
                        {Object.keys(formData).map(key => {
                          const fieldSchema = (schema as any)?.properties?.[key]
                          const title = fieldSchema?.title || key
                          let value = formData[key]
                          
                          if (value && fieldSchema?.oneOf && !Array.isArray(value)) {
                            const matchedOption = fieldSchema.oneOf.find((opt: any) => opt.const === value)
                            if (matchedOption?.title) value = matchedOption.title
                          } else if (value && fieldSchema?.type === 'array' && fieldSchema?.items?.oneOf && Array.isArray(value)) {
                            value = value.map((val: any) => {
                              const matchedOption = fieldSchema.items.oneOf.find((opt: any) => opt.const === val)
                              return matchedOption?.title || val
                            }).join(', ')
                          }

                          const isDataUrl = fieldSchema?.format === 'data-url' || fieldSchema?.items?.format === 'data-url';
                          const valuesArray = Array.isArray(value) ? value : (value ? [value] : []);

                          return (
                            <div key={key}>
                              <p className="text-sm font-medium text-muted-foreground">{title}</p>
                              {isDataUrl && valuesArray.length > 0 ? (
                                <ImageLightbox urls={valuesArray as string[]} />
                              ) : (
                                <p className="mt-1">{value?.toString() || '-'}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="timeline">
              <Card>
                <CardHeader>
                  <CardTitle>Bitácora de Eventos</CardTitle>
                  <CardDescription>
                    Historial de cambios de estado y acciones de esta incidencia.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingTimeline ? (
                    <div className="flex h-32 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !timelineEvents || timelineEvents.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-md">
                      No hay eventos registrados en la bitácora.
                    </div>
                  ) : (
                    <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                      {timelineEvents.map((event, index) => {
                        let parsedProps = null
                        if (event.propertiesJson && event.propertiesJson !== '{}') {
                          try {
                            parsedProps = JSON.parse(event.propertiesJson)
                          } catch (e) {}
                        }

                        return (
                          <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-card border rounded-lg p-4 shadow-sm">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-sm text-foreground capitalize">{event.eventType}</span>
                                <time className="text-xs text-muted-foreground">{format(new Date(event.at), 'PPp', { locale: es })}</time>
                              </div>
                              <div className="text-sm text-muted-foreground mb-2">
                                {event.notes || 'Sin detalles adicionales'}
                              </div>
                              {event.fromState && event.toState && (
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className="text-xs font-normal">{event.fromState}</Badge>
                                  <ArrowLeft className="h-3 w-3 rotate-180 text-muted-foreground" />
                                  <Badge className="text-xs font-normal bg-primary/10 text-primary hover:bg-primary/20">{event.toState}</Badge>
                                </div>
                              )}
                              
                              <div className="flex items-center text-xs text-muted-foreground gap-1 mt-2">
                                <User className="h-3 w-3" />
                                <span>{event.userId === '00000000-0000-0000-0000-000000000000' ? 'Sistema / Autenticado' : event.userId}</span>
                              </div>

                              {parsedProps && Object.keys(parsedProps).length > 0 && (
                                <div className="mt-3 bg-muted/50 rounded-md p-3 text-xs border">
                                  <p className="font-semibold mb-1 border-b pb-1">Datos ingresados:</p>
                                  <div className="grid grid-cols-1 gap-2 mt-2">
                                    {Object.keys(parsedProps).map(key => (
                                      <div key={key} className="flex justify-between gap-4">
                                        <span className="text-muted-foreground truncate">{key}:</span>
                                        <span className="font-medium text-right break-all">{String(parsedProps[key])}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT COL - ATTACHMENTS & METADATA */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metadatos</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-4">
              <div>
                <span className="text-muted-foreground block mb-1">ID Interno</span>
                <code className="bg-muted px-2 py-1 rounded text-xs break-all">{incident.id}</code>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Fecha de Creación</span>
                <span>{incident.reportedAt ? new Date(incident.reportedAt).toLocaleDateString() : '-'}</span>
              </div>
              {incident.resolvedAt && (
                <div>
                  <span className="text-muted-foreground block mb-1">Fecha de Resolución</span>
                  <span>{new Date(incident.resolvedAt).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {incident.maintenanceOrder && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Orden Generada</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/maintenance/orders?selected=${incident.maintenanceOrder.id}`}
                  className="flex items-center justify-between p-2 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={incident.maintenanceOrder.title}>
                      {incident.maintenanceOrder.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      {incident.maintenanceOrder.scheduledStart && (
                        <span>Prog. {format(new Date(incident.maintenanceOrder.scheduledStart), 'dd MMM', { locale: es })}</span>
                      )}
                      {incident.maintenanceOrder.assignedEmployeeName && (
                        <span>· {incident.maintenanceOrder.assignedEmployeeName}</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0 capitalize">
                    {incident.maintenanceOrder.state}
                  </Badge>
                </Link>
              </CardContent>
            </Card>
          )}

          {id && <IncidentTasksWidget incidentId={id} />}
        </div>
      </div>

      {/* FULLSCREEN EDIT MODAL FOR DYNAMIC ATTRIBUTES */}
      <Sheet open={isEditingDynamic} onOpenChange={setIsEditingDynamic}>
        <SheetContent className="w-full sm:max-w-full flex flex-col p-0 h-full" aria-describedby={undefined}>
          <div className="p-6 pb-2 border-b">
            <SheetHeader>
              <SheetTitle>Editar Información Dinámica</SheetTitle>
              <SheetDescription>
                Modifica los atributos dinámicos de {incident.title}
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="rjsf-tailwind mt-6">
              {isResolving ? (
                <div className="flex h-[200px] items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Form 
                  schema={schema || {}} 
                  validator={validator}
                  formData={formData}
                  onChange={e => setFormData(e.formData)}
                  onSubmit={handleDynamicSubmit}
                  widgets={{ FileWidget: FileUploadWidget }}
                >
                  <div className="flex justify-end mt-6 gap-2 border-t pt-4">
                    <Button variant="outline" type="button" onClick={() => setIsEditingDynamic(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={updatePropertiesMutation.isPending}>
                      {updatePropertiesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Save className="mr-2 h-4 w-4" />
                      Guardar Cambios
                    </Button>
                  </div>
                </Form>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* TRANSITION MODAL */}
      <Dialog open={transitionDialogOpen} onOpenChange={setTransitionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar a '{pendingTargetState}'</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Este estado requiere información adicional antes de continuar.
            </p>
            {transitionSchema && (
              <div className="rjsf-tailwind">
                <Form
                  schema={transitionSchema}
                  validator={validator}
                  formData={transitionData}
                  onChange={(e) => setTransitionData(e.formData)}
                  widgets={{ FileWidget: FileUploadWidget }}
                  children={<></>}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleTransitionSubmit} disabled={stateMutation.isPending}>
              {stateMutation.isPending ? 'Guardando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
