import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useResolvedSchema } from '@/hooks/use-resolved-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Save, GitBranch, Link as LinkIcon, Network } from 'lucide-react'
import { assetService } from '@/services/asset.service'
import { FileUploadWidget } from '@/components/widgets/FileUploadWidget'
import { EmployeeSelectWidget } from '@/components/widgets/EmployeeSelectWidget'
import { TeamSelectWidget } from '@/components/widgets/TeamSelectWidget'
import { ImageLightbox } from '@/components/widgets/image-lightbox'
import { employeeService } from '@/services/employee.service'
import { teamService } from '@/services/team.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import Form from '@rjsf/core'
import { customValidator as validator } from '@/lib/rjsf-validator'
import { Pencil, Check, X, Cpu, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'
import { AssetTimeline } from './components/timeline'
import { PreventivePlanAssetWidget } from '@/pages/maintenance/preventive-plans/components/preventive-plan-asset-widget'
import { AssetTasksWidget } from '@/pages/maintenance/components/asset-tasks-widget'
import { AssetIncidentsWidget } from '@/pages/maintenance/components/asset-incidents-widget'
import { AssetMaintenanceOrdersWidget } from '@/pages/maintenance/components/asset-maintenance-orders-widget'
import { ReportIncidentSheet } from '@/pages/maintenance/components/report-incident-sheet'
import { MaintenanceOrderFormSheet } from '@/pages/maintenance/orders/components/maintenance-order-form-sheet'
import { AssetMap } from '@/components/map/AssetMap'
import { AssetMaterialsTable } from './components/asset-materials-table'
import { parseApiDate } from '@/lib/utils'

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<any>({})
  const [isEditingGeneral, setIsEditingGeneral] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [isEditingDynamic, setIsEditingDynamic] = useState(false)

  // State Transition Modal
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false)
  const [pendingTargetState, setPendingTargetState] = useState<string | null>(null)
  const [transitionData, setTransitionData] = useState<Record<string, string>>({})

  // Module Delegation
  const [moduleDelegationOpen, setModuleDelegationOpen] = useState(false)
  const [targetModule, setTargetModule] = useState<string | null>(null)

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetService.getAssetById(id!),
    enabled: !!id
  })

  const { data: forecast } = useQuery({
    queryKey: ['asset-health-forecast', id],
    queryFn: () => assetService.getHealthForecast(id!),
    enabled: !!id
  })

  const { data: allAssets } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetService.getAssets().then(res => res.items)
  })

  const { data: allEmployees } = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => employeeService.getAll({ pageSize: 1000 }).then(res => res.items)
  })

  const { data: allTeams } = useQuery({
    queryKey: ['teams', 'all'],
    queryFn: () => teamService.getAll({ pageSize: 1000 }).then(res => res.items)
  })

  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [selectedParentId, setSelectedParentId] = useState<string>('none')

  // Set initial form data
  useEffect(() => {
    if (asset?.propertiesJson) {
      try {
        setFormData(JSON.parse(asset.propertiesJson))
      } catch (e) {
        setFormData({})
      }
    }
    if (asset) {
      setEditName(asset.name)
      setEditCode(asset.code)
    }
  }, [asset])

  const setCustomTitle = useBreadcrumbStore(state => state.setCustomTitle)
  useEffect(() => {
    if (asset?.name) {
      setCustomTitle(asset.name)
    }
    return () => setCustomTitle(null)
  }, [asset?.name, setCustomTitle])

  const updateMutation = useMutation({
    mutationFn: (args: { code?: string, name?: string, propertiesJson?: string, latitude?: number, longitude?: number, geoJson?: string }) => {
      let geoJson = args.geoJson
      if (geoJson === undefined && args.latitude !== undefined && args.longitude !== undefined) {
        geoJson = JSON.stringify({ type: 'Point', coordinates: [args.longitude, args.latitude] })
      }
      return assetService.updateAsset(id!, {
        code: args.code ?? asset!.code,
        name: args.name ?? asset!.name,
        installedAt: asset!.installedAt,
        commissionedAt: asset!.commissionedAt,
        conditionIndex: asset!.conditionIndex,
        propertiesJson: args.propertiesJson ?? (asset!.propertiesJson || '{}'),
        geoJson
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Activo actualizado exitosamente')
      setIsEditingDynamic(false)
      setIsEditingGeneral(false)
    },
    onError: (error: unknown) => {
      handleServerError(error)
    }
  })

  const stateMutation = useMutation({
    mutationFn: (args: { toState: string, transitionData?: Record<string, string> }) => assetService.changeState(id!, args.toState, args.transitionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Estado cambiado exitosamente')
      setTransitionDialogOpen(false)
      setPendingTargetState(null)
      setTransitionData({})
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.title || 'Error al cambiar de estado')
    }
  })

  const moveMutation = useMutation({
    mutationFn: (newParentId: string | null) => assetService.moveAsset(id!, newParentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      setMoveDialogOpen(false)
      toast.success('Padre actualizado exitosamente')
    },
    onError: () => toast.error('Error al cambiar el padre')
  })

  const { schema, uiSchema, isResolving } = useResolvedSchema(asset?.schemaJson || '')

  // Parse Lifecycle safely before early returns
  let lifecycle = { transitions: {} as Record<string, string[]>, states: {} as Record<string, any> }
  if (asset) {
    try {
      lifecycle = typeof asset.lifecycleStates === 'string' 
        ? JSON.parse(asset.lifecycleStates) 
        : (asset.lifecycleStates || lifecycle)
    } catch (e) {}
  }

  const availableTransitions = asset ? (lifecycle.transitions?.[asset.state] || []) : []
  const currentStateConfig = asset ? (lifecycle.states?.[asset.state] || {}) : {}

  const transitionSchema = useMemo(() => {
    if (!lifecycle || !pendingTargetState || !schema) return null
    const targetConfig = lifecycle.states?.[pendingTargetState]
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
  }, [lifecycle, pendingTargetState, schema])

  if (isLoading) {
    return (
      <div className="flex flex-1 justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold mb-4">Activo no encontrado</h2>
        <Button onClick={() => navigate('/assets')}>Volver a Activos</Button>
      </div>
    )
  }



  const handleStateChangeClick = (nextState: string) => {
    const nextStateConfig = lifecycle.states?.[nextState] || {}
    
    if (nextStateConfig.associatedModule) {
      setPendingTargetState(nextState)
      setTargetModule(nextStateConfig.associatedModule)
      setModuleDelegationOpen(true)
      return;
    }

    const requiresFields = nextStateConfig.requiresFields || []
    
    if (requiresFields.length > 0) {
      setPendingTargetState(nextState)
      
      const initialData: Record<string, any> = {}
      requiresFields.forEach((field: string) => {
        if (formData[field] !== undefined && formData[field] !== null) {
          initialData[field] = formData[field]
        }
      })
      
      setTransitionData(initialData)
      setTransitionDialogOpen(true)
    } else {
      stateMutation.mutate({ toState: nextState })
    }
  }

  const onSubmit = ({ formData: newFormData }: any) => {
    updateMutation.mutate({ propertiesJson: JSON.stringify(newFormData) })
  }

  const parentAsset = allAssets?.find(a => a.id === asset?.parentId)
  const childAssets = allAssets?.filter(a => a.parentId === id) || []

  // Determine which available transitions would be inconsistent with the current state of children.
  const getTransitionBlockReason = (nextState: string): string | null => {
    const targetConfig = lifecycle.states?.[nextState]
    if (!targetConfig?.childStateDependencies?.length || childAssets.length === 0) return null

    for (const dep of targetConfig.childStateDependencies) {
      const conditionType = (dep.conditionType || dep.ConditionType || 'Any').toLowerCase()
      const childStates = dep.childStates || dep.ChildStates || []
      const targetState = dep.targetState || dep.TargetState || ''
      if (!targetState || targetState === nextState) continue

      const matching = childAssets.filter(c => childStates.includes(c.state))
      const conditionMet =
        conditionType === 'any'
          ? matching.length > 0
          : childAssets.length > 0 && matching.length === childAssets.length

      if (conditionMet) {
        const label = conditionType === 'any' ? 'al menos un hijo' : 'todos los hijos'
        const offending = matching.map(c => `${c.name} (${c.state})`).join(', ')
        return `${label} está en ${childStates.join(', ')}: ${offending}. El padre debería estar en ${targetState}.`
      }
    }
    return null
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0 w-full">
      
      {/* HEADER - 3 columns: info | metadata | transitions */}
      <div className="flex flex-col xl:flex-row items-start justify-between gap-4">
        {/* Left: Asset info */}
        <div className="flex items-start md:items-center gap-4 flex-1 w-full min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/assets')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {!isEditingGeneral ? (
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight truncate">
                  {asset.name}
                </h1>
                <Badge variant="outline" className="text-sm font-normal shrink-0">
                  {asset.code}
                </Badge>
                <Badge variant="secondary" style={currentStateConfig.color ? { backgroundColor: currentStateConfig.color, color: '#fff' } : undefined} className="shrink-0">
                  {asset.state}
                </Badge>

                <Button variant="ghost" size="icon" onClick={() => setIsEditingGeneral(true)} className="ml-2 h-8 w-8 shrink-0">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                Plantilla: <span className="font-medium text-foreground">{asset.templateName}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-64"
                placeholder="Nombre"
              />
              <Input
                value={editCode}
                onChange={e => setEditCode(e.target.value)}
                className="w-32"
                placeholder="Código"
              />
              <Badge variant="secondary" style={currentStateConfig.color ? { backgroundColor: currentStateConfig.color, color: '#fff' } : undefined}>
                {asset.state}
              </Badge>
              <Button
                variant="default"
                size="icon"
                onClick={() => {
                  updateMutation.mutate({ code: editCode, name: editName })
                }}
                className="ml-2 h-8 w-8"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setEditName(asset.name)
                  setEditCode(asset.code)
                  setIsEditingGeneral(false)
                }}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Right side: Metadata & Transitions */}
        <div className="flex items-center gap-4 shrink-0 flex-wrap justify-start xl:justify-end w-full xl:w-auto">
          {/* Center: Metadata */}
          <div className="flex flex-wrap items-center gap-4 border rounded-lg px-4 h-auto py-2 xl:h-12 bg-card shadow-sm w-full sm:w-auto">
            <div className="flex flex-col justify-center">
              <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">ID Interno</span>
              <code className="text-xs break-all">{asset.id}</code>
            </div>
            {asset.installedAt && (
              <div className="flex flex-col justify-center border-l pl-4 h-full">
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Instalado</span>
                <span className="text-xs">{parseApiDate(asset.installedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Right: Transitions bar */}
          {currentStateConfig.associatedModule ? (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-2 xl:h-12 shadow-sm w-full sm:w-auto">
              <span className="text-sm font-medium px-2 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock shrink-0"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Activo bloqueado. Gestión delegada al módulo: <span className="uppercase">{currentStateConfig.associatedModule}</span>
              </span>
            </div>
          ) : !currentStateConfig.isTerminal && (
            <div className="flex flex-wrap items-center gap-2 bg-card border rounded-lg px-3 py-2 xl:h-12 shadow-sm w-full sm:w-auto">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-2">
                Cambiar estado a:
              </span>
              {availableTransitions.length === 0 ? (
                <span className="text-sm text-muted-foreground italic px-2">Ninguno disponible</span>
              ) : (
                availableTransitions.map((nextState: string) => {
                  const blockReason = getTransitionBlockReason(nextState)
                  return (
                    <Button
                      key={nextState}
                      variant="outline"
                      size="sm"
                      className="h-8 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleStateChangeClick(nextState)}
                      disabled={stateMutation.isPending || !!blockReason}
                      title={blockReason || `Cambiar a ${nextState}`}
                    >
                      {nextState}
                    </Button>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* LEFT COL - MAIN DATA */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <Tabs defaultValue="details" className="w-full min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="w-full sm:w-fit overflow-x-auto pb-2 sm:pb-0">
                <TabsList className="w-fit flex-nowrap shrink-0">
                  <TabsTrigger value="details">Detalles</TabsTrigger>
                  <TabsTrigger value="bom">BOM / Materiales</TabsTrigger>
                  <TabsTrigger value="map">Ubicación</TabsTrigger>
                  <TabsTrigger value="timeline">Bitácora</TabsTrigger>
                  <TabsTrigger value="hierarchy">Jerarquía</TabsTrigger>
                </TabsList>
              </div>


            </div>
            
            <TabsContent value="details" className="flex flex-col gap-6">
              <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Información del Activo</CardTitle>
                <CardDescription>
                  Atributos dinámicos del activo.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsEditingDynamic(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </Button>
            </CardHeader>
            <CardContent>
              {isResolving ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.keys((schema as any)?.properties || {}).length === 0 && (
                    <p className="text-muted-foreground text-sm italic col-span-full">
                      No hay atributos configurados.
                    </p>
                  )}
                  {Object.keys((schema as any)?.properties || {}).map(key => {
                    const fieldSchema = (schema as any)?.properties?.[key]
                    const title = fieldSchema?.title || key
                    let value = formData[key]
                    
                    // Si es un catálogo (tiene oneOf), buscar el título (etiqueta) correspondiente al ID
                    if (value && fieldSchema?.oneOf && !Array.isArray(value)) {
                      const matchedOption = fieldSchema.oneOf.find((opt: any) => opt.const === value)
                      if (matchedOption?.title) {
                        value = matchedOption.title
                      }
                    } else if (value && fieldSchema?.type === 'array' && fieldSchema?.items?.oneOf && Array.isArray(value)) {
                      value = value.map(val => {
                        const matchedOption = fieldSchema.items.oneOf.find((opt: any) => opt.const === val)
                        return matchedOption?.title || val
                      }).join(', ')
                    }

                    if (fieldSchema?.format === 'employee' && value && allEmployees) {
                      const emp = allEmployees.find(e => e.id === value)
                      if (emp) value = `${emp.firstName} ${emp.lastName}`
                    }

                    if (fieldSchema?.format === 'team' && value && allTeams) {
                      const team = allTeams.find(t => t.id === value)
                      if (team) value = team.name
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
          </TabsContent>
          
          <TabsContent value="map">
            <Card>
              <CardHeader>
                <CardTitle>Ubicación del Activo</CardTitle>
                <CardDescription>
                  Arrastra el pin para actualizar la ubicación.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AssetMap 
                  latitude={asset.latitude} 
                  longitude={asset.longitude} 
                  geoJson={asset.geoJson}
                  assetName={asset.name}
                  riskLevel={forecast?.riskLevel}
                  assetState={asset.state}
                  assetStateColor={asset.stateColor}
                  onChange={(lat, lng, geoJsonStr) => {
                    updateMutation.mutate({ latitude: lat, longitude: lng, geoJson: geoJsonStr })
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bom">
            <Card>
              <CardContent className="pt-6">
                <AssetMaterialsTable assetId={id!} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline">
            <AssetTimeline assetId={id!} />
          </TabsContent>

          <TabsContent value="hierarchy">
            {/* HIERARCHY */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Network className="h-5 w-5" /> Jerarquía
                </CardTitle>
                
                <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedParentId(asset.parentId || 'none')}>Cambiar Padre</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cambiar Activo Padre</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <Select onValueChange={setSelectedParentId} value={selectedParentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar nuevo padre..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Ninguno (Raíz) --</SelectItem>
                          {allAssets?.filter(a => a.id !== id).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name} ({a.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancelar</Button>
                      <Button 
                        onClick={() => moveMutation.mutate(selectedParentId === 'none' ? null : selectedParentId)}
                        disabled={moveMutation.isPending}
                      >
                        {moveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="text-sm space-y-4">
                <div>
                  <span className="text-muted-foreground block mb-1">Padre</span>
                  {parentAsset ? (
                    <div 
                      className="flex items-center gap-2 p-2 rounded border bg-muted/20 cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/assets/${parentAsset.id}`)}
                    >
                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">{parentAsset.name}</div>
                        <div className="text-xs text-muted-foreground">{parentAsset.code}</div>
                      </div>
                      {parentAsset.state && (
                        <Badge variant="secondary" style={parentAsset.stateColor ? { backgroundColor: parentAsset.stateColor, color: '#fff' } : undefined} className="text-[10px]">
                          {parentAsset.state}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">Ninguno (Activo raíz)</span>
                  )}
                </div>

                <div>
                  <span className="text-muted-foreground block mb-2">Hijos / Componentes ({childAssets.length})</span>
                  {childAssets.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {childAssets.map(child => (
                        <div 
                          key={child.id}
                          className="flex items-center gap-2 p-2 rounded border bg-muted/20 cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/assets/${child.id}`)}
                        >
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="font-medium">{child.name}</div>
                            <div className="text-xs text-muted-foreground">{child.code}</div>
                          </div>
                          {child.state && (
                            <Badge variant="secondary" style={child.stateColor ? { backgroundColor: child.stateColor, color: '#fff' } : undefined} className="text-[10px]">
                              {child.state}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">No tiene componentes</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>

        {/* RIGHT COL */}
        <div className="flex flex-col gap-6 md:mt-[56px]">
          {forecast && (
            <div className="flex flex-col gap-3 bg-card border rounded-lg p-4 shadow-sm text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  <Cpu className="h-4 w-4 text-primary" />
                  Salud Predictiva
                </div>
                <Badge
                  variant="outline"
                  className={`font-semibold ${
                    forecast.riskLevel === 'Critical'
                      ? 'bg-destructive/15 text-destructive border-destructive/30 animate-pulse'
                      : forecast.riskLevel === 'High'
                      ? 'bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400'
                      : forecast.riskLevel === 'Moderate'
                      ? 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400'
                      : 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400'
                  }`}
                >
                  {forecast.riskLevel} ({(forecast.riskProbability * 100).toFixed(0)}%)
                </Badge>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground text-xs">Tiempo est. de falla:</span>
                <span className="font-medium">
                  {forecast.predictedFailureDays != null
                    ? (forecast.predictedFailureDays >= 365
                        ? 'Más de 1 año'
                        : `~${forecast.predictedFailureDays} días`)
                    : 'Estable'}
                </span>
              </div>

              {(() => {
                let factors: Array<{ description: string }> = []
                if (forecast.topFeatureContributionsJson) {
                  try {
                    factors = JSON.parse(forecast.topFeatureContributionsJson)
                  } catch {}
                }
                if (factors.length === 0) return null

                return (
                  <div className="border-t pt-3 flex items-start gap-2 text-xs">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground font-medium">Factores de riesgo:</span>
                      <ul className="list-disc list-inside text-muted-foreground/80 space-y-0.5">
                        {factors.slice(0, 3).map((f, idx) => (
                          <li key={idx} className="truncate max-w-[200px]" title={f.description}>{f.description}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          <Accordion type="single" collapsible defaultValue="incidents" className="w-full space-y-4">
            <AccordionItem value="incidents" className="border rounded-lg bg-card text-card-foreground shadow-sm">
              <AccordionTrigger className="px-6 py-4 hover:no-underline text-sm font-medium">
                Incidencias activas
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-0">
                <AssetIncidentsWidget assetId={asset.id} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="orders" className="border rounded-lg bg-card text-card-foreground shadow-sm">
              <AccordionTrigger className="px-6 py-4 hover:no-underline text-sm font-medium">
                Órdenes de mantenimiento
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-0">
                <AssetMaintenanceOrdersWidget assetId={asset.id} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="plans" className="border rounded-lg bg-card text-card-foreground shadow-sm">
              <AccordionTrigger className="px-6 py-4 hover:no-underline text-sm font-medium">
                Planes Preventivos
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-0">
                <PreventivePlanAssetWidget assetId={asset.id} assetTemplateId={asset.templateId} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tasks" className="border rounded-lg bg-card text-card-foreground shadow-sm">
              <AccordionTrigger className="px-6 py-4 hover:no-underline text-sm font-medium">
                Tareas Asociadas
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-0">
                <AssetTasksWidget assetId={asset.id} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

      </div>
      {/* FULLSCREEN EDIT MODAL FOR DYNAMIC ATTRIBUTES */}
      <Sheet open={isEditingDynamic} onOpenChange={setIsEditingDynamic}>
        <SheetContent className="w-full sm:max-w-full flex flex-col p-0 h-full" aria-describedby={undefined}>
          <div className="p-6 pb-2 border-b">
            <SheetHeader>
              <SheetTitle>Editar Información Dinámica</SheetTitle>
              <SheetDescription>
                Modifica los atributos dinámicos de {asset.name}
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="rjsf-tailwind mt-6">
              <Form
                schema={schema} 
                uiSchema={uiSchema}
                validator={validator}
                formData={formData}
                onChange={e => setFormData(e.formData)}
                onSubmit={onSubmit}
                widgets={{ 
                  FileWidget: FileUploadWidget,
                  EmployeeSelectWidget,
                  TeamSelectWidget
                }}
              >
                <div className="flex justify-end mt-6 gap-2 border-t pt-4">
                  <Button variant="outline" type="button" onClick={() => setIsEditingDynamic(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Guardar Cambios
                  </Button>
                </div>
              </Form>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Padre</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedParentId} onValueChange={setSelectedParentId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione nuevo padre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguno (Activo Raíz)</SelectItem>
                {allAssets?.filter(a => a.id !== asset.id && a.parentId !== asset.id).map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancelar</Button>
            <Button 
              onClick={() => moveMutation.mutate(selectedParentId === 'none' ? null : selectedParentId)}
              disabled={moveMutation.isPending || (selectedParentId === (asset.parentId || 'none'))}
            >
              {moveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transitionDialogOpen} onOpenChange={setTransitionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar información requerida</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Para cambiar al estado <strong>{pendingTargetState}</strong>, se requiere la siguiente información:
            </p>
            {pendingTargetState && lifecycle.states?.[pendingTargetState]?.requiresFields?.filter((f: string) => !(schema as any)?.properties?.[f]).length > 0 && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20">
                <strong>Error de configuración en la Plantilla:</strong> Esta transición requiere los campos: 
                <span className="font-mono bg-destructive/10 px-1 mx-1 rounded">
                  {lifecycle.states?.[pendingTargetState]?.requiresFields?.filter((f: string) => !(schema as any)?.properties?.[f]).join(', ')}
                </span>
                que no existen en el esquema del activo.
              </div>
            )}
            {transitionSchema && (
              <div className="rjsf-tailwind">
                <Form
                  schema={transitionSchema}
                  uiSchema={uiSchema}
                  validator={validator}
                  formData={transitionData}
                  onChange={(e) => setTransitionData(e.formData)}
                  widgets={{ 
                    FileWidget: FileUploadWidget,
                    EmployeeSelectWidget,
                    TeamSelectWidget 
                  }}
                  children={<></>}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionDialogOpen(false)}>Cancelar</Button>
            <Button 
              onClick={() => pendingTargetState && stateMutation.mutate({ toState: pendingTargetState, transitionData })}
              disabled={stateMutation.isPending || (transitionSchema && transitionSchema.required && transitionSchema.required.some((f: string) => !transitionData[f]))}
            >
              {stateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Cambio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {targetModule === 'incidents' ? (
        <ReportIncidentSheet
          open={moduleDelegationOpen}
          onOpenChange={(open) => {
            setModuleDelegationOpen(open)
            if (!open) setPendingTargetState(null)
          }}
          assetId={id}
          hideAssetSelector
          targetAssetState={pendingTargetState ?? undefined}
          title="Módulo: Incidencias"
          description={`Creando registro en módulo externo para avanzar al estado ${pendingTargetState ?? ''}.`}
          onSuccess={() => {
            setModuleDelegationOpen(false)
            setPendingTargetState(null)
            queryClient.invalidateQueries({ queryKey: ['asset', id] })
            queryClient.invalidateQueries({ queryKey: ['incidents', 'asset', id] })
            queryClient.invalidateQueries({ queryKey: ['assets'] })
            toast.success('Incidencia creada y activo bloqueado exitosamente')
          }}
        />
      ) : targetModule === 'work_orders' ? (
        <MaintenanceOrderFormSheet
          open={moduleDelegationOpen}
          onOpenChange={setModuleDelegationOpen}
          initialAssetId={asset.id}
          initialAssetLabel={`${asset.code} - ${asset.name}`}
          onSuccess={(data) => {
            setModuleDelegationOpen(false)
            if (pendingTargetState && data?.id) {
              stateMutation.mutate({ 
                toState: pendingTargetState, 
                transitionData: { 
                  source_module: 'work_orders',
                  referenceId: data.id 
                } 
              })
            } else if (pendingTargetState) {
              // Fallback just in case no ID was returned
              stateMutation.mutate({ 
                toState: pendingTargetState, 
                transitionData: { source_module: 'work_orders' } 
              })
            }
          }}
        />
      ) : (
        <Sheet open={moduleDelegationOpen} onOpenChange={setModuleDelegationOpen}>
          <SheetContent side="right" className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle>Módulo: {targetModule}</SheetTitle>
              <SheetDescription>
                Creando registro en módulo externo para avanzar al estado <strong>{pendingTargetState}</strong>.
              </SheetDescription>
            </SheetHeader>
            <div className="py-6 flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-lg mt-6">
               <p className="text-muted-foreground mb-4 px-4">
                 Aquí se cargaría el componente remoto de <strong>{targetModule}</strong> embebido para este activo.
               </p>
               <Button onClick={() => {
                  toast.success(`Registro creado en el módulo ${targetModule}`);
                  setModuleDelegationOpen(false);
                  if (pendingTargetState) {
                    stateMutation.mutate({ toState: pendingTargetState, transitionData: { source_module: targetModule || 'unknown' } });
                  }
               }}>
                  Simular Creación y Continuar
               </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
