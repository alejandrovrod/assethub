import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { assetTemplateService, AssetTemplate } from '@/services/asset-template.service'
import {
  assetImportService,
  ImportExecutionResult,
  ImportValidationResult
} from '@/services/asset-import.service'
import { cn } from '@/lib/utils'

interface AssetImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TargetFieldOption {
  key: string
  label: string
  isFixed: boolean
  required: boolean
}

const FIXED_FIELD_OPTIONS: TargetFieldOption[] = [
  { key: 'Code', label: 'Código (Code)', isFixed: true, required: true },
  { key: 'Name', label: 'Nombre del Activo (Name)', isFixed: true, required: true },
  { key: 'ParentCode', label: 'Código Padre (ParentCode)', isFixed: true, required: false },
  { key: 'State', label: 'Estado Inicial (State)', isFixed: true, required: false },
  { key: 'InstalledAt', label: 'Fecha de Instalación (InstalledAt)', isFixed: true, required: false },
  { key: 'CommissionedAt', label: 'Fecha Puesta en Marcha (CommissionedAt)', isFixed: true, required: false },
  { key: 'ConditionIndex', label: 'Índice de Condición (ConditionIndex)', isFixed: true, required: false },
  { key: 'Latitude', label: 'Latitud (Latitude)', isFixed: true, required: false },
  { key: 'Longitude', label: 'Longitud (Longitude)', isFixed: true, required: false }
]

const normalize = (value: string) => value.trim().toLowerCase().replace(/\*$/, '').trim()

function extractSchemaProperties(template: AssetTemplate | null): TargetFieldOption[] {
  if (!template?.schemaJson) return []
  try {
    const parsed = JSON.parse(template.schemaJson) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      const requiredSet = new Set<string>(
        Array.isArray(parsed.required) ? (parsed.required as string[]) : []
      )
      const props = (parsed.properties ?? {}) as Record<string, { title?: string; type?: string }>
      const result: TargetFieldOption[] = []

      // Propiedades de raíz
      for (const [key, propDef] of Object.entries(props)) {
        const title = propDef?.title && propDef.title.trim() ? propDef.title.trim() : key
        result.push({
          key,
          label: title !== key ? `${title} (${key})` : key,
          isFixed: false,
          required: requiredSet.has(key)
        })
      }

      // Propiedades anidadas en dependencies
      if (parsed.dependencies && typeof parsed.dependencies === 'object') {
        const deps = parsed.dependencies as Record<string, { oneOf?: Array<{ properties?: Record<string, { title?: string }> }> }>
        for (const dep of Object.values(deps)) {
          if (Array.isArray(dep?.oneOf)) {
            for (const branch of dep.oneOf) {
              if (branch?.properties) {
                for (const [k, pDef] of Object.entries(branch.properties)) {
                  if (!result.some((r) => r.key === k)) {
                    const title = pDef?.title && pDef.title.trim() ? pDef.title.trim() : k
                    result.push({
                      key: k,
                      label: title !== k ? `${title} (${k})` : k,
                      isFixed: false,
                      required: requiredSet.has(k)
                    })
                  }
                }
              }
            }
          }
        }
      }

      return result
    }
  } catch {
    // schemaJson not parseable
  }
  return []
}

function parseCsvHeaders(text: string): string[] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const delimiter = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ','
  const headers: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of firstLine) {
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === delimiter && !inQuotes) {
      headers.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  headers.push(current.trim())
  return headers.filter((h) => h.length > 0)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function AssetImportWizard({ open, onOpenChange }: AssetImportWizardProps) {
  const { t } = useTranslation(['assets', 'common'])
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(1)
  const [templateSearch, setTemplateSearch] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateFormat, setTemplateFormat] = useState<'xlsx' | 'csv'>('xlsx')
  const [downloading, setDownloading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [isXlsx, setIsXlsx] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({})
  const [validation, setValidation] = useState<ImportValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [issueFilter, setIssueFilter] = useState('')
  const [continueOnError, setContinueOnError] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [execution, setExecution] = useState<ImportExecutionResult | null>(null)

  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ['asset-templates', templateSearch],
    queryFn: () => assetTemplateService.getTemplates(templateSearch || undefined),
    enabled: open
  })

  const activeTemplates = useMemo(
    () => (templates ?? []).filter((tpl) => tpl.isActive),
    [templates]
  )

  const selectedTemplate = useMemo(
    () => activeTemplates.find((tpl) => tpl.id === selectedTemplateId) ?? null,
    [activeTemplates, selectedTemplateId]
  )

  const dynamicFieldOptions = useMemo(() => extractSchemaProperties(selectedTemplate), [selectedTemplate])
  const targetFieldOptions = useMemo(
    () => [...FIXED_FIELD_OPTIONS, ...dynamicFieldOptions],
    [dynamicFieldOptions]
  )

  // Auto-detect column mappings when headers or the template change
  useEffect(() => {
    if (fileHeaders.length === 0) {
      setColumnMappings({})
      return
    }
    const auto: Record<string, string> = {}
    for (const header of fileHeaders) {
      const normalized = normalize(header)
      // Buscar coincidencia por key exacta o por texto del label (title)
      const match = targetFieldOptions.find(
        (f) =>
          normalize(f.key) === normalized ||
          normalize(f.label) === normalized ||
          normalize(f.label.split('(')[0]) === normalized
      )
      auto[header] = match ? match.key : ''
    }
    setColumnMappings(auto)
  }, [fileHeaders, targetFieldOptions])

  const errorsByRow = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (const err of validation?.errors ?? []) {
      const set = map.get(err.rowNumber) ?? new Set<string>()
      if (err.field) set.add(err.field.trim().toLowerCase())
      map.set(err.rowNumber, set)
    }
    return map
  }, [validation])

  const filteredErrors = useMemo(() => {
    const q = issueFilter.trim().toLowerCase()
    if (!q) return validation?.errors ?? []
    return (validation?.errors ?? []).filter(
      (e) =>
        e.message.toLowerCase().includes(q) ||
        e.field.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        String(e.rowNumber).includes(q)
    )
  }, [validation, issueFilter])

  const handleFile = (incoming: File | null) => {
    setValidation(null)
    setExecution(null)
    if (!incoming) {
      setFile(null)
      setFileHeaders([])
      setIsXlsx(false)
      return
    }
    const lower = incoming.name.toLowerCase()
    const xlsx = lower.endsWith('.xlsx') || lower.endsWith('.xls')
    const csv = lower.endsWith('.csv')
    if (!xlsx && !csv) {
      toast.error(t('import.invalidFileType', 'Only .xlsx and .csv files are supported'))
      return
    }
    setFile(incoming)
    setIsXlsx(xlsx)
    if (csv) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          setFileHeaders(parseCsvHeaders(String(reader.result ?? '')))
        } catch {
          setFileHeaders([])
        }
      }
      reader.readAsText(incoming)
    } else {
      setFileHeaders([])
    }
  }

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id)
    setValidation(null)
    setExecution(null)
  }

  const handleDownloadTemplate = async () => {
    if (!selectedTemplateId) return
    setDownloading(true)
    try {
      await assetImportService.downloadTemplate(selectedTemplateId, templateFormat)
      toast.success(t('import.templateDownloaded', 'Template downloaded'))
    } catch {
      toast.error(t('import.templateDownloadError', 'Could not download the template'))
    } finally {
      setDownloading(false)
    }
  }

  const handleValidate = async () => {
    if (!file || !selectedTemplateId) return
    setValidating(true)
    try {
      const result = await assetImportService.validateImport(file, selectedTemplateId, columnMappings)
      setValidation(result)
      if (result.invalidRows > 0) {
        toast.warning(
          t('import.validationWithErrors', 'Validation found {{count}} rows with errors', {
            count: result.invalidRows
          })
        )
      } else {
        toast.success(t('import.validationOk', 'All rows are valid'))
      }
    } catch {
      toast.error(t('import.networkError', 'Network error. Please try again.'))
    } finally {
      setValidating(false)
    }
  }

  const handleExecute = async () => {
    if (!file || !selectedTemplateId) return
    setConfirmOpen(false)
    setExecuting(true)
    try {
      const outcome = await assetImportService.executeImport(
        file,
        selectedTemplateId,
        continueOnError,
        columnMappings
      )
      if ('validationError' in outcome) {
        setValidation(outcome.validationError)
        setStep(3)
        toast.error(t('import.atomicAbort', 'Import aborted: validation errors remain'))
      } else {
        setExecution(outcome)
        toast.success(
          t('import.importSuccess', '{{count}} assets imported successfully', {
            count: outcome.importedCount
          })
        )
      }
    } catch {
      toast.error(t('import.networkError', 'Network error. Please try again.'))
    } finally {
      setExecuting(false)
    }
  }

  const handleExportErrors = () => {
    const rows = validation?.errors ?? []
    if (rows.length === 0) return
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const csv = [
      'rowNumber,code,field,message',
      ...rows.map((e) => [e.rowNumber, escape(e.code), escape(e.field), escape(e.message)].join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'import-errors.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    if (execution && execution.importedCount > 0) {
      void queryClient.invalidateQueries({ queryKey: ['assets'] })
    }
    onOpenChange(false)
  }

  const canLeaveStep1 = selectedTemplateId !== '' && file !== null
  const canLeaveStep3 = validation !== null

  const stepLabels = [
    t('import.steps.file', 'File'),
    t('import.steps.mapping', 'Mapping'),
    t('import.steps.validation', 'Validation'),
    t('import.steps.execution', 'Execution')
  ]

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-6xl w-[95vw] h-[88vh] max-h-[88vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="shrink-0 pb-2 border-b">
            <DialogTitle className="text-xl font-bold">{t('import.title', 'Importar activos')}</DialogTitle>
            <DialogDescription className="text-sm">
              {t('import.subtitle', 'Importación masiva e histórica de activos desde Excel o CSV en 4 pasos')}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-3 shrink-0 py-2">
            {stepLabels.map((label, i) => {
              const n = i + 1
              const active = step === n
              const done = step > n
              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div
                    className={cn(
                      'flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold border shrink-0 transition-colors',
                      active && 'bg-primary text-primary-foreground border-primary shadow-sm',
                      done && 'bg-primary/20 text-primary border-primary/40',
                      !active && !done && 'text-muted-foreground bg-muted/30'
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : n}
                  </div>
                  <span className={cn('text-xs md:text-sm font-medium truncate', !active && 'text-muted-foreground')}>
                    {label}
                  </span>
                  {n < 4 && <div className="h-px bg-border flex-1" />}
                </div>
              )
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {/* STEP 1 */}
            {step === 1 && (
              <div className="flex flex-col gap-4 py-2">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>{t('import.template', 'Asset template')}</Label>
                    <Input
                      placeholder={t('import.searchTemplate', 'Search template...')}
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                    <Select value={selectedTemplateId} onValueChange={handleSelectTemplate}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingTemplates
                              ? t('import.loadingTemplates', 'Loading...')
                              : t('import.selectTemplate', 'Select a template')
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {activeTemplates.map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id}>
                            {tpl.name} ({tpl.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>{t('import.downloadTemplate', 'Download official template')}</Label>
                    <div className="flex gap-2">
                      <Select
                        value={templateFormat}
                        onValueChange={(v) => setTemplateFormat(v as 'xlsx' | 'csv')}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="xlsx">Excel</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        onClick={handleDownloadTemplate}
                        disabled={!selectedTemplateId || downloading}
                        className="flex-1"
                      >
                        {downloading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {t('import.download', 'Download')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'import.downloadHint',
                        'The template includes fixed and dynamic columns for the selected template'
                      )}
                    </p>
                  </div>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    handleFile(e.dataTransfer.files?.[0] ?? null)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                    dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                  <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {t('import.dropHint', 'Drag & drop your .xlsx or .csv file here')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('import.dropCta', 'or click to browse')}
                  </p>
                  {file && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Badge variant="secondary">
                        {file.name} · {formatFileSize(file.size)}
                      </Badge>
                    </div>
                  )}
                </div>
                {isXlsx && file && (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'import.xlsxNote',
                      'Excel files are mapped against the first row (headers). Detail mapping happens in the next step.'
                    )}
                  </p>
                )}
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="flex flex-col gap-3 py-2 h-full">
                <p className="text-sm text-muted-foreground">
                  {t(
                    'import.mappingHint',
                    'Map each file column to a system field. Unmapped columns are ignored.'
                  )}
                </p>
                {fileHeaders.length === 0 ? (
                  <div className="flex flex-col gap-3 h-full">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {isXlsx
                          ? 'Mapeo predeterminado de la plantilla (Detección automática)'
                          : t('import.noHeaders', 'No se detectaron encabezados en el archivo.')}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {targetFieldOptions.length} campos configurados
                      </span>
                    </div>
                    <ScrollArea className="h-[46vh] max-h-[50vh] border rounded-lg bg-background shadow-xs">
                      <Table>
                        <TableHeader className="bg-muted/40 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="w-1/3 font-semibold">Campo en Plantilla</TableHead>
                            <TableHead className="w-1/4 font-semibold">Clave / Nombre Interno</TableHead>
                            <TableHead className="w-28 font-semibold">Tipo</TableHead>
                            <TableHead className="w-28 text-center font-semibold">Obligatorio</TableHead>
                            <TableHead className="font-semibold">Estado de Mapeo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {targetFieldOptions.map((f) => (
                            <TableRow key={f.key} className="hover:bg-muted/30">
                              <TableCell className="font-medium">
                                <span className="text-foreground">{f.label.split('(')[0].trim()}</span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {f.key}
                              </TableCell>
                              <TableCell>
                                <Badge variant={f.isFixed ? 'secondary' : 'outline'} className="text-[11px]">
                                  {f.isFixed ? 'Fijo (Core)' : 'Dinámico'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {f.required ? (
                                  <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                                    Requerido
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Opcional</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-md font-medium">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Automático por coincidencia
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                ) : (
                  <ScrollArea className="h-[48vh] max-h-[52vh] border rounded-lg pr-4 bg-background">
                    <Table>
                      <TableHeader className="bg-muted/40 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="w-1/2 font-semibold">{t('import.fileColumn', 'Columna en tu archivo')}</TableHead>
                          <TableHead className="w-1/2 font-semibold">{t('import.systemField', 'Campo del sistema / plantilla')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fileHeaders.map((header) => (
                          <TableRow key={header}>
                            <TableCell className="font-medium font-mono text-xs">{header}</TableCell>
                            <TableCell>
                              <Select
                                value={columnMappings[header] || '__ignore'}
                                onValueChange={(v) =>
                                  setColumnMappings((prev) => ({
                                    ...prev,
                                    [header]: v === '__ignore' ? '' : v
                                  }))
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue
                                    placeholder={t('import.ignore', '— Ignorar columna —')}
                                  />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__ignore">
                                    {t('import.ignore', '— Ignorar columna —')}
                                  </SelectItem>
                                  {targetFieldOptions.map((f) => (
                                    <SelectItem key={f.key} value={f.key}>
                                      <span className="font-medium">{f.label}</span>
                                      <span className="text-xs text-muted-foreground ml-1.5">
                                        {f.isFixed ? '[Fijo]' : `[Dinámico${f.required ? ' *' : ''}]`}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={handleValidate} disabled={!file || validating}>
                    {validating && <Loader2 className="h-4 w-4 animate-spin" />}
                    {validating
                      ? t('import.validating', 'Validando...')
                      : t('import.validate', 'Validar (simulación)')}
                  </Button>
                  {validation && (
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {t('import.totalRows', 'Total')}: {validation.totalRows}
                      </Badge>
                      <Badge variant="secondary" className="text-emerald-700 font-semibold">
                        {t('import.validRows', 'Válidas')}: {validation.validRows}
                      </Badge>
                      <Badge variant={validation.invalidRows > 0 ? 'destructive' : 'secondary'}>
                        {t('import.invalidRows', 'Inválidas')}: {validation.invalidRows}
                      </Badge>
                    </div>
                  )}
                </div>

                {!validation ? (
                  <p className="text-sm text-muted-foreground">
                    {t('import.validateFirst', 'Ejecutá la simulación para verificar las filas antes de importar.')}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 min-h-0">
                    {validation.invalidRows > 0 && (
                      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {t(
                          'import.warningWithErrors',
                          'Hay filas con errores. Podés continuar, pero la ejecución puede abortarse salvo que actives «continuar ante errores».'
                        )}
                      </div>
                    )}
                    <div className="grid lg:grid-cols-12 gap-5 min-h-0">
                      <div className="lg:col-span-7 flex flex-col gap-2 min-h-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">
                            {t('import.preview', 'Vista previa')} ({validation.preview.length})
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            Columnas dinámicas expandidas
                          </span>
                        </div>
                        <div className="h-[46vh] max-h-[50vh] border rounded-lg bg-background shadow-xs overflow-auto">
                          <Table className="min-w-max border-collapse">
                            <TableHeader className="bg-muted/70 sticky top-0 z-20 shadow-xs">
                              <TableRow>
                                <TableHead className="w-12 text-center">#</TableHead>
                                <TableHead className="font-semibold whitespace-nowrap">{t('import.code', 'Código')}</TableHead>
                                <TableHead className="font-semibold whitespace-nowrap">{t('import.name', 'Nombre')}</TableHead>
                                <TableHead className="font-semibold whitespace-nowrap">{t('import.state', 'Estado')}</TableHead>
                                <TableHead className="font-semibold whitespace-nowrap">Padre</TableHead>
                                {dynamicFieldOptions.map((dyn) => (
                                  <TableHead key={dyn.key} className="font-semibold whitespace-nowrap text-primary/90 bg-primary/5">
                                    {dyn.label.split('(')[0].trim()}
                                    {dyn.required && ' *'}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {validation.preview.map((row) => {
                                const rowErrors = errorsByRow.get(row.rowNumber)
                                const hasError = !!rowErrors && rowErrors.size > 0
                                const cellError = (field: string) =>
                                  rowErrors?.has(field.toLowerCase()) ?? false
                                return (
                                  <TableRow
                                    key={row.rowNumber}
                                    className={cn(hasError ? 'bg-destructive/10 hover:bg-destructive/15' : 'hover:bg-muted/40')}
                                  >
                                    <TableCell className="text-center font-mono text-xs">{row.rowNumber}</TableCell>
                                    <TableCell
                                      className={cn('font-medium whitespace-nowrap', cellError('code') && 'text-destructive font-bold')}
                                    >
                                      {row.code}
                                    </TableCell>
                                    <TableCell
                                      className={cn('whitespace-nowrap', cellError('name') && 'text-destructive font-bold')}
                                    >
                                      {row.name}
                                    </TableCell>
                                    <TableCell
                                      className={cn('whitespace-nowrap', cellError('state') && 'text-destructive font-bold')}
                                    >
                                      <Badge variant="outline" className="text-xs font-normal">
                                        {row.state}
                                      </Badge>
                                      {hasError && (
                                        <XCircle className="h-3.5 w-3.5 inline ml-1 text-destructive" />
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                                      {row.parentCode || '—'}
                                    </TableCell>
                                    {dynamicFieldOptions.map((dyn) => {
                                      const rawVal = row.properties ? row.properties[dyn.key] : undefined
                                      const isFieldErr = cellError(dyn.key) || cellError(dyn.label)
                                      return (
                                        <TableCell
                                          key={dyn.key}
                                          className={cn(
                                            'text-xs whitespace-nowrap',
                                            isFieldErr && 'text-destructive font-semibold bg-destructive/10'
                                          )}
                                        >
                                          {rawVal !== undefined && rawVal !== null && String(rawVal).trim().length > 0 ? (
                                            <span className="font-medium text-foreground">{String(rawVal)}</span>
                                          ) : (
                                            <span className="text-muted-foreground/50 italic">—</span>
                                          )}
                                        </TableCell>
                                      )
                                    })}
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div className="lg:col-span-5 flex flex-col gap-2 min-h-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">
                            {t('import.issues', 'Incidencias y errores')} ({filteredErrors.length})
                          </Label>
                        </div>
                        <Input
                          placeholder={t('import.filterIssues', 'Filtrar por texto, campo o código...')}
                          value={issueFilter}
                          onChange={(e) => setIssueFilter(e.target.value)}
                          className="h-9"
                        />
                        <ScrollArea className="h-[40vh] max-h-[44vh] border rounded-lg p-3 bg-background shadow-xs">
                          {filteredErrors.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center py-10 text-center">
                              <CheckCircle2 className="h-10 w-10 text-emerald-600 mb-2 opacity-80" />
                              <p className="font-medium text-sm text-foreground">
                                {t('import.noIssues', '¡Sin incidencias encontradas!')}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Todas las filas cumplen con las reglas y el esquema.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {filteredErrors.map((err, i) => (
                                <div
                                  key={`${err.rowNumber}-${err.field}-${i}`}
                                  className="text-xs border rounded-md p-2.5 bg-destructive/5 border-destructive/20"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-foreground">
                                      {t('import.row', 'Fila')} {err.rowNumber}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] bg-background">
                                      [{err.code}] {err.field}
                                    </Badge>
                                  </div>
                                  <p className="text-destructive font-medium leading-relaxed">{err.message}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div className="flex flex-col gap-4 py-2">
                {!execution ? (
                  <>
                    <div className="flex items-center justify-between border rounded-md px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {t('import.continueOnError', 'Continue on error')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'import.continueOnErrorHint',
                            'If off, any error aborts the whole import (atomic). If on, valid rows are imported.'
                          )}
                        </p>
                      </div>
                      <Switch checked={continueOnError} onCheckedChange={setContinueOnError} />
                    </div>
                    <Button
                      onClick={() => setConfirmOpen(true)}
                      disabled={!file || executing}
                      className="w-full sm:w-auto"
                    >
                      {executing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {executing
                        ? t('import.executing', 'Importing...')
                        : t('import.execute', 'Import')}
                    </Button>
                    {executing && (
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/3 bg-primary rounded-full animate-pulse" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      {execution.failedCount === 0 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                      )}
                      <p className="font-medium">
                        {t('import.resultTitle', 'Import finished')}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="secondary">
                        {t('import.totalProcessed', 'Processed')}: {execution.totalProcessed}
                      </Badge>
                      <Badge variant="secondary" className="text-emerald-700">
                        {t('import.imported', 'Imported')}: {execution.importedCount}
                      </Badge>
                      <Badge variant={execution.failedCount > 0 ? 'destructive' : 'secondary'}>
                        {t('import.failed', 'Failed')}: {execution.failedCount}
                      </Badge>
                    </div>
                    {(validation?.errors.length ?? 0) > 0 && (
                      <Button variant="outline" onClick={handleExportErrors} className="w-full sm:w-auto">
                        <Download className="h-4 w-4" />
                        {t('import.exportErrors', 'Export error report (CSV)')}
                      </Button>
                    )}
                    <Button onClick={handleClose} className="w-full sm:w-auto">
                      {t('import.close', 'Close')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <div className="flex items-center justify-between pt-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ArrowLeft className="h-4 w-4" />
              {t('import.back', 'Back')}
            </Button>
            {step < 4 ? (
              <Button
                onClick={() => {
                  if (step === 1 && !canLeaveStep1) {
                    toast.warning(t('import.needTemplateFile', 'Select a template and a file first'))
                    return
                  }
                  if (step === 3 && !canLeaveStep3) {
                    toast.warning(t('import.needValidation', 'Run the validation first'))
                    return
                  }
                  setStep((s) => Math.min(4, s + 1))
                }}
              >
                {t('import.next', 'Next')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="outline" onClick={handleClose}>
                {t('import.close', 'Close')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('import.confirmTitle', 'Confirm import')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'import.confirmBody',
                'This will create assets in the system. Do you want to continue?'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleExecute}>
              {t('import.confirm', 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
