import { useEffect, useMemo, useState, useCallback } from 'react'
import { useForm, useFormContext, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { assetTemplateService } from '@/services/asset-template.service'
import { toast } from 'sonner'
import { SchemaBuilder } from './schema-builder'
import { LifecycleCanvas } from './lifecycle-canvas'
import { MaintenanceChecklistBuilder } from './maintenance-checklist-builder'
import { SchemaFieldPreview, type SchemaFieldDefinition } from './schema-field-preview'
import { FormSheetLayout, formSheetContentClass } from '@/components/form-sheet-layout'
import { GripVertical, Info, FileText, List, GitBranch, CheckSquare, Eye, Plus, Pencil, Check, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import {
  createSectionLabel,
  moveFieldKey,
  moveSectionLabel,
  moveTabLabel,
  parseLayoutModel,
  renameSectionLabel,
  type LayoutModel,
} from './preview-layout-ops'

type PreviewField = SchemaFieldDefinition & { tab: string; section?: string }

const formSchema = z.object({
  code: z.string().min(1, { error: () => i18n.t('assets:validation.codeRequired') }).max(50),
  name: z.string().min(1, { error: () => i18n.t('assets:validation.nameRequired') }).max(100),
  description: z.string().max(500).optional(),
  businessEntityTypeId: z.string().optional(),
  schemaJson: z.string().refine((val) => {
    if (!val) return true
    try {
      JSON.parse(val)
      return true
    } catch {
      return false
    }
  }, { error: () => i18n.t('assets:validation.invalidJson') }),
  lifecycleStates: z.string().refine((val) => {
    if (!val) return true
    try {
      JSON.parse(val)
      return true
    } catch {
      return false
    }
  }, { error: () => i18n.t('assets:validation.invalidJson') }),
  maintenanceChecklist: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: any
}

function SchemaBuilderField() {
  const form = useFormContext<FormValues>()
  return (
    <FormField
      control={form.control}
      name="schemaJson"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <SchemaBuilder value={field.value} onChange={field.onChange} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function LifecycleCanvasField() {
  const form = useFormContext<FormValues>()
  const schemaJson = useWatch({ control: form.control, name: 'schemaJson' })
  return (
    <FormField
      control={form.control}
      name="lifecycleStates"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <LifecycleCanvas
              value={field.value}
              onChange={field.onChange}
              schemaJson={schemaJson}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function MaintenanceChecklistField() {
  const form = useFormContext<FormValues>()
  return (
    <FormField
      control={form.control}
      name="maintenanceChecklist"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <MaintenanceChecklistBuilder value={field.value || ''} onChange={field.onChange} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// ---------- Interactive preview: drag & drop ids ----------

const fieldDragId = (key: string) => `preview-field:${encodeURIComponent(key)}`
const tabDragId = (tab: string) => `preview-tab:${encodeURIComponent(tab)}`
const groupDropId = (tab: string, section?: string) =>
  `preview-group:${encodeURIComponent(tab)}:${encodeURIComponent(section ?? '')}`

type ParsedDragId =
  | { kind: 'field'; value: string }
  | { kind: 'tab'; value: string }
  | { kind: 'group'; value: string; extra: string }

function parsePreviewDragId(id: string): ParsedDragId | null {
  if (id.startsWith('preview-field:')) {
    return { kind: 'field', value: decodeURIComponent(id.slice('preview-field:'.length)) }
  }
  if (id.startsWith('preview-tab:')) {
    return { kind: 'tab', value: decodeURIComponent(id.slice('preview-tab:'.length)) }
  }
  if (id.startsWith('preview-group:')) {
    const rest = id.slice('preview-group:'.length).split(':')
    return {
      kind: 'group',
      value: decodeURIComponent(rest[0] ?? ''),
      extra: decodeURIComponent(rest.slice(1).join(':')),
    }
  }
  return null
}

function SortablePreviewField({
  field,
  tabOptions,
  onMoveToTab,
}: {
  field: PreviewField
  tabOptions: string[]
  onMoveToTab: (key: string, tab: string) => void
}) {
  const { t } = useTranslation(['assets'])
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fieldDragId(field.keyName),
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="min-w-0"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          {...attributes}
          {...listeners}
          title={t('preview.dragToReorder')}
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <code className="flex-1 truncate font-mono text-[10px] text-muted-foreground">{field.keyName}</code>
        {tabOptions.length > 1 && (
          <Select
            value={field.tab}
            onValueChange={(v) => {
              if (v !== field.tab) onMoveToTab(field.keyName, v)
            }}
          >
            <SelectTrigger className="h-6 w-28 px-1.5 text-[10px]" title={t('preview.moveToTab')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tabOptions.map((tb) => (
                <SelectItem key={tb} value={tb}>
                  {tb}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <SchemaFieldPreview field={field} />
    </div>
  )
}

function SortablePreviewTab({
  tab,
  count,
  active,
  reorderable,
  onSelect,
}: {
  tab: string
  count: number
  active: boolean
  reorderable: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation(['assets'])
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tabDragId(tab),
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className={`flex items-center gap-0.5 rounded-md border px-1.5 py-1 text-xs transition-colors ${
        active
          ? 'border-primary bg-background text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'
      }`}
    >
      {reorderable && (
        <span
          {...attributes}
          {...listeners}
          title={t('preview.dragTabToReorder')}
          className="cursor-grab touch-none rounded p-0.5 hover:bg-muted"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      <button type="button" onClick={onSelect} className="flex items-center gap-1.5 px-1 py-0.5">
        <span className="font-medium">{tab}</span>
        <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
          {count}
        </Badge>
      </button>
    </div>
  )
}

function PreviewSectionBlock({
  tab,
  section,
  keys,
  fieldsByKey,
  tabOptions,
  isFirst,
  isLast,
  dropHint,
  onMoveUp,
  onMoveDown,
  onRename,
  onMoveFieldToTab,
}: {
  tab: string
  section: string | undefined
  keys: string[]
  fieldsByKey: Map<string, PreviewField>
  tabOptions: string[]
  isFirst: boolean
  isLast: boolean
  dropHint: string
  onMoveUp: () => void
  onMoveDown: () => void
  onRename: (nextLabel: string) => void
  onMoveFieldToTab: (key: string, destTab: string) => void
}) {
  const { t } = useTranslation(['assets', 'common'])
  const { setNodeRef, isOver } = useDroppable({ id: groupDropId(tab, section) })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section ?? '')
  const items = keys.map(fieldDragId)

  const commit = () => {
    setEditing(false)
    if ((draft.trim() || '') !== (section ?? '')) onRename(draft.trim())
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition-shadow ${isOver ? 'ring-2 ring-primary/60 ring-offset-1' : ''}`}
    >
      {section !== undefined && (
        <div className="mb-2 flex items-center gap-1.5">
          {editing ? (
            <>
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commit()
                  } else if (e.key === 'Escape') {
                    setEditing(false)
                    setDraft(section)
                  }
                }}
                className="h-7 max-w-64 text-sm font-semibold"
              />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={commit}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setEditing(false)
                  setDraft(section)
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <h5 className="text-sm font-semibold">{section}</h5>
              <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                {keys.length}
              </Badge>
              <span className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(section)
                    setEditing(true)
                  }}
                  title={t('preview.renameSection')}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {!isFirst && (
                  <button
                    type="button"
                    onClick={onMoveUp}
                    title={t('preview.moveSectionUp')}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                )}
                {!isLast && (
                  <button
                    type="button"
                    onClick={onMoveDown}
                    title={t('preview.moveSectionDown')}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </>
          )}
        </div>
      )}
      {section !== undefined && <Separator className="mb-2" />}
      <SortableContext items={items} strategy={rectSortingStrategy}>
        {keys.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {keys.map(
              (k) =>
                fieldsByKey.has(k) && (
                  <SortablePreviewField
                    key={k}
                    field={fieldsByKey.get(k)!}
                    tabOptions={tabOptions}
                    onMoveToTab={onMoveFieldToTab}
                  />
                ),
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            {dropHint}
          </div>
        )}
      </SortableContext>
    </div>
  )
}

function NewSectionInline({ onCreate, placeholder }: { onCreate: (label: string) => void; placeholder: string }) {
  const { t } = useTranslation(['assets'])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="border-dashed" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {t('preview.newSection')}
      </Button>
    )
  }
  const commit = () => {
    if (draft.trim()) onCreate(draft.trim())
    setDraft('')
    setOpen(false)
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="h-8 max-w-64"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setDraft('')
            setOpen(false)
          }
        }}
      />
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={commit}>
        <Check className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => {
          setDraft('')
          setOpen(false)
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

function PreviewTabContent() {
  const { t } = useTranslation(['assets', 'common'])
  const form = useFormContext<FormValues>()
  const schemaJson = useWatch({ control: form.control, name: 'schemaJson' })
  const lifecycleStates = useWatch({ control: form.control, name: 'lifecycleStates' })
  const maintenanceChecklist = useWatch({ control: form.control, name: 'maintenanceChecklist' })
  const [activePreviewTab, setActivePreviewTab] = useState<string | null>(null)

  const preview = useMemo(() => {
    try {
      const schema = JSON.parse(schemaJson || '{}')
      const allProps = { ...(schema.properties || {}) }
      
      if (schema.dependencies) {
        Object.values(schema.dependencies).forEach((config: any) => {
          if (config.oneOf) {
            config.oneOf.forEach((opt: any) => {
              if (opt.properties) {
                // Do not include the parent condition field itself, just the dependent ones
                Object.entries(opt.properties).forEach(([k, propDef]: [string, any]) => {
                  if (k !== Object.keys(opt.properties)[0]) { // The first key is usually the parent condition
                    allProps[k] = propDef
                  }
                })
              }
            })
          }
        })
      }

      const rawFields: PreviewField[] = Object.entries(allProps).map(([key, prop]: [string, any]) => ({
        keyName: key,
        title: prop.title || key,
        type: prop.type === 'array' && prop.items?.format === 'data-url' ? 'files'
          : prop.format === 'data-url' ? 'file'
          : prop.format === 'date' ? 'date'
          : prop.catalogCode ? 'catalog'
          : prop.enum ? 'enum'
          : prop.type || 'string',
        required: (schema.required || []).includes(key),
        enumOptions: prop.enum?.join(', ') || undefined,
        catalogCode: prop.catalogCode || undefined,
        tab: typeof prop.tab === 'string' && prop.tab.trim() ? prop.tab.trim() : 'General',
        section: typeof prop.section === 'string' && prop.section.trim() ? prop.section.trim() : undefined,
      }))
      
      // Filter out duplicate fields (because multiple catch blocks might define the same field logic)
      const fields = Array.from(new Map(rawFields.map(f => [f.keyName, f])).values())
      // Tab order: x-form-tabs metadata first, then first appearance in properties.
      const tabs: string[] = []
      const pushTab = (t: string) => { if (t && !tabs.includes(t)) tabs.push(t) }
      const xTabs = Array.isArray(schema['x-form-tabs']) ? schema['x-form-tabs'] : []
      xTabs.forEach((t: unknown) => { if (typeof t === 'string') pushTab(t.trim()) })
      fields.forEach((f) => pushTab(f.tab))
      if (tabs.length === 0) tabs.push('General')
      return { fields, tabs }
    } catch {
      return { fields: [] as PreviewField[], tabs: [] as string[] }
    }
  }, [schemaJson])

  const previewFields = preview.fields
  const fieldsByKey = useMemo(() => new Map(previewFields.map((f) => [f.keyName, f])), [previewFields])
  const layout: LayoutModel | null = useMemo(() => parseLayoutModel(schemaJson), [schemaJson])

  const persist = useCallback(
    (nextSchema: unknown) => {
      form.setValue('schemaJson', JSON.stringify(nextSchema, null, 2), { shouldDirty: true, shouldTouch: true })
    },
    [form],
  )

  const safeParseSchema = (): Record<string, unknown> | null => {
    try {
      return JSON.parse(schemaJson || '{}') as Record<string, unknown>
    } catch {
      return null
    }
  }

  const tabs = layout?.tabs ?? preview.tabs
  const activeTab = activePreviewTab && tabs.includes(activePreviewTab) ? activePreviewTab : tabs[0]

  const sectionOrder: string[] = useMemo(() => {
    if (!activeTab) return []
    const fromMeta = layout?.sectionsByTab[activeTab] ?? []
    const seen = new Set(fromMeta)
    const extras: string[] = []
    previewFields.forEach((f) => {
      if (f.tab === activeTab && f.section && !seen.has(f.section)) {
        seen.add(f.section)
        extras.push(f.section)
      }
    })
    return [...fromMeta, ...extras]
  }, [layout, previewFields, activeTab])

  const groupKeysOf = (tab: string, section: string | undefined): string[] =>
    previewFields
      .filter((f) => f.tab === tab && (f.section ?? undefined) === (section ?? undefined))
      .map((f) => f.keyName)

  const sectionlessKeys = activeTab ? groupKeysOf(activeTab, undefined) : []
  const tabCount = (tb: string) => previewFields.filter((f) => f.tab === tb).length

  const handleMoveFieldToTab = (key: string, destTab: string) => {
    const schema = safeParseSchema()
    if (!schema) return
    const current = fieldsByKey.get(key)
    const destSections = layout?.sectionsByTab[destTab] ?? []
    const keep = current?.section && destSections.includes(current.section) ? current.section : undefined
    persist(moveFieldKey(schema, key, destTab, keep, -1))
    setActivePreviewTab(destTab)
  }

  const handleRenameSection = (tab: string, oldLabel: string, nextLabel: string) => {
    const schema = safeParseSchema()
    if (schema) persist(renameSectionLabel(schema, tab, oldLabel, nextLabel))
  }

  const handleCreateSection = (tab: string, label: string) => {
    const schema = safeParseSchema()
    if (schema) persist(createSectionLabel(schema, tab, label))
  }

  const handleMoveSection = (tab: string, from: number, to: number) => {
    const schema = safeParseSchema()
    if (schema) persist(moveSectionLabel(schema, tab, from, to))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const [activeDrag, setActiveDrag] = useState<ParsedDragId | null>(null)

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDrag(parsePreviewDragId(String(event.active.id)))
  }

  const handleDragCancel = () => {
    setActiveDrag(null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const a = parsePreviewDragId(String(active.id))
    const o = parsePreviewDragId(String(over.id))
    // Hovering another tab header while dragging a field switches to it,
    // so the field can be dropped inside that tab.
    if (a?.kind === 'field' && o?.kind === 'tab' && o.value !== activeTab) {
      setActivePreviewTab(o.value)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return
    const a = parsePreviewDragId(String(active.id))
    const o = parsePreviewDragId(String(over.id))
    if (!a || !o) return
    const schema = safeParseSchema()
    if (!schema) return

    if (a.kind === 'tab' && o.kind === 'tab') {
      const from = tabs.indexOf(a.value)
      const to = tabs.indexOf(o.value)
      if (from >= 0 && to >= 0 && from !== to) persist(moveTabLabel(schema, from, to))
      return
    }
    if (a.kind !== 'field' || !activeTab) return
    const key = a.value

    if (o.kind === 'tab') {
      handleMoveFieldToTab(key, o.value)
      return
    }

    let destTab = activeTab
    let destSection: string | undefined
    let destIndex = -1
    if (o.kind === 'field') {
      const target = fieldsByKey.get(o.value)
      if (!target) return
      destTab = target.tab
      destSection = target.section
      const group = groupKeysOf(destTab, destSection).filter((k) => k !== key)
      destIndex = group.indexOf(o.value)
      if (destIndex < 0) return
      // Same-group move downwards: insert AFTER the target, not before it.
      const current = fieldsByKey.get(key)
      if (current && current.tab === destTab && (current.section ?? undefined) === (destSection ?? undefined)) {
        const original = groupKeysOf(destTab, destSection)
        if (original.indexOf(key) < original.indexOf(o.value)) destIndex += 1
      }
    } else if (o.kind === 'group') {
      destTab = o.value
      destSection = o.extra ? o.extra : undefined
      destIndex = -1
    } else {
      return
    }
    persist(moveFieldKey(schema, key, destTab, destSection, destIndex))
    if (destTab !== activeTab) setActivePreviewTab(destTab)
  }

  const lifecycleSummary = useMemo(() => {
    try {
      const parsed = JSON.parse(lifecycleStates || '{}')
      const states = Object.keys(parsed.transitions || {})
      return {
        initial: parsed.initialState || (states[0] || ''),
        states,
        transitions: parsed.transitions || {},
      }
    } catch {
      return { initial: '', states: [], transitions: {} }
    }
  }, [lifecycleStates])

  const checklistTasks = useMemo(() => {
    try {
      const parsed = JSON.parse(maintenanceChecklist || '{}')
      return Array.isArray(parsed.tasks) ? parsed.tasks : []
    } catch {
      return []
    }
  }, [maintenanceChecklist])

  return (
    <TabsContent value="preview" className="flex flex-col gap-6 mt-0 overflow-y-auto">
      <Alert className="bg-muted border-border">
        <Info className="h-4 w-4" />
        <AlertDescription className="space-y-1">
          <p>{t('preview.approximateView')}</p>
          <p className="flex items-start gap-1.5">
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('preview.interactiveHint')}</span>
          </p>
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t('preview.assetAttributes')}</h4>
        {previewFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.noAttributes')}</p>
        ) : !layout || !activeTab ? (
          <p className="text-sm text-destructive">{t('preview.invalidSchema')}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tabs.map(tabDragId)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-1.5 rounded-md bg-muted/60 p-1">
                {tabs.map((tab) => (
                  <SortablePreviewTab
                    key={tab}
                    tab={tab}
                    count={tabCount(tab)}
                    active={tab === activeTab}
                    reorderable={tabs.length > 1}
                    onSelect={() => setActivePreviewTab(tab)}
                  />
                ))}
              </div>
            </SortableContext>
            <div className="mt-3 space-y-4">
              {(sectionlessKeys.length > 0 || sectionOrder.length === 0) && (
                <PreviewSectionBlock
                  tab={activeTab}
                  section={undefined}
                  keys={sectionlessKeys}
                  fieldsByKey={fieldsByKey}
                  tabOptions={tabs}
                  isFirst
                  isLast
                  dropHint={t('preview.dropHere')}
                  onMoveUp={() => undefined}
                  onMoveDown={() => undefined}
                  onRename={() => undefined}
                  onMoveFieldToTab={handleMoveFieldToTab}
                />
              )}
              {sectionOrder.map((section, idx) => (
                <PreviewSectionBlock
                  key={`${activeTab}:${section}`}
                  tab={activeTab}
                  section={section}
                  keys={groupKeysOf(activeTab, section)}
                  fieldsByKey={fieldsByKey}
                  tabOptions={tabs}
                  isFirst={idx === 0}
                  isLast={idx === sectionOrder.length - 1}
                  dropHint={t('preview.dropHere')}
                  onMoveUp={() => handleMoveSection(activeTab, idx, idx - 1)}
                  onMoveDown={() => handleMoveSection(activeTab, idx, idx + 1)}
                  onRename={(next) => handleRenameSection(activeTab, section, next)}
                  onMoveFieldToTab={handleMoveFieldToTab}
                />
              ))}
              <NewSectionInline
                onCreate={(label) => handleCreateSection(activeTab, label)}
                placeholder={t('preview.sectionNamePlaceholder')}
              />
            </div>
            <DragOverlay dropAnimation={null}>
              {activeDrag?.kind === 'field' && fieldsByKey.has(activeDrag.value) ? (
                <div className="w-72 max-w-full rounded-md border border-primary/50 bg-background/95 p-3 shadow-xl backdrop-blur-sm pointer-events-none ring-1 ring-primary/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <GripVertical className="h-4 w-4 text-primary" />
                    <code className="truncate font-mono text-[10px] text-muted-foreground">
                      {activeDrag.value}
                    </code>
                  </div>
                  <SchemaFieldPreview field={fieldsByKey.get(activeDrag.value)!} />
                </div>
              ) : activeDrag?.kind === 'tab' ? (
                <div className="flex items-center gap-1.5 rounded-md border border-primary bg-background px-3 py-1.5 text-xs shadow-xl ring-1 ring-primary/40 pointer-events-none">
                  <GripVertical className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold">{activeDrag.value}</span>
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {tabCount(activeDrag.value)}
                  </Badge>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t('preview.lifecycle')}</h4>
        {lifecycleSummary.states.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.noStates')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lifecycleSummary.states.map((state) => (
              <Badge
                key={state}
                variant={state === lifecycleSummary.initial ? 'default' : 'outline'}
              >
                {state === lifecycleSummary.initial && (
                  <Info className="h-3 w-3 mr-1" />
                )}
                {state}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t('preview.maintenanceChecklist')}</h4>
        {checklistTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty.noTasks')}</p>
        ) : (
          <ul className="list-decimal list-inside text-sm space-y-1">
            {checklistTasks.map((task: any, idx: number) => (
              <li key={idx}>{task.title || t('preview.untitledTask')}</li>
            ))}
          </ul>
        )}
      </div>
    </TabsContent>
  )
}

export function AssetTemplateFormSheet({ open, onOpenChange, template }: Props) {
  const { t } = useTranslation(['assets', 'common'])
  const queryClient = useQueryClient()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      businessEntityTypeId: '00000000-0000-0000-0000-000000000000',
      schemaJson: '{\n  "type": "object",\n  "properties": {}\n}',
      lifecycleStates: '{\n  "initialState": "Active",\n  "transitions": {\n    "Active": ["Inactive"],\n    "Inactive": ["Active"]\n  }\n}',
      maintenanceChecklist: '',
    },
  })

  const watchedName = form.watch('name')

  useEffect(() => {
    if (open) {
      if (template) {
        form.reset({
          code: template.code,
          name: template.name,
          description: template.description || '',
          businessEntityTypeId: template.businessEntityTypeId || '00000000-0000-0000-0000-000000000000',
          schemaJson: template.schemaJson || '{\n  "type": "object",\n  "properties": {}\n}',
          lifecycleStates: typeof template.lifecycleStates === 'string'
            ? template.lifecycleStates
            : JSON.stringify(template.lifecycleStates, null, 2) || '{\n  "initialState": "Active",\n  "transitions": {\n    "Active": ["Inactive"],\n    "Inactive": ["Active"]\n  }\n}',
          maintenanceChecklist: template.maintenanceChecklist || '',
        })
      } else {
        form.reset({
          code: '',
          name: '',
          description: '',
          businessEntityTypeId: '00000000-0000-0000-0000-000000000000',
          schemaJson: '{\n  "type": "object",\n  "properties": {}\n}',
          lifecycleStates: '{\n  "initialState": "Active",\n  "transitions": {\n    "Active": ["Inactive"],\n    "Inactive": ["Active"]\n  }\n}',
          maintenanceChecklist: '',
        })
      }
    }
  }, [open, template, form])

  const normalizeLifecycleStates = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson || '{}')
      if (!parsed.initialState) {
        const stateKeys = Object.keys(parsed.states || parsed.transitions || {})
        if (stateKeys.length > 0) {
          parsed.initialState = stateKeys[0]
        } else {
          parsed.initialState = 'Active'
        }
      }
      return parsed
    } catch {
      return { initialState: 'Active', transitions: {}, states: {} }
    }
  }

  const createMutation = useMutation({
    mutationFn: assetTemplateService.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success(t('toast.templateCreated'))
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.detail || t('toast.templateCreateError')
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      assetTemplateService.updateTemplate(template.id, {
        name: data.name,
        description: data.description || '',
        schemaJson: data.schemaJson,
        allowedChildTemplateIds: [],
        lifecycleStates: normalizeLifecycleStates(data.lifecycleStates),
        maintenanceChecklist: data.maintenanceChecklist || '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success(t('toast.templateUpdated'))
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.detail || t('toast.templateUpdateError')
      toast.error(msg)
    },
  })

  const onSubmit = (data: FormValues) => {
    if (template) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate({
        ...data,
        description: data.description || '',
        businessEntityTypeId: data.businessEntityTypeId || '00000000-0000-0000-0000-000000000000',
        allowedChildTemplateIds: [],
        lifecycleStates: normalizeLifecycleStates(data.lifecycleStates),
        maintenanceChecklist: data.maintenanceChecklist || '',
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const errors = Object.keys(form.formState.errors).length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={`${formSheetContentClass} w-full sm:max-w-[95vw]`}>
        <Form {...form}>
          <FormSheetLayout
            onSubmit={form.handleSubmit(onSubmit, (err) => console.log('FORM ERRORS:', err))}
            header={
              <SheetHeader className="p-6 pb-4">
                <SheetTitle>
                  {template 
                    ? `${t('form.editTemplate')}${watchedName ? ` - ${watchedName}` : (template.name ? ` - ${template.name}` : '')}`
                    : t('form.newTemplate')}
                </SheetTitle>
                <SheetDescription>
                  {t('form.templateDescription')}
                </SheetDescription>
              </SheetHeader>
            }
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? t('form.saving') : t('form.saveTemplate')}
                </Button>
              </>
            }
          >
            {errors && (
              <Alert variant="destructive" className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {t('form.checkMarkedFields')}
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="general" className="flex flex-col flex-1 min-h-0">
              <TabsList className="self-start mb-4 flex-wrap h-auto">
                <TabsTrigger value="general">
                  <FileText className="h-4 w-4 mr-2" />
                  {t('tabs.general')}
                </TabsTrigger>
                <TabsTrigger value="attributes">
                  <List className="h-4 w-4 mr-2" />
                  {t('form.tabAttributes')}
                </TabsTrigger>
                <TabsTrigger value="lifecycle">
                  <GitBranch className="h-4 w-4 mr-2" />
                  {t('form.tabLifecycle')}
                </TabsTrigger>
                <TabsTrigger value="checklist">
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {t('form.tabChecklist')}
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-2" />
                  {t('form.tabPreview')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="flex flex-col gap-6 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.code')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('form.templateCodePlaceholder')}
                            readOnly={!!template}
                            className={template ? "bg-muted cursor-not-allowed text-muted-foreground" : ""}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.name')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('form.templateNamePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('table.headers.description')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('form.descriptionPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-muted/30 rounded-md p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">{t('form.whatIsTemplateTitle')}</p>
                  <p>
                    {t('form.whatIsTemplateBody')}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="attributes" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    {t('form.attributesAlert')}
                  </AlertDescription>
                </Alert>
                <SchemaBuilderField />
              </TabsContent>

              <TabsContent value="lifecycle" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    {t('form.lifecycleAlert')}
                  </AlertDescription>
                </Alert>
                <LifecycleCanvasField />
              </TabsContent>

              <TabsContent value="checklist" className="flex flex-col gap-6 mt-0">
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    {t('form.checklistAlert')}
                  </AlertDescription>
                </Alert>
                <MaintenanceChecklistField />
              </TabsContent>
              <PreviewTabContent />
            </Tabs>
          </FormSheetLayout>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
