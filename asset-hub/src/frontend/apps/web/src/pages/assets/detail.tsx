import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useResolvedSchema } from '@/hooks/use-resolved-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ArrowLeft, Save, FileText, Image as ImageIcon, Download, GitBranch, Link as LinkIcon, Network } from 'lucide-react'
import { assetService, AssetAttachment } from '@/services/asset.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { Pencil, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { handleServerError } from '@/lib/handle-server-error'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<any>({})
  const [isEditingGeneral, setIsEditingGeneral] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [isEditingDynamic, setIsEditingDynamic] = useState(false)

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetService.getAssetById(id!),
    enabled: !!id
  })

  const { data: attachments, isLoading: isLoadingAttachments } = useQuery({
    queryKey: ['asset-attachments', id],
    queryFn: () => assetService.getAssetAttachments(id!),
    enabled: !!id
  })

  const { data: allAssets } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetService.getAssets()
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
    mutationFn: (args: { code?: string, name?: string, propertiesJson?: string }) => assetService.updateAsset(id!, {
      code: args.code ?? asset!.code,
      name: args.name ?? asset!.name,
      installedAt: asset!.installedAt,
      commissionedAt: asset!.commissionedAt,
      conditionIndex: asset!.conditionIndex,
      propertiesJson: args.propertiesJson ?? (asset!.propertiesJson || '{}'),
      geoJson: undefined
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] })
      toast.success('Activo actualizado exitosamente')
      setIsEditingDynamic(false)
      setIsEditingGeneral(false)
    },
    onError: (error: unknown) => {
      handleServerError(error)
    }
  })

  const stateMutation = useMutation({
    mutationFn: (toState: string) => assetService.changeState(id!, toState),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] })
      toast.success('Estado cambiado exitosamente')
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

  const { schema, isResolving } = useResolvedSchema(asset?.schemaJson || '')

  const uploadMutation = useMutation({
    mutationFn: (file: File) => assetService.uploadAttachment(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-attachments', id] })
      toast.success('Archivo subido exitosamente')
    },
    onError: () => toast.error('Error al subir el archivo')
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
  }

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

  // Parse Lifecycle
  let lifecycle = { transitions: {} as Record<string, string[]> }
  try {
    lifecycle = typeof asset.lifecycleStates === 'string' 
      ? JSON.parse(asset.lifecycleStates) 
      : (asset.lifecycleStates || lifecycle)
  } catch (e) {}

  const availableTransitions = lifecycle.transitions[asset.state] || []

  const onSubmit = ({ formData: newFormData }: any) => {
    updateMutation.mutate({ propertiesJson: JSON.stringify(newFormData) })
  }

  const parentAsset = allAssets?.find(a => a.id === asset?.parentId)
  const childAssets = allAssets?.filter(a => a.parentId === id) || []

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0 w-full">
      
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/assets')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {!isEditingGeneral ? (
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">
                  {asset.name}
                </h1>
                <Badge variant="outline" className="text-sm font-normal">
                  {asset.code}
                </Badge>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  {asset.state}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => setIsEditingGeneral(true)} className="ml-2 h-8 w-8">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                Plantilla: <span className="font-medium text-foreground">{asset.templateName}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
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
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
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

        {/* TRANSITIONS BAR */}
        <div className="flex items-center gap-2 bg-card border rounded-lg p-1.5 shadow-sm">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold px-2">
            Cambiar estado a:
          </span>
          {availableTransitions.length === 0 ? (
            <span className="text-sm text-muted-foreground italic px-2">Ninguno disponible</span>
          ) : (
            availableTransitions.map((nextState: string) => (
              <Button 
                key={nextState} 
                variant="outline" 
                size="sm"
                className="h-8"
                onClick={() => stateMutation.mutate(nextState)}
                disabled={stateMutation.isPending}
              >
                {nextState}
              </Button>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* LEFT COL - MAIN DATA */}
        <div className="md:col-span-2 flex flex-col gap-6">
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
                  {Object.keys(formData).length === 0 && (
                    <p className="text-muted-foreground text-sm italic col-span-full">
                      No hay atributos configurados.
                    </p>
                  )}
                  {Object.keys(formData).map(key => {
                    const fieldSchema = (schema as any)?.properties?.[key]
                    const title = fieldSchema?.title || key
                    const value = formData[key]
                    return (
                      <div key={key}>
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <p className="mt-1">{value?.toString() || '-'}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
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
                <code className="bg-muted px-2 py-1 rounded text-xs break-all">{asset.id}</code>
              </div>
              {asset.installedAt && (
                <div>
                  <span className="text-muted-foreground block mb-1">Fecha Instalación</span>
                  <span>{new Date(asset.installedAt).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

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
                    <div>
                      <div className="font-medium">{parentAsset.name}</div>
                      <div className="text-xs text-muted-foreground">{parentAsset.code}</div>
                    </div>
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
                        <div>
                          <div className="font-medium">{child.name}</div>
                          <div className="text-xs text-muted-foreground">{child.code}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic">No tiene componentes</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Adjuntos</CardTitle>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subir'}
              </Button>
              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            </CardHeader>
            <CardContent>
              {isLoadingAttachments ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : attachments?.length === 0 ? (
                <div 
                  className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Haz clic para subir un archivo
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    (PDF, Imágenes, etc.)
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {attachments?.map((att: AssetAttachment) => (
                    <div key={att.id} className="flex items-center justify-between p-2 border rounded-md bg-card">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {att.kind === 'photo' ? <ImageIcon className="h-5 w-5 text-blue-500 shrink-0" /> : <FileText className="h-5 w-5 text-orange-500 shrink-0" />}
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-medium truncate" title={att.fileName}>{att.fileName}</span>
                          <span className="text-xs text-muted-foreground">{(att.sizeBytes / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                      <a href={`http://localhost:5168${att.blobUri}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
                validator={validator}
                formData={formData}
                onChange={e => setFormData(e.formData)}
                onSubmit={onSubmit}
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
    </div>
  )
}
