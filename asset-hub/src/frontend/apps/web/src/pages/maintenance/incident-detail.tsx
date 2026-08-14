import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ArrowLeft, AlertTriangle } from 'lucide-react'
import { incidentService } from '@/services/incident.service'
import { incidentTemplateService } from '@/services/incident-template.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { handleServerError } from '@/lib/handle-server-error'

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<any>({})
  const isEditingDynamic = false

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
  const schema = useMemo(() => {
    if (!template?.schemaJson) return null
    try {
      return JSON.parse(template.schemaJson)
    } catch {
      return null
    }
  }, [template])

  const lifecycleConfig = useMemo(() => {
    if (!template?.lifecycleStates) return null
    return typeof template.lifecycleStates === 'string' 
      ? JSON.parse(template.lifecycleStates) 
      : template.lifecycleStates
  }, [template])

  const availableTransitions = useMemo(() => {
    if (!incident || !lifecycleConfig) return []
    const currentStateConfig = lifecycleConfig.states?.[incident.state]
    return currentStateConfig?.allowedTransitions || []
  }, [incident, lifecycleConfig])

  const transitionSchema = useMemo(() => {
    if (!lifecycleConfig || !pendingTargetState) return null
    return lifecycleConfig.states?.[pendingTargetState]?.propertiesSchema || null
  }, [lifecycleConfig, pendingTargetState])

  const stateMutation = useMutation({
    mutationFn: (args: { targetState: string, propertiesJson?: string }) => incidentService.changeState(id!, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      toast.success('Estado actualizado')
      setTransitionDialogOpen(false)
      setPendingTargetState(null)
      setTransitionData({})
    },
    onError: (error: any) => {
      handleServerError(error)
    }
  })

  const handleStateClick = (targetState: string) => {
    setPendingTargetState(targetState)
    const nextSchema = lifecycleConfig?.states?.[targetState]?.propertiesSchema
    
    // If the target state defines a schema to be filled out during transition, open the modal
    if (nextSchema && Object.keys(nextSchema).length > 0) {
      setTransitionData({})
      setTransitionDialogOpen(true)
    } else {
      // Otherwise, transition directly
      if (window.confirm(`¿Confirmar cambio de estado a '${targetState}'?`)) {
        stateMutation.mutate({ targetState })
      } else {
        setPendingTargetState(null)
      }
    }
  }

  const handleTransitionSubmit = () => {
    if (!pendingTargetState) return
    stateMutation.mutate({
      targetState: pendingTargetState,
      propertiesJson: JSON.stringify(transitionData)
    })
  }

  if (isLoading || !incident) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      {/* HEADER SECTION */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/maintenance/incidents')} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
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

        {/* STATE ACTION BUTTONS */}
        <div className="flex gap-2">
          {availableTransitions.map((targetState: string) => (
            <Button 
              key={targetState} 
              variant="default"
              onClick={() => handleStateClick(targetState)}
              disabled={stateMutation.isPending}
            >
              Marcar como '{targetState}'
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none px-0 h-auto pb-px">
          <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2 pt-2">
            Detalles
          </TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2 pt-2">
            Bitácora
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <div className="grid grid-cols-[2fr_1fr] gap-6">
            <div className="flex flex-col gap-6">
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
                      <CardTitle>Propiedades Adicionales</CardTitle>
                      <CardDescription>
                        Información específica según el tipo de incidencia ({template?.name}).
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rjsf-theme-default">
                      <Form
                        schema={schema}
                        validator={validator}
                        formData={formData}
                        onChange={(e) => setFormData(e.formData)}
                        disabled={!isEditingDynamic}
                        children={<></>} // Hide default submit button
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Bitácora de Eventos</CardTitle>
              <CardDescription>
                Historial de cambios de estado y acciones de esta incidencia. (Próximamente)
              </CardDescription>
            </CardHeader>
            <CardContent>
               <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-md">
                 Acá se listarán los eventos específicos de la incidencia (reportado, cambios de estado con propiedades requeridas por el módulo, etc).
               </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* TRANSITION MODAL (For module delegation / properties on state change) */}
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
              <div className="rjsf-theme-default">
                <Form
                  schema={transitionSchema}
                  validator={validator}
                  formData={transitionData}
                  onChange={(e) => setTransitionData(e.formData)}
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
