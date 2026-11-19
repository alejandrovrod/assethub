import { useState } from 'react'
import { Sparkles, Loader2, CheckCircle2, ArrowRight, Layers, FileCode2, Clock, CheckSquare, FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  assetArchitectService,
  type TemplateDraftResult,
} from '@/services/asset-architect.service'

interface AssetArchitectModalProps {
  onApplyDraftToForm: (draft: TemplateDraftResult) => void
}

export function AssetArchitectModal({ onApplyDraftToForm }: AssetArchitectModalProps) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [drafts, setDrafts] = useState<TemplateDraftResult[]>([])
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0)

  const PROMPT_TEMPLATE = `Tengo una flota de [TIPO DE EQUIPO / MAQUINARIA] y necesito diseñar su plantilla completa.

1. Atributos de Identificación y Asignación:
- Número de serie / VIN (texto obligatorio).
- [CAMPO_NUMÉRICO_1, ej: Horómetro o Kilometraje acumulado] (número obligatorio).
- [CAMPO_NUMÉRICO_2, ej: Presión, Capacidad o Temperatura] (número).
- Técnico de Ejecución: Asignado directo para trabajos (campo employee con clave exacta: asignar_a).
- Supervisor Responsable: Encargado de seguimiento y alertas (campo employee con clave exacta: reportar_a).
- Equipo de Soporte: Grupo de trabajo en faena (campo team opcional).
- Manuales y Diagramas: Documentación técnica (campo files).

2. Ciclo de Vida y Reglas de Notificación:
- OPERATIVO: Estado inicial de operación. Transiciona a EN_ALERTA, EN_MANTENIMIENTO y BAJA_DEFINITIVA.
- EN_ALERTA: Para condiciones anormales. Acción automática: NOTIFY_MANAGER notificando a reportar_a.
- EN_MANTENIMIENTO: Trabajos de taller. Acción automática: CREATE_WORK_ORDER ligada a work_orders notificando a asignar_a. Requiere haber llenado previamente el horómetro/kilometraje. Solo permitido para roles MaintenanceTechnician y Admin.
- BAJA_DEFINITIVA: Estado terminal sin más transiciones. Solo permitido para Admin.

3. Plan de Checklist Preventivo:
- Inspección general de fluidos y seguridad (frecuencia semanal).
- Calibración y ajuste mecánico crítico (frecuencia quincenal).
- Análisis preventivo de aceites y desgaste (frecuencia mensual).`

  const handleInsertTemplate = () => {
    setDescription(PROMPT_TEMPLATE)
  }

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast.error('Ingresa una descripción de tu negocio o equipamiento.')
      return
    }

    setIsLoading(true)
    try {
      const response = await assetArchitectService.generateDraft(description)
      if (!response.templates || response.templates.length === 0) {
        toast.error('El agente no generó plantillas. Intenta detallar más el equipamiento.')
        return
      }
      setDrafts(response.templates)
      setSelectedTemplateIndex(0)
      toast.success(`Se generaron ${response.templates.length} plantilla(s) con éxito.`)
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Error al conectar con el Agente Arquitecto.'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setDescription('')
      setDrafts([])
      setSelectedTemplateIndex(0)
    }
  }

  const handleApply = (template: TemplateDraftResult) => {
    onApplyDraftToForm(template)
    handleOpenChange(false)
    toast.info(`Plantilla "${template.name}" cargada en el formulario para tu revisión final.`)
  }

  const activeTemplate = drafts[selectedTemplateIndex]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-primary/30 hover:border-primary">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <span>Diseñar con IA</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl max-w-[96vw] h-[90vh] flex flex-col p-6">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Agente Arquitecto de Activos (Gemini AI)</DialogTitle>
              <DialogDescription>
                Describe en lenguaje natural tu negocio, maquinaria o activos. La IA diseñará la arquitectura de datos, ciclo de vida y tareas de mantenimiento.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 py-2">
          {/* Left panel: Prompt input */}
          <div className="lg:col-span-5 flex flex-col min-h-0 gap-3">
            <div className="flex items-center justify-between shrink-0">
              <label className="text-sm font-medium">Requerimientos del Negocio / Equipos</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleInsertTemplate}
                className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Insertar Plantilla Guía</span>
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <Textarea
                placeholder="Escribe tus requerimientos o haz clic en 'Insertar Plantilla Guía' arriba para rellenar con un ejemplo estructurado..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-full resize-none text-sm p-3 font-sans"
                disabled={isLoading}
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isLoading || !description.trim()}
              className="gap-2 w-full shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Diseñando arquitectura con Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generar Propuesta Arquitectónica</span>
                </>
              )}
            </Button>

            <div className="p-3 rounded-lg border bg-muted/40 text-xs text-muted-foreground space-y-1.5 shrink-0">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span>Validación Humana Garantizada</span>
              </div>
              <p>
                El agente solo propone un borrador validado por reglas de dominio. Nada se guarda en la base de datos hasta que tú lo revises y confirmes.
              </p>
            </div>
          </div>

          {/* Right panel: Proposal inspection */}
          <div className="lg:col-span-7 flex flex-col min-h-0 border rounded-lg bg-card overflow-hidden">
            {drafts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Layers className="h-10 w-10 stroke-[1.25] mb-2 opacity-50" />
                <p className="font-medium">Sin propuesta generada aún</p>
                <p className="text-xs mt-1 max-w-sm">
                  Escribe los requerimientos en el panel izquierdo y haz clic en "Generar Propuesta".
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Template picker tabs if multiple */}
                {drafts.length > 1 && (
                  <div className="border-b px-3 py-2 flex items-center gap-2 overflow-x-auto bg-muted/20 shrink-0">
                    <span className="text-xs font-semibold text-muted-foreground shrink-0">Plantillas:</span>
                    {drafts.map((d, idx) => (
                      <Button
                        key={d.code}
                        size="sm"
                        variant={selectedTemplateIndex === idx ? 'default' : 'outline'}
                        className="h-7 text-xs shrink-0"
                        onClick={() => setSelectedTemplateIndex(idx)}
                      >
                        {d.name}
                      </Button>
                    ))}
                  </div>
                )}

                {activeTemplate && (
                  <div className="flex-1 flex flex-col min-h-0 p-4">
                    <div className="flex items-start justify-between gap-4 border-b pb-3 mb-3 shrink-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-base">{activeTemplate.name}</h4>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {activeTemplate.code}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {activeTemplate.description || 'Sin descripción'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleApply(activeTemplate)}
                        className="gap-1.5 shrink-0"
                      >
                        <span>Cargar al Editor</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Tabs defaultValue="fields" className="flex-1 flex flex-col min-h-0">
                      <TabsList className="grid grid-cols-3 h-8 shrink-0">
                        <TabsTrigger value="fields" className="text-xs gap-1.5">
                          <FileCode2 className="h-3.5 w-3.5" />
                          <span>Campos ({activeTemplate.fields.length})</span>
                        </TabsTrigger>
                        <TabsTrigger value="lifecycle" className="text-xs gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Ciclo de Vida ({activeTemplate.lifecycleStates.length})</span>
                        </TabsTrigger>
                        <TabsTrigger value="maintenance" className="text-xs gap-1.5">
                          <CheckSquare className="h-3.5 w-3.5" />
                          <span>Mantenimiento</span>
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="fields" className="flex-1 min-h-0 mt-2">
                        <ScrollArea className="h-full pr-3">
                          <div className="space-y-2">
                            {activeTemplate.fields.map((f) => (
                              <div
                                key={f.keyName}
                                className="flex items-center justify-between p-2 rounded-md border text-xs bg-muted/20"
                              >
                                <div>
                                  <div className="font-medium text-foreground">{f.title}</div>
                                  <div className="font-mono text-[10px] text-muted-foreground">{f.keyName}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {f.type}
                                  </Badge>
                                  {f.required && (
                                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                                      Requerido
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </TabsContent>

                      <TabsContent value="lifecycle" className="flex-1 min-h-0 mt-2">
                        <ScrollArea className="h-full pr-3">
                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground mb-2">
                              Estado inicial: <strong className="text-foreground">{activeTemplate.initialState}</strong>
                            </div>
                            {activeTemplate.lifecycleStates.map((s) => (
                              <div
                                key={s.name}
                                className="p-2 rounded-md border text-xs bg-muted/20 space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full"
                                      style={{ backgroundColor: s.color || '#94a3b8' }}
                                    />
                                    <span className="font-semibold">{s.name}</span>
                                    {s.name === activeTemplate.initialState && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                                        Inicial
                                      </Badge>
                                    )}
                                    {s.isTerminal && (
                                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                        Terminal
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {s.transitions.length > 0 && (
                                  <div className="text-[11px] text-muted-foreground">
                                    Transiciones permitidas: {s.transitions.join(', ')}
                                  </div>
                                )}
                                {s.onEnterAction && (
                                  <div className="text-[11px] text-primary flex items-center gap-1 font-mono">
                                    <span>⚡ OnEnter: {s.onEnterAction}</span>
                                    {s.associatedModule && <span className="text-muted-foreground">({s.associatedModule})</span>}
                                  </div>
                                )}
                                {s.notificationTargetFieldId && (
                                  <div className="text-[11px] text-sky-600 dark:text-sky-400 flex items-center gap-1">
                                    <span>🔔 Notificar a: {s.notificationTargetFieldId}</span>
                                  </div>
                                )}
                                {s.requiresFields && s.requiresFields.length > 0 && (
                                  <div className="text-[11px] text-amber-600 dark:text-amber-400">
                                    <span>🔒 Requiere campos: {s.requiresFields.join(', ')}</span>
                                  </div>
                                )}
                                {s.allowedRoles && s.allowedRoles.length > 0 && (
                                  <div className="text-[11px] text-muted-foreground">
                                    <span>👤 Roles: {s.allowedRoles.join(', ')}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </TabsContent>

                      <TabsContent value="maintenance" className="flex-1 min-h-0 mt-2">
                        <ScrollArea className="h-full pr-3">
                          <div className="p-2 rounded-md border bg-muted/20 text-xs font-mono whitespace-pre-wrap">
                            {activeTemplate.maintenanceChecklistJson || 'Sin tareas definidas'}
                          </div>
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-3 flex items-center justify-between sm:justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            Al cargar el borrador, el formulario se rellenará para que ajustes cualquier propiedad antes de guardar.
          </span>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
