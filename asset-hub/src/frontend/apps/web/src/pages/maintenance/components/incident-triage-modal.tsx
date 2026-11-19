import { useState, useMemo } from 'react'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  ShieldAlert,
  Eye,
  Package,
  RefreshCw,
  UserCheck,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '@/lib/handle-server-error'
import {
  incidentTriageService,
  type IncidentTriageProposalResponse,
  type TriageCandidatePartOption,
} from '@/services/incident-triage.service'

interface IncidentTriageModalProps {
  incidentId: string
  incidentTitle: string
  assetName: string
  etag?: string
  onApplied: () => void
}

interface EditablePartSelection {
  catalogItemId: string
  code: string
  label: string
  quantity: number
  availableStock: number
  warehouseId?: string | null
  warehouseName?: string | null
  reason?: string
  checked: boolean
}

const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  Low: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200',
  Medium: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300',
  High: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300',
  Critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300',
}

function buildInitialDiagnosisNotes(data: IncidentTriageProposalResponse): string {
  const sections: string[] = [data.summary]
  if (data.probableRootCauses.length > 0) {
    sections.push(`Root causes: ${data.probableRootCauses.slice(0, 3).join('; ')}`)
  }
  if (data.diagnosticSteps.length > 0) {
    sections.push(
      `Diagnostic steps:\n${data.diagnosticSteps.slice(0, 4).map((s, idx) => `${idx + 1}. ${s}`).join('\n')}`
    )
  }
  return sections.join('\n\n')
}

export function IncidentTriageModal({
  incidentId,
  incidentTitle,
  assetName,
  etag,
  onApplied,
}: IncidentTriageModalProps) {
  const { t } = useTranslation(['maintenance', 'common'])

  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('diagnosis')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [proposal, setProposal] = useState<IncidentTriageProposalResponse | null>(null)

  // Editable HITL confirmation state
  const [priorityId, setPriorityId] = useState('')
  const [technicianId, setTechnicianId] = useState('')
  const [targetState, setTargetState] = useState('')
  const [createWorkOrder, setCreateWorkOrder] = useState(true)
  const [diagnosisSummary, setDiagnosisSummary] = useState('')
  const [selectedParts, setSelectedParts] = useState<EditablePartSelection[]>([])

  const resetAllState = () => {
    setActiveTab('diagnosis')
    setAdditionalNotes('')
    setIsAnalyzing(false)
    setIsApplying(false)
    setProposal(null)
    setPriorityId('')
    setTechnicianId('')
    setTargetState('')
    setCreateWorkOrder(true)
    setDiagnosisSummary('')
    setSelectedParts([])
  }

  const hydrateProposal = (data: IncidentTriageProposalResponse) => {
    setProposal(data)
    setPriorityId(data.suggestedPriorityId || '')
    setTechnicianId(data.suggestedTechnicianId || '')

    const nextTargetState = data.suggestedTargetState || ''
    setTargetState(nextTargetState)

    const stateTriggersWo = data.reachableStates.some(
      (s) => s.name === nextTargetState && s.triggersWorkOrder
    )
    setCreateWorkOrder(data.recommendWorkOrder || stateTriggersWo)
    setDiagnosisSummary(buildInitialDiagnosisNotes(data))

    setSelectedParts(
      data.suggestedParts.map((p) => ({
        catalogItemId: p.catalogItemId,
        code: p.code,
        label: p.label,
        quantity: p.quantity,
        availableStock: p.availableStock,
        warehouseId: p.primaryWarehouseId,
        warehouseName: p.warehouseName,
        reason: p.reason,
        checked: true,
      }))
    )
    setActiveTab('diagnosis')
  }

  const runAnalysis = async (notes?: string) => {
    setIsAnalyzing(true)
    try {
      const response = await incidentTriageService.analyze(incidentId, notes)
      hydrateProposal(response)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('triage.analyzeError')))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      void runAnalysis()
    } else {
      resetAllState()
    }
  }

  const handleTargetStateChange = (value: string) => {
    const resolved = value === '__keep__' ? '' : value
    setTargetState(resolved)
    const stateOption = proposal?.reachableStates.find((s) => s.name === resolved)
    if (stateOption?.triggersWorkOrder) {
      setCreateWorkOrder(true)
    }
  }

  const remainingInventoryParts: TriageCandidatePartOption[] = useMemo(() => {
    if (!proposal) return []
    const existingIds = new Set(selectedParts.map((p) => p.catalogItemId))
    return proposal.availableParts.filter((p) => !existingIds.has(p.catalogItemId))
  }, [proposal, selectedParts])

  const handleAddPart = (catalogItemId: string) => {
    const part = proposal?.availableParts.find((p) => p.catalogItemId === catalogItemId)
    if (!part) return
    setSelectedParts((prev) => [
      ...prev,
      {
        catalogItemId: part.catalogItemId,
        code: part.code,
        label: part.label,
        quantity: 1,
        availableStock: part.availableStock,
        warehouseId: part.primaryWarehouseId,
        warehouseName: part.warehouseName,
        checked: true,
      },
    ])
  }

  const handleTogglePart = (catalogItemId: string, checked: boolean) => {
    setSelectedParts((prev) =>
      prev.map((p) => (p.catalogItemId === catalogItemId ? { ...p, checked } : p))
    )
  }

  const handlePartQtyChange = (catalogItemId: string, rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10)
    const quantity = Number.isFinite(parsed) ? Math.min(999, Math.max(1, parsed)) : 1
    setSelectedParts((prev) =>
      prev.map((p) => (p.catalogItemId === catalogItemId ? { ...p, quantity } : p))
    )
  }

  const handleApply = async () => {
    if (!proposal) return
    setIsApplying(true)
    try {
      const checkedParts = selectedParts
        .filter((p) => p.checked && p.quantity >= 1)
        .map((p) => ({
          catalogItemId: p.catalogItemId,
          quantity: p.quantity,
          warehouseId: p.warehouseId || null,
        }))

      const result = await incidentTriageService.apply(
        incidentId,
        {
          priorityId: priorityId || null,
          assignedEmployeeId: technicianId || null,
          targetState: targetState || null,
          diagnosisSummary: diagnosisSummary.trim() || null,
          createOrUpdateWorkOrder: createWorkOrder,
          suggestedParts: checkedParts,
        },
        etag
      )

      if (result.maintenanceOrderId) {
        toast.success(t('triage.applySuccessWithOrder', { parts: result.addedPartsCount }))
      } else {
        toast.success(t('triage.applySuccess'))
      }

      onApplied()
      handleOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('triage.applyError')))
    } finally {
      setIsApplying(false)
    }
  }

  const severityBadgeClass = proposal
    ? SEVERITY_BADGE_CLASSES[proposal.recommendedSeverity] || SEVERITY_BADGE_CLASSES.Medium
    : ''

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-primary/30 hover:border-primary"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span>{t('triage.triggerButton')}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-6xl max-w-[96vw] h-[90vh] flex flex-col p-6">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>{t('triage.modalTitle')}</DialogTitle>
                <DialogDescription>
                  {incidentTitle} · {assetName} — {t('triage.modalDescription')}
                </DialogDescription>
              </div>
            </div>

            {proposal && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={severityBadgeClass}>
                  {t('triage.severityLabel')}: {t(`triage.severity.${proposal.recommendedSeverity}`, proposal.recommendedSeverity)}
                </Badge>
                <Badge variant="secondary">
                  {t('triage.confidence', { percent: Math.round(proposal.confidenceScore * 100) })}
                </Badge>
                {proposal.imagesAnalyzedCount > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Eye className="h-3 w-3" />
                    <span>{t('triage.photosAnalyzed', { count: proposal.imagesAnalyzedCount })}</span>
                  </Badge>
                )}
                <Badge variant="outline">
                  {t('triage.recentIncidentsBadge', { count: proposal.recentAssetIncidentsCount })}
                </Badge>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 py-2">
          {/* Left Panel: Multimodal Diagnosis & Root Cause Analysis */}
          <div className="lg:col-span-7 flex flex-col min-h-0 border rounded-lg bg-card overflow-hidden">
            {isAnalyzing ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">{t('triage.analyzing')}</p>
              </div>
            ) : !proposal ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-3">
                <Sparkles className="h-10 w-10 opacity-40" />
                <p className="font-medium">{t('triage.emptyTitle')}</p>
                <p className="text-xs max-w-sm">{t('triage.emptyDescription')}</p>
                <Button size="sm" onClick={() => runAnalysis(additionalNotes)} className="gap-1.5 mt-2">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{t('triage.reanalyze')}</span>
                </Button>
              </div>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 flex flex-col min-h-0 p-4"
              >
                <TabsList className="grid grid-cols-2 h-8 shrink-0">
                  <TabsTrigger value="diagnosis" className="text-xs gap-1.5">
                    <Wrench className="h-3.5 w-3.5" />
                    <span>{t('triage.tabDiagnosis')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="reanalyze" className="text-xs gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>{t('triage.tabReanalyze')}</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="diagnosis" className="flex-1 min-h-0 mt-3 overflow-hidden">
                  <ScrollArea className="h-full pr-3">
                    <div className="space-y-4">
                      {proposal.validationWarnings.length > 0 && (
                        <Alert className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/30">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertTitle className="text-xs font-semibold">
                            {t('triage.warningsTitle')}
                          </AlertTitle>
                          <AlertDescription className="text-xs space-y-1 mt-1">
                            {proposal.validationWarnings.map((warn, idx) => (
                              <div key={idx}>• {warn}</div>
                            ))}
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="p-3.5 rounded-lg border bg-muted/20 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t('triage.summaryLabel')}
                        </div>
                        <p className="text-sm leading-relaxed text-foreground">{proposal.summary}</p>
                        {proposal.severityRationale && (
                          <p className="text-xs text-muted-foreground pt-1 border-t">
                            {proposal.severityRationale}
                          </p>
                        )}
                      </div>

                      {proposal.visualFindings && (
                        <div className="p-3.5 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20 space-y-1.5">
                          <div className="text-xs font-semibold flex items-center gap-1.5 text-sky-700 dark:text-sky-300">
                            <Eye className="h-3.5 w-3.5" />
                            <span>{t('triage.visualFindingsLabel')}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-foreground">
                            {proposal.visualFindings}
                          </p>
                        </div>
                      )}

                      {proposal.probableRootCauses.length > 0 && (
                        <div className="space-y-1.5">
                          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('triage.rootCausesLabel')}
                          </h5>
                          <ul className="space-y-1.5">
                            {proposal.probableRootCauses.map((cause, idx) => (
                              <li key={idx} className="p-2 rounded-md border text-xs bg-muted/15">
                                {cause}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {proposal.diagnosticSteps.length > 0 && (
                        <div className="space-y-1.5">
                          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('triage.diagnosticStepsLabel')}
                          </h5>
                          <ol className="space-y-1.5 list-decimal list-inside">
                            {proposal.diagnosticSteps.map((step, idx) => (
                              <li key={idx} className="p-2 rounded-md border text-xs bg-muted/15">
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {proposal.safetyPrecautions.length > 0 && (
                        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 space-y-1.5">
                          <div className="text-xs font-semibold flex items-center gap-1.5 text-red-700 dark:text-red-300">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span>{t('triage.safetyPrecautionsLabel')}</span>
                          </div>
                          <ul className="space-y-1 text-xs">
                            {proposal.safetyPrecautions.map((item, idx) => (
                              <li key={idx}>• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="reanalyze" className="flex-1 min-h-0 mt-3 overflow-hidden">
                  <div className="flex flex-col h-full gap-3">
                    <Label className="text-xs font-medium shrink-0">
                      {t('triage.additionalNotesLabel')}
                    </Label>
                    <div className="flex-1 min-h-0">
                      <Textarea
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                        placeholder={t('triage.additionalNotesPlaceholder')}
                        className="w-full h-full resize-none text-sm p-3"
                        disabled={isAnalyzing || isApplying}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => runAnalysis(additionalNotes)}
                      disabled={isAnalyzing || isApplying}
                      className="gap-2 w-full shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>{t('triage.reanalyze')}</span>
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Right Panel: Human-in-the-Loop Dispatch Confirmation */}
          <div className="lg:col-span-5 flex flex-col min-h-0 border rounded-lg bg-muted/20 overflow-hidden">
            <div className="shrink-0 border-b px-4 py-3 font-semibold text-sm flex items-center gap-2 bg-card">
              <UserCheck className="h-4 w-4 text-primary" />
              <span>{t('triage.confirmSectionTitle')}</span>
            </div>

            <ScrollArea className="flex-1 min-h-0 p-4">
              {!proposal ? (
                <div className="text-xs text-muted-foreground py-8 text-center">
                  {t('triage.emptyDescription')}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Priority */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('triage.priorityLabel')}</Label>
                    <Select
                      value={priorityId || '__keep__'}
                      onValueChange={(v) => setPriorityId(v === '__keep__' ? '' : v)}
                      disabled={isApplying}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={t('triage.priorityPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__keep__">{t('triage.priorityKeepUnchanged')}</SelectItem>
                        {proposal.availablePriorities.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label} ({p.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assigned Technician */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('triage.technicianLabel')}</Label>
                    <Select
                      value={technicianId || '__unassigned__'}
                      onValueChange={(v) => setTechnicianId(v === '__unassigned__' ? '' : v)}
                      disabled={isApplying}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={t('triage.technicianPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned__">
                          {t('triage.technicianKeepUnassigned')}
                        </SelectItem>
                        {proposal.availableTechnicians.map((tech) => (
                          <SelectItem key={tech.id} value={tech.id}>
                            <div className="flex items-center gap-2">
                              <span>{tech.fullName}</span>
                              {tech.roleLabel && (
                                <span className="text-muted-foreground text-[11px]">
                                  · {tech.roleLabel}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                ({t('triage.technicianWorkload', {
                                  orders: tech.activeOrdersCount,
                                  tasks: tech.activeTasksCount,
                                })})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {proposal.technicianRationale && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {proposal.technicianRationale}
                      </p>
                    )}
                  </div>

                  {/* Target State */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('triage.targetStateLabel')}</Label>
                    <Select
                      value={targetState || '__keep__'}
                      onValueChange={handleTargetStateChange}
                      disabled={isApplying}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue
                          placeholder={t('triage.targetStatePlaceholder', {
                            state: proposal.currentState,
                          })}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__keep__">
                          {t('triage.keepCurrentState', { state: proposal.currentState })}
                        </SelectItem>
                        {proposal.reachableStates.map((st) => (
                          <SelectItem key={st.name} value={st.name}>
                            {st.name}
                            {st.triggersWorkOrder ? ` (${t('triage.triggersWorkOrderHint')})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Create / Update Work Order */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="triage-wo-switch" className="text-xs font-medium cursor-pointer">
                        {t('triage.workOrderSwitchLabel')}
                      </Label>
                      {proposal.hasExistingCorrectiveOrder && (
                        <p className="text-[11px] text-muted-foreground">
                          {t('triage.workOrderExistingHint')}
                        </p>
                      )}
                    </div>
                    <Switch
                      id="triage-wo-switch"
                      checked={createWorkOrder}
                      onCheckedChange={setCreateWorkOrder}
                      disabled={isApplying}
                    />
                  </div>

                  {/* Suggested Planned Spare Parts */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        <span>{t('triage.suggestedPartsLabel')}</span>
                      </Label>
                    </div>

                    {selectedParts.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        {t('triage.noPartsSuggested')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedParts.map((part) => (
                          <div
                            key={part.catalogItemId}
                            className="p-2.5 rounded-md border bg-background space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <Checkbox
                                  checked={part.checked}
                                  onCheckedChange={(val) =>
                                    handleTogglePart(part.catalogItemId, Boolean(val))
                                  }
                                  disabled={isApplying}
                                  className="mt-0.5"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium truncate">{part.label}</div>
                                  <div className="text-[10px] font-mono text-muted-foreground">
                                    {part.code}
                                    {part.warehouseName ? ` · ${part.warehouseName}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge
                                  variant={part.availableStock > 0 ? 'secondary' : 'destructive'}
                                  className="text-[10px]"
                                >
                                  {part.availableStock > 0
                                    ? t('triage.stockBadge', { stock: part.availableStock })
                                    : t('triage.outOfStock')}
                                </Badge>
                                <Input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={part.quantity}
                                  onChange={(e) =>
                                    handlePartQtyChange(part.catalogItemId, e.target.value)
                                  }
                                  disabled={isApplying || !part.checked}
                                  aria-label={t('triage.quantityLabel')}
                                  className="h-7 w-14 text-xs text-center px-1"
                                />
                              </div>
                            </div>
                            {part.reason && (
                              <p className="text-[11px] text-muted-foreground pl-6">{part.reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {remainingInventoryParts.length > 0 && (
                      <Select value="" onValueChange={handleAddPart} disabled={isApplying}>
                        <SelectTrigger className="bg-background text-xs h-8">
                          <SelectValue placeholder={t('triage.addPartPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {remainingInventoryParts.map((part) => (
                            <SelectItem key={part.catalogItemId} value={part.catalogItemId}>
                              {part.label} ({part.code}) —{' '}
                              {part.availableStock > 0
                                ? t('triage.stockBadge', { stock: part.availableStock })
                                : t('triage.outOfStock')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Editable Diagnosis Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('triage.diagnosisNotesLabel')}</Label>
                    <Textarea
                      value={diagnosisSummary}
                      onChange={(e) => setDiagnosisSummary(e.target.value)}
                      placeholder={t('triage.diagnosisNotesPlaceholder')}
                      rows={4}
                      disabled={isApplying}
                      className="bg-background text-xs resize-y"
                    />
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t pt-3 flex items-center justify-between sm:justify-between gap-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>{t('triage.hitlGuarantee')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isApplying}
            >
              {t('triage.cancelButton')}
            </Button>
            <Button
              onClick={handleApply}
              disabled={isAnalyzing || isApplying || !proposal}
              className="gap-2"
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('triage.applying')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t('triage.applyButton')}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
