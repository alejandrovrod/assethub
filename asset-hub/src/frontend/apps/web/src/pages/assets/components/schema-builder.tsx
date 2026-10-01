import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { catalogService, Catalog } from '@/services/catalog.service';

const EMPTY_CATALOGS: Catalog[] = [];
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { GripVertical, Plus, Trash2, AlertCircle, Eye, EyeOff, LayoutPanelTop, Edit2, X, ChevronLeft, ChevronRight, PanelLeft, LayoutGrid } from 'lucide-react';
import { SchemaFieldPreview } from './schema-field-preview';
import { useTranslation } from 'react-i18next';

interface SchemaField {
  id: string; // React key, immutable
  keyName: string; // The editable JSON property key
  title: string;
  type: string; // 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'catalog'
  required: boolean;
  enumOptions?: string;
  catalogCode?: string;
  propagateToWork?: boolean;
  tab?: string; // Tab assignment for visual grouping
  section?: string; // Section within tab for sub-grouping
  isSectionDivider?: boolean; // Marks this entry as a section divider (not a real field)
  visibleIf?: {
    fieldId: string;
    value: string;
  };
}

interface SchemaTab {
  id: string;
  label: string;
}

interface SchemaSection {
  id: string;
  label: string;
  tabId: string; // Which tab this section belongs to
}

interface SchemaBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

const FIELD_TYPE_OPTIONS = [
  { value: 'string', labelKey: 'fieldTypes.string.label', helpKey: 'fieldTypes.string.help' },
  { value: 'number', labelKey: 'fieldTypes.number.label', helpKey: 'fieldTypes.number.help' },
  { value: 'boolean', labelKey: 'fieldTypes.boolean.label', helpKey: 'fieldTypes.boolean.help' },
  { value: 'date', labelKey: 'fieldTypes.date.label', helpKey: 'fieldTypes.date.help' },
  { value: 'enum', labelKey: 'fieldTypes.enum.label', helpKey: 'fieldTypes.enum.help' },
  { value: 'catalog', labelKey: 'fieldTypes.catalog.label', helpKey: 'fieldTypes.catalog.help' },
  { value: 'employee', labelKey: 'fieldTypes.employee.label', helpKey: 'fieldTypes.employee.help' },
  { value: 'team', labelKey: 'fieldTypes.team.label', helpKey: 'fieldTypes.team.help' },
  { value: 'file', labelKey: 'fieldTypes.file.label', helpKey: 'fieldTypes.file.help' },
  { value: 'files', labelKey: 'fieldTypes.files.label', helpKey: 'fieldTypes.files.help' },
  // NOTE: section dividers are pseudo-entries created via "Agregar Sección";
  // they never serialize as real properties, so 'section' is not a field type here.
] as const;

// Tab labels double as ids (label-as-id): serialization writes `prop.tab = "<label>"`,
// exactly matching the spec's schema format, and renaming a tab remaps field values.
const DEFAULT_TAB_LABEL = 'General';

const DEFAULT_TABS: SchemaTab[] = [{ id: DEFAULT_TAB_LABEL, label: DEFAULT_TAB_LABEL }];

// Sentinel for the "Sin sección" option (Radix Select forbids empty-string item values).
const NO_SECTION_VALUE = '__no_section__';

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSectionId() {
  return `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function entryTab(f: SchemaField, fallbackTab: string = DEFAULT_TAB_LABEL): string {
  return (f.tab || '').trim() || fallbackTab;
}

/** Moves a real field so it sits right below its section divider (or above the first
 * divider when the section is cleared), keeping list position and section label in sync. */
function placeFieldInSection(
  arr: SchemaField[],
  id: string,
  section: string | undefined,
  tabLabel: string,
  fallbackTab: string = DEFAULT_TAB_LABEL
): SchemaField[] {
  const from = arr.findIndex((f) => f.id === id);
  if (from < 0) return arr;
  let to: number;
  if (section) {
    const divIdx = arr.findIndex(
      (f) => f.isSectionDivider && entryTab(f, fallbackTab) === tabLabel && (f.title || '').trim() === section
    );
    if (divIdx < 0) return arr;
    to = divIdx + 1;
  } else {
    const firstDiv = arr.findIndex((f) => f.isSectionDivider && entryTab(f, fallbackTab) === tabLabel);
    if (firstDiv < 0) return arr;
    to = firstDiv;
  }
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(from < to ? to - 1 : to, 0, moved);
  return next;
}

/** Moves a field to the end of the given tab's entries (used when reassigning tabs). */
function placeFieldAtEndOfTab(
  arr: SchemaField[],
  id: string,
  tabLabel: string,
  fallbackTab: string = DEFAULT_TAB_LABEL
): SchemaField[] {
  const from = arr.findIndex((f) => f.id === id);
  if (from < 0) return arr;
  let lastIdx = -1;
  arr.forEach((f, i) => {
    if (f.id !== id && entryTab(f, fallbackTab) === tabLabel) lastIdx = i;
  });
  const to = lastIdx + 1;
  if (to === from + 1) return arr;
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(from < to ? to - 1 : to, 0, moved);
  return next;
}

/** Recomputes each field's `section` from the nearest divider above it (per tab).
 *  Position is the source of truth: dividers define sections, fields inherit them.
 *  When `tabLabel` is given, only that tab's fields are updated. Returns the same
 *  reference when nothing changed, to keep SortableField memoization intact. */
function recomputeSections(
  arr: SchemaField[],
  tabLabel?: string,
  fallbackTab: string = DEFAULT_TAB_LABEL
): SchemaField[] {
  const current: Record<string, string | undefined> = {};
  let changed = false;
  const next = arr.map((f) => {
    if (f.isSectionDivider) {
      current[entryTab(f, fallbackTab)] = (f.title || '').trim() || undefined;
      return f;
    }
    if (tabLabel !== undefined && entryTab(f, fallbackTab) !== tabLabel) return f;
    const section = current[entryTab(f, fallbackTab)];
    if (f.section === section) return f;
    changed = true;
    return { ...f, section };
  });
  return changed ? next : arr;
}

// FieldTypeHelp removed to improve performance

const SortableField = memo(function SortableField({
  field,
  onUpdate,
  onDelete,
  catalogs,
  validation,
  showPreview,
  availableTabs,
  activeTabId,
  sectionsForActiveTab,
  allFields,
}: {
  field: SchemaField;
  onUpdate: (id: string, updates: Partial<SchemaField>) => void;
  onDelete: (id: string) => void;
  catalogs: Catalog[];
  validation: { emptyKey: boolean; duplicateKey: boolean; missingConfig: boolean; message?: string };
  showPreview: boolean;
  availableTabs: SchemaTab[];
  activeTabId: string;
  sectionsForActiveTab: SchemaSection[];
  allFields: SchemaField[];
}) {
  const { t } = useTranslation('assets');
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const isSectionDivider = field.isSectionDivider === true;

  // For section dividers, show a different UI
  if (isSectionDivider) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 p-3 bg-muted/50 border border-dashed rounded-md mb-2"
      >
        <div
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="cursor-grab text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-5 w-5" />
        </div>
        <div className="flex-1 flex items-center gap-3">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <div className="md:col-span-7">
              <Input
                value={field.title}
                onChange={(e) => onUpdate(field.id, { title: e.target.value })}
                placeholder={t('schema.sectionNamePlaceholder')}
                className="font-medium"
              />
            </div>
            <div className="md:col-span-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(field.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-3 p-3 bg-card border rounded-md mb-2 shadow-sm ${
        validation.emptyKey || validation.duplicateKey || validation.missingConfig
          ? 'border-destructive/50 bg-destructive/5'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="cursor-grab text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-3">
            <Input
              value={field.keyName}
              onChange={(e) => onUpdate(field.id, { keyName: e.target.value })}
              placeholder={t('schema.keyPlaceholder')}
              className={`font-mono text-sm ${validation.emptyKey || validation.duplicateKey ? 'border-destructive' : ''}`}
            />
          </div>
          <div className="md:col-span-4">
            <Input
              value={field.title}
              onChange={(e) => onUpdate(field.id, { title: e.target.value })}
              placeholder={t('schema.labelPlaceholder')}
            />
          </div>
          <div className="md:col-span-2">
            <Select value={field.type} onValueChange={(val) => onUpdate(field.id, { type: val })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{t(opt.labelKey)}</span>
                      <span className="text-[10px] text-muted-foreground">{t(opt.helpKey)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={field.propagateToWork}
                onCheckedChange={(c) => onUpdate(field.id, { propagateToWork: !!c })}
                id={`prop-${field.id}`}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor={`prop-${field.id}`} className="text-[10px] font-medium cursor-pointer leading-tight max-w-[60px] text-center">
                      {t('schema.propagateToOrders')}
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('schema.propagateTooltip')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={field.required}
                onCheckedChange={(c) => onUpdate(field.id, { required: !!c })}
                id={`req-${field.id}`}
              />
              <Label htmlFor={`req-${field.id}`} className="text-sm font-medium cursor-pointer">
                {t('schema.requiredAbbrev')}
              </Label>
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant={field.visibleIf?.fieldId ? "default" : "ghost"} 
                  size="icon" 
                  className={`h-8 w-8 ${!field.visibleIf?.fieldId ? 'text-muted-foreground' : ''}`}
                  title={t('schema.visibilityLogic')}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" side="left">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm leading-none mb-1">{t('schema.conditionalVisibility')}</h4>
                    <p className="text-xs text-muted-foreground">
                      {t('schema.conditionalHint')}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">{t('schema.dependsOnField')}</Label>
                    <Select
                      value={field.visibleIf?.fieldId || 'none'}
                      onValueChange={(val) => {
                        if (val === 'none') {
                          onUpdate(field.id, { visibleIf: undefined });
                        } else {
                          onUpdate(field.id, { visibleIf: { fieldId: val, value: '' } });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={t('schema.selectFieldPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('schema.noCondition')}</SelectItem>
                        {allFields
                          .filter((f: SchemaField) => f.id !== field.id && !f.isSectionDivider && (f.type === 'enum' || f.type === 'boolean'))
                          .map((f: SchemaField) => (
                            <SelectItem key={f.id} value={f.keyName || f.id}>{f.title || f.keyName}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {field.visibleIf && field.visibleIf.fieldId && (
                    <div className="space-y-2">
                      <Label className="text-xs">{t('schema.whenValueEquals')}</Label>
                      {(() => {
                        const parentField = allFields.find((f: SchemaField) => f.keyName === field.visibleIf?.fieldId || f.id === field.visibleIf?.fieldId);
                        if (!parentField) return <Input disabled placeholder={t('schema.fieldNotFound')} className="h-8 text-xs" />;
                        
                        if (parentField.type === 'boolean') {
                          return (
                            <Select
                              value={field.visibleIf.value || ''}
                              onValueChange={(val) => onUpdate(field.id, { visibleIf: { fieldId: field.visibleIf!.fieldId, value: val } })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder={t('schema.selectPlaceholder')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">{t('schema.yesTrue')}</SelectItem>
                                <SelectItem value="false">{t('schema.noFalse')}</SelectItem>
                              </SelectContent>
                            </Select>
                          );
                        }
                        
                        if (parentField.type === 'enum') {
                          const opts = (parentField.enumOptions || '').split(',').map((s: string) => s.trim()).filter(Boolean);
                          return (
                            <Select
                              value={field.visibleIf.value || ''}
                              onValueChange={(val) => onUpdate(field.id, { visibleIf: { fieldId: field.visibleIf!.fieldId, value: val } })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder={t('schema.selectOptionPlaceholder')} />
                              </SelectTrigger>
                              <SelectContent>
                                {opts.map((opt: string) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }

                        return <Input 
                          value={field.visibleIf.value || ''} 
                          onChange={(e) => onUpdate(field.id, { visibleIf: { fieldId: field.visibleIf!.fieldId, value: e.target.value } })}
                          className="h-8 text-xs" 
                        />;
                      })()}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(field.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {(validation.emptyKey || validation.duplicateKey || validation.missingConfig) && (
        <div className="pl-8 flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{validation.message}</span>
        </div>
      )}

      {field.type === 'enum' && (
        <div className="pl-8 pr-12">
          <Input
            value={field.enumOptions || ''}
            onChange={(e) => onUpdate(field.id, { enumOptions: e.target.value })}
            placeholder={t('schema.enumOptionsPlaceholder')}
            className={`text-sm bg-muted/50 ${validation.missingConfig ? 'border-destructive' : ''}`}
          />
        </div>
      )}

      {field.type === 'catalog' && (
        <div className="pl-8 pr-12">
          <Select
            value={field.catalogCode || ''}
            onValueChange={(val) => onUpdate(field.id, { catalogCode: val })}
          >
            <SelectTrigger className={`bg-muted/50 ${validation.missingConfig ? 'border-destructive' : ''}`}>
              <SelectValue placeholder={t('schema.selectCatalogPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {catalogs.length === 0 ? (
                <SelectItem value="none" disabled>
                  {t('schema.noCatalogs')}
                </SelectItem>
              ) : (
                catalogs.map((c) => (
                  <SelectItem key={c.id} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Tab Assignment */}
      <div className="pl-8 pr-12 pt-2">
        <div className="flex items-center gap-3">
          <LayoutPanelTop className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">{t('schema.tabLabel')}</span>
          {(() => {
            const fallbackTab = availableTabs[0]?.id || DEFAULT_TAB_LABEL;
            const currentTab = (field.tab || '').trim() || fallbackTab;
            const selectValue = availableTabs.some((t) => t.id === currentTab) ? currentTab : fallbackTab;
            return (
              <Select value={selectValue} onValueChange={(val) => onUpdate(field.id, { tab: val })}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTabs.map((tab) => (
                    <SelectItem key={tab.id} value={tab.id}>
                      {tab.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </div>
      </div>

      {/* Section Assignment (only for active tab) */}
      {sectionsForActiveTab.length > 0 &&
        ((field.tab || availableTabs[0]?.id || DEFAULT_TAB_LABEL) === activeTabId) && (
        <div className="pl-8 pr-12 pt-2">
          <div className="flex items-center gap-3">
            <PanelLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">{t('schema.sectionLabel')}</span>
            <Select
              value={field.section || NO_SECTION_VALUE}
              onValueChange={(val) => onUpdate(field.id, val === NO_SECTION_VALUE ? { section: undefined } : { section: val })}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t('schema.noSection')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SECTION_VALUE}>{t('schema.noSection')}</SelectItem>
                {sectionsForActiveTab.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showPreview && (
        <div className="pl-8 pr-12">
          <SchemaFieldPreview
            field={{
              keyName: field.keyName || 'preview',
              title: field.title || t('preview.previewLabel'),
              type: field.type,
              required: field.required,
              enumOptions: field.enumOptions,
              catalogCode: field.catalogCode,
            }}
          />
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.field === next.field &&
    prev.onUpdate === next.onUpdate &&
    prev.onDelete === next.onDelete &&
    prev.catalogs === next.catalogs &&
    prev.showPreview === next.showPreview &&
    prev.availableTabs === next.availableTabs &&
    prev.activeTabId === next.activeTabId &&
    prev.sectionsForActiveTab === next.sectionsForActiveTab &&
    prev.validation.emptyKey === next.validation.emptyKey &&
    prev.validation.duplicateKey === next.validation.duplicateKey &&
    prev.validation.missingConfig === next.validation.missingConfig &&
    prev.validation.message === next.validation.message
  );
});

export const SchemaBuilder = memo(function SchemaBuilder({ value, onChange }: SchemaBuilderProps) {
  const { t } = useTranslation('assets');
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [tabs, setTabs] = useState<SchemaTab[]>(DEFAULT_TABS);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_LABEL);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Kept in sync synchronously so debounced notifyChange always reads fresh tabs.
  const tabsRef = useRef<SchemaTab[]>(DEFAULT_TABS);
  const renameCanceledRef = useRef(false);
  const isCommittingRef = useRef(false);

  const { data: catalogs = EMPTY_CATALOGS } = useQuery({
    queryKey: ['catalogs'],
    queryFn: () => catalogService.getCatalogs(),
  });

  useEffect(() => {
    try {
      if (!value) return;
      const schema = JSON.parse(value);
      if (schema.type !== 'object' || !schema.properties) return;

      const rawProps = { ...(schema.properties || {}) };

      // Flatten dependencies back into root for UI builder state
      if (schema.dependencies) {
        Object.entries(schema.dependencies).forEach(([parentKey, config]: [string, any]) => {
          if (config.oneOf) {
            config.oneOf.forEach((option: any) => {
              if (option.properties) {
                const parentProp = option.properties[parentKey];
                const parentValue = parentProp?.enum?.[0] ?? parentProp?.const;
                
                Object.entries(option.properties).forEach(([k, propDef]: [string, any]) => {
                  if (k === parentKey) return;
                  
                  rawProps[k] = propDef;
                  if (option.required?.includes(k)) {
                    if (!schema.required) schema.required = [];
                    if (!schema.required.includes(k)) schema.required.push(k);
                  }
                  
                  if (parentValue !== undefined) {
                    rawProps[k]._visibleIf = {
                      fieldId: parentKey,
                      value: String(parentValue)
                    };
                  }
                });
              }
            });
          }
        });
      }

      const keys = Object.keys(rawProps);

      // ---- Tab order: x-form-tabs metadata first, then first appearance in properties ----
      const tabOrder: string[] = [];
      const pushTab = (t: string) => {
        if (t && !tabOrder.includes(t)) tabOrder.push(t);
      };
      const xTabs = schema['x-form-tabs'];
      if (Array.isArray(xTabs)) {
        xTabs.forEach((t: unknown) => {
          if (typeof t === 'string') pushTab(t);
        });
      }
      let missingDefaultTab = keys.length === 0;
      keys.forEach((k) => {
        const t = rawProps[k]?.tab;
        if (typeof t === 'string' && t.trim()) pushTab(t.trim());
        else missingDefaultTab = true;
      });
      if (missingDefaultTab) pushTab(DEFAULT_TAB_LABEL);
      if (tabOrder.length === 0) pushTab(DEFAULT_TAB_LABEL);

      // ---- Section metadata (ordering + sections that still have no fields) ----
      const xSections = schema['x-form-sections'];
      const sectionMeta: Record<string, string[]> = {};
      if (xSections && typeof xSections === 'object') {
        Object.keys(xSections).forEach((t) => {
          const list = xSections[t];
          if (Array.isArray(list)) {
            const labels = list
              .filter((s: unknown): s is string => typeof s === 'string' && !!s.trim())
              .map((s: string) => s.trim());
            if (labels.length) sectionMeta[t] = labels;
          }
        });
      }

      const loadedFields: SchemaField[] = [];
      const seenSections: Record<string, Set<string>> = {};
      const addDivider = (tab: string, section: string) => {
        const seen = (seenSections[tab] ||= new Set());
        if (seen.has(section)) return;
        seen.add(section);
        loadedFields.push({
          id: generateSectionId(),
          keyName: '',
          title: section,
          type: 'section',
          required: false,
          isSectionDivider: true,
          tab,
        });
      };

      keys.forEach((key) => {
        const prop = rawProps[key];
        let type = prop.type || 'string';
        let enumOptions = undefined;
        let catalogCode = undefined;

        if (prop.type === 'array' && prop.items?.format === 'data-url') {
          type = 'files';
        } else if (prop.format === 'data-url') {
          type = 'file';
        } else if (prop.type === 'string' && prop.format === 'date') {
          type = 'date';
        } else if (prop.type === 'date') {
          type = 'date'; // Handle legacy broken schemas
        } else if (prop.type === 'string' && prop.format === 'employee') {
          type = 'employee';
        } else if (prop.type === 'string' && prop.format === 'team') {
          type = 'team';
        } else if (prop.catalogCode) {
          type = 'catalog';
          catalogCode = prop.catalogCode;
        } else if (prop.enum) {
          type = 'enum';
          enumOptions = prop.enum.join(', ');
        }

        const tab = typeof prop.tab === 'string' && prop.tab.trim() ? prop.tab.trim() : DEFAULT_TAB_LABEL;
        const section =
          typeof prop.section === 'string' && prop.section.trim() ? prop.section.trim() : undefined;

        if (section) addDivider(tab, section);

        loadedFields.push({
          id: generateId(),
          keyName: key,
          title: prop.title || key,
          type,
          required: schema.required?.includes(key) || false,
          enumOptions,
          catalogCode,
          propagateToWork: prop.propagateToWork || false,
          tab,
          section,
          visibleIf: prop._visibleIf,
        });
      });

      // Sections declared in metadata that have no fields assigned yet
      Object.keys(sectionMeta).forEach((tab) => {
        sectionMeta[tab].forEach((s) => addDivider(tab, s));
      });

      const loadedTabs: SchemaTab[] = tabOrder.map((label) => ({ id: label, label }));
      tabsRef.current = loadedTabs;
      setTabs(loadedTabs);
      setActiveTabId(loadedTabs[0].id);
      setFields(loadedFields);
    } catch (e) {
      console.error('Error parsing schema JSON', e);
    }
  }, []); // Run only once

  const keyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    fields.forEach((f) => {
      const key = f.keyName.trim().toLowerCase();
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [fields]);

  const getValidation = (field: SchemaField) => {
    // Section dividers are pseudo-entries: no key, no type config, no validation.
    if (field.isSectionDivider) {
      return { emptyKey: false, duplicateKey: false, missingConfig: false };
    }

    const trimmedKey = field.keyName.trim();
    const normalizedKey = trimmedKey.toLowerCase();

    if (!trimmedKey) {
      return { emptyKey: true, duplicateKey: false, missingConfig: false, message: t('schema.keyEmpty') };
    }

    if (keyCounts[normalizedKey] > 1) {
      return { emptyKey: false, duplicateKey: true, missingConfig: false, message: t('schema.keyDuplicate') };
    }

    if (field.type === 'enum') {
      const opts = (field.enumOptions || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        return { emptyKey: false, duplicateKey: false, missingConfig: true, message: t('schema.addOption') };
      }
    }

    if (field.type === 'catalog' && !field.catalogCode) {
      return { emptyKey: false, duplicateKey: false, missingConfig: true, message: t('schema.selectCatalog') };
    }

    return { emptyKey: false, duplicateKey: false, missingConfig: false };
  };

  const hasErrors = useMemo(() => {
    return fields.some((f) => {
      const v = getValidation(f);
      return v.emptyKey || v.duplicateKey || v.missingConfig;
    });
  }, [fields]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const notifyChange = useCallback((newFields: SchemaField[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const activeTabs = tabsRef.current;
      const fallback = activeTabs[0]?.id || DEFAULT_TAB_LABEL;
      // Positional dividers are the source of truth for `section` values.
      const normalized = recomputeSections(newFields, undefined, fallback);

      const buildProp = (f: SchemaField): Record<string, any> => {
        const propConfig: Record<string, any> = { title: f.title };

        if (f.propagateToWork) {
          propConfig.propagateToWork = true;
        }

        if (f.type === 'enum') {
          propConfig.type = 'string';
          const opts = (f.enumOptions || '').split(',').map((s) => s.trim()).filter(Boolean);
          propConfig.enum = opts.length > 0 ? opts : ['_empty_'];
        } else if (f.type === 'catalog') {
          propConfig.type = 'string';
          if (f.catalogCode) {
            propConfig.catalogCode = f.catalogCode;
          }
        } else if (f.type === 'file') {
          propConfig.type = 'string';
          propConfig.format = 'data-url';
        } else if (f.type === 'employee') {
          propConfig.type = 'string';
          propConfig.format = 'employee';
        } else if (f.type === 'team') {
          propConfig.type = 'string';
          propConfig.format = 'team';
        } else if (f.type === 'files') {
          propConfig.type = 'array';
          propConfig.items = {
            type: 'string',
            format: 'data-url',
          };
        } else if (f.type === 'date') {
          propConfig.type = 'string';
          propConfig.format = 'date';
        } else {
          propConfig.type = f.type;
        }

        const tab = entryTab(f, fallback);
        const isDefaultSingleTab = activeTabs.length === 1 && activeTabs[0]?.label === DEFAULT_TAB_LABEL;
        if (!isDefaultSingleTab) {
          propConfig.tab = tab;
        }
        if (f.section) propConfig.section = f.section;

        return propConfig;
      };

      const schema: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
        'x-form-tabs'?: string[];
        'x-form-sections'?: Record<string, string[]>;
      } = {
        type: 'object',
        properties: {},
        required: [],
      };

      // Section order per tab (for metadata + renderer ordering), from divider entries.
      const sectionsByTab: Record<string, string[]> = {};
      normalized.forEach((f) => {
        if (!f.isSectionDivider) return;
        const label = (f.title || '').trim();
        if (!label) return;
        const tab = entryTab(f, fallback);
        const list = (sectionsByTab[tab] ||= []);
        if (!list.includes(label)) list.push(label);
      });

      // Map fields to JSON schema
      const rootProperties: Record<string, any> = {};
      const dependenciesMap: Record<string, { value: string; fields: Record<string, any> }[]> = {};
      const rootRequired: string[] = [];

      // Emit properties grouped in tab order so first-appearance order matches the tab bar.
      const emitted = new Set<SchemaField>();
      const processField = (f: SchemaField) => {
        if (f.isSectionDivider || emitted.has(f)) return;
        const key = f.keyName.trim() || 'unnamed_field';
        const propConfig = buildProp(f);
        
        if (f.visibleIf && f.visibleIf.fieldId && f.visibleIf.value) {
          const parentKey = f.visibleIf.fieldId;
          const parentVal = f.visibleIf.value;
          
          if (!dependenciesMap[parentKey]) dependenciesMap[parentKey] = [];
          
          let group = dependenciesMap[parentKey].find(g => g.value === parentVal);
          if (!group) {
            group = { value: parentVal, fields: {} };
            dependenciesMap[parentKey].push(group);
          }
          
          group.fields[key] = propConfig;
        } else {
          rootProperties[key] = propConfig;
          if (f.required) rootRequired.push(key);
        }
        
        emitted.add(f);
      };

      activeTabs.forEach(({ id: tab }) => {
        normalized.forEach((f) => {
          if (entryTab(f, fallback) === tab) processField(f);
        });
      });
      // Safety net: entries whose tab no longer exists (should not happen).
      normalized.forEach(processField);

      schema.properties = rootProperties;
      if (rootRequired.length > 0) schema.required = rootRequired;

      // Construct dependencies object
      const depKeys = Object.keys(dependenciesMap);
      if (depKeys.length > 0) {
        (schema as any).dependencies = {};
        
        for (const [parentKey, groups] of Object.entries(dependenciesMap)) {
          const oneOf: any[] = [];
          
          groups.forEach(group => {
            const requiredFields = Object.keys(group.fields).filter(k => {
              const fieldDef = normalized.find(f => f.keyName.trim() === k);
              return fieldDef?.required;
            });
            
            // Re-infer type for dependency condition based on string value
            let conditionValue: any = group.value;
            if (conditionValue === 'true') conditionValue = true;
            if (conditionValue === 'false') conditionValue = false;
            
            const optionBlock: any = {
              properties: {
                [parentKey]: {
                  enum: [conditionValue]
                },
                ...group.fields
              }
            };
            if (requiredFields.length > 0) optionBlock.required = requiredFields;
            
            oneOf.push(optionBlock);
          });
          
          // Catch-all block for other values
          oneOf.push({
            properties: {
              [parentKey]: {
                not: {
                  enum: groups.map(g => g.value === 'true' ? true : (g.value === 'false' ? false : g.value))
                }
              }
            }
          });
          
          (schema as any).dependencies[parentKey] = { oneOf };
        }
      }

      if (schema.required && schema.required.length === 0) {
        delete (schema as { required?: string[] }).required;
      }

      // Persist tab list only when non-default so legacy schemas round-trip byte-identical.
      if (activeTabs.length > 1 || activeTabs[0]?.label !== DEFAULT_TAB_LABEL) {
        schema['x-form-tabs'] = activeTabs.map((t) => t.label);
      }
      if (Object.keys(sectionsByTab).length > 0) {
        schema['x-form-sections'] = sectionsByTab;
      }

      onChangeRef.current(JSON.stringify(schema, null, 2));
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const pointerSensor = useSensor(PointerSensor);
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });

  const sensors = useSensors(pointerSensor, keyboardSensor);

  const tabFallback = tabs[0]?.id || DEFAULT_TAB_LABEL;

  // ---- Active-tab derived data (string-keyed so memo refs stay stable per keystroke) ----
  const visibleFields = useMemo(
    () => fields.filter((f) => entryTab(f, tabFallback) === activeTabId),
    [fields, activeTabId, tabFallback]
  );

  // Memoize visible ids so SortableContext doesn't trigger context updates on every keystroke
  const visibleIdsStr = visibleFields.map((f) => f.id).join(',');
  const visibleIds = useMemo(() => visibleFields.map((f) => f.id), [visibleIdsStr]);

  const activeSectionsKey = useMemo(
    () =>
      visibleFields
        .filter((f) => f.isSectionDivider)
        .map((f) => (f.title || '').trim())
        .join('\u0001'),
    [visibleFields]
  );

  const sectionsForActiveTab = useMemo<SchemaSection[]>(() => {
    const seen = new Set<string>();
    const out: SchemaSection[] = [];
    activeSectionsKey.split('\u0001').forEach((label) => {
      if (label && !seen.has(label)) {
        seen.add(label);
        out.push({ id: label, label, tabId: activeTabId });
      }
    });
    return out;
  }, [activeSectionsKey, activeTabId]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tabs.forEach((t) => {
      counts[t.id] = 0;
    });
    const fallback = tabs[0]?.id || DEFAULT_TAB_LABEL;
    fields.forEach((f) => {
      if (f.isSectionDivider) return;
      const t = entryTab(f, fallback);
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [fields, tabs]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return items;
        const fallback = tabsRef.current[0]?.id || DEFAULT_TAB_LABEL;
        // Position wins: dragging across dividers reassigns sections.
        const newArray = recomputeSections(arrayMove(items, oldIndex, newIndex), activeTabId, fallback);
        notifyChange(newArray);
        return newArray;
      });
    }
  };

  const addField = useCallback(() => {
    setFields((prev) => {
      const fallback = tabsRef.current[0]?.id || DEFAULT_TAB_LABEL;
      const newId = generateId();
      const newFields = recomputeSections(
        [
          ...prev,
          {
            id: newId,
            keyName: newId,
            title: 'Nuevo Atributo',
            type: 'string',
            required: false,
            tab: activeTabId,
          },
        ],
        activeTabId,
        fallback
      );
      notifyChange(newFields);
      return newFields;
    });
  }, [notifyChange, activeTabId]);

  const updateField = useCallback(
    (id: string, updates: Partial<SchemaField>) => {
      setFields((prev) => {
        const fallback = tabsRef.current[0]?.id || DEFAULT_TAB_LABEL;
        const before = prev.find((f) => f.id === id);
        if (!before) return prev;
        let next = prev;

        // Renaming a section divider remaps every field that references the old label.
        if (before.isSectionDivider && typeof updates.title === 'string') {
          const oldLabel = (before.title || '').trim();
          const newLabel = updates.title.trim();
          if (oldLabel && oldLabel !== newLabel) {
            next = next.map((f) =>
              !f.isSectionDivider &&
              entryTab(f, fallback) === entryTab(before, fallback) &&
              f.section === oldLabel
                ? { ...f, section: newLabel || undefined }
                : f
            );
          }
        }

        next = next.map((f) => (f.id === id ? { ...f, ...updates } : f));

        const after = next.find((f) => f.id === id);
        if (after && !after.isSectionDivider) {
          if ('tab' in updates && updates.tab && updates.tab !== before.tab) {
            next = placeFieldAtEndOfTab(next, id, updates.tab, fallback);
            next = recomputeSections(next, updates.tab, fallback);
          } else if ('section' in updates && updates.section !== before.section) {
            // The dropdown moves the field below the chosen divider (or above the first).
            next = placeFieldInSection(next, id, updates.section, entryTab(after, fallback), fallback);
          }
        }

        notifyChange(next);
        return next;
      });
    },
    [notifyChange]
  );

  const deleteField = useCallback((id: string) => {
    setFields((prev) => {
      const fallback = tabsRef.current[0]?.id || DEFAULT_TAB_LABEL;
      const target = prev.find((f) => f.id === id);
      let newFields = prev.filter((f) => f.id !== id);
      if (target?.isSectionDivider) {
        // Fields under the deleted divider fall to the previous one (or sectionless).
        newFields = recomputeSections(newFields, entryTab(target, fallback), fallback);
      }
      notifyChange(newFields);
      return newFields;
    });
  }, [notifyChange]);

  // ---- Tab management ----
  const startRename = (tab: SchemaTab) => {
    renameCanceledRef.current = false;
    setEditingTabId(tab.id);
    setRenameValue(tab.label);
  };

  const commitRename = () => {
    if (renameCanceledRef.current) {
      renameCanceledRef.current = false;
      return;
    }
    if (isCommittingRef.current) return;
    const target = editingTabId;
    if (!target) return;

    isCommittingRef.current = true;
    try {
      setEditingTabId(null);
      const currentTabs = tabsRef.current;
      if (!currentTabs.some((t) => t.id === target)) return; // already committed

      let label = renameValue.trim();
      if (!label || label === target) return;

      if (currentTabs.some((t) => t.id !== target && t.id.toLowerCase() === label.toLowerCase())) {
        let n = 2;
        while (currentTabs.some((t) => t.id.toLowerCase() === `${label} ${n}`.toLowerCase())) n++;
        label = `${label} ${n}`;
      }

      const newTabs = currentTabs.map((t) => (t.id === target ? { id: label, label } : t));
      tabsRef.current = newTabs;
      setTabs(newTabs);

      if (activeTabId === target) setActiveTabId(label);

      setFields((prev) => {
        const fallback = currentTabs[0]?.id || DEFAULT_TAB_LABEL;
        const next = prev.map((f) => {
          const currentTab = (f.tab || '').trim() || fallback;
          if (currentTab.toLowerCase() === target.toLowerCase() || currentTab === target) {
            return { ...f, tab: label };
          }
          return f;
        });
        notifyChange(next);
        return next;
      });
    } finally {
      isCommittingRef.current = false;
    }
  };

  const addTab = () => {
    let n = tabs.length + 1;
    let label = `Pestaña ${n}`;
    while (tabs.some((t) => t.id === label)) {
      n++;
      label = `Pestaña ${n}`;
    }
    const newTabs = [...tabs, { id: label, label }];
    tabsRef.current = newTabs;
    setTabs(newTabs);
    setActiveTabId(label);
    notifyChange(fields);
  };

  const moveTab = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= tabs.length) return;
    const newTabs = arrayMove(tabs, idx, target);
    tabsRef.current = newTabs;
    setTabs(newTabs);
    notifyChange(fields);
  };

  const deleteTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== tabId);
    const survivor = remaining[0];
    tabsRef.current = remaining;
    setTabs(remaining);
    if (activeTabId === tabId) setActiveTabId(survivor.id);
    setFields((prev) => {
      const fallback = tabsRef.current[0]?.id || DEFAULT_TAB_LABEL;
      const next = prev.map((f) => {
        const currentTab = (f.tab || '').trim() || fallback;
        if (currentTab.toLowerCase() === tabId.toLowerCase() || currentTab === tabId) {
          return { ...f, tab: survivor.id };
        }
        return f;
      });
      notifyChange(next);
      return next;
    });
  };

  const addSection = () => {
    setFields((prev) => {
      const fallback = tabsRef.current[0]?.id || DEFAULT_TAB_LABEL;
      const existing = new Set(
        prev
          .filter((f) => f.isSectionDivider && entryTab(f, fallback) === activeTabId)
          .map((f) => (f.title || '').trim())
      );
      let n = 1;
      let title = 'Nueva Sección';
      while (existing.has(title)) {
        n += 1;
        title = `Nueva Sección ${n}`;
      }
      const newFields: SchemaField[] = [
        ...prev,
        {
          id: generateSectionId(),
          keyName: '',
          title,
          type: 'section',
          required: false,
          isSectionDivider: true,
          tab: activeTabId,
        },
      ];
      notifyChange(newFields);
      return newFields;
    });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 border rounded-md p-4 bg-muted/10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{t('schema.title')}</h4>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {t('schema.description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {showPreview ? t('schema.hidePreview') : t('schema.showPreview')}
            </Button>
            <Button type="button" onClick={addField} variant="secondary" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('schema.addAttribute')}
            </Button>
          </div>
        </div>

        {hasErrors && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-md">
            <AlertCircle className="h-4 w-4" />
            <span>{t('schema.fieldsWithErrors')}</span>
          </div>
        )}

        {/* Tab management bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('schema.formTabs')}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={addTab}>
              <Plus className="h-4 w-4 mr-1" />
              {t('schema.addTab')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
            {tabs.map((tab, idx) => {
              const isActive = tab.id === activeTabId;
              const isEditing = editingTabId === tab.id;
              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                      : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  }`}
                >
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          commitRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          e.stopPropagation();
                          renameCanceledRef.current = true;
                          setEditingTabId(null);
                        }
                      }}
                      className="h-6 w-32 border-none bg-transparent px-1 text-xs focus-visible:ring-1"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTabId(tab.id)}
                      onDoubleClick={() => startRename(tab)}
                      className="flex items-center gap-1.5 px-0.5 py-0.5"
                      title={t('schema.tabRenameHint', { label: tab.label })}
                    >
                      <span className="font-medium">{tab.label}</span>
                      <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                        {tabCounts[tab.id] ?? 0}
                      </Badge>
                    </button>
                  )}
                  {isActive && !isEditing && (
                    <span className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => startRename(tab)}
                        title={t('schema.renameTab')}
                        className="rounded p-0.5 hover:bg-background/60"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveTab(idx, -1)}
                          title={t('schema.moveLeft')}
                          className="rounded p-0.5 hover:bg-background/60"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {idx < tabs.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveTab(idx, 1)}
                          title={t('schema.moveRight')}
                          className="rounded p-0.5 hover:bg-background/60"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {tabs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => deleteTab(tab.id)}
                          title={t('schema.deleteTab')}
                          className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FIELD_TYPE_OPTIONS.map((opt) => (
            <Tooltip key={opt.value}>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help text-xs font-normal">
                  {t(opt.labelKey)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">{t(opt.helpKey)}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* List toolbar for the active tab */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {t('schema.attributesIn')}{' '}
            <span className="font-medium text-foreground">{activeTabId}</span>
            {' · '}
            {t('schema.fieldsCount', { count: visibleFields.filter((f) => !f.isSectionDivider).length })}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={addSection}>
            <PanelLeft className="h-4 w-4 mr-2" />
            {t('schema.addSection')}
          </Button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {visibleFields.map((field) => (
                <SortableField
                  key={field.id}
                  field={field}
                  allFields={fields}
                  onUpdate={updateField}
                  onDelete={deleteField}
                  catalogs={catalogs}
                  validation={getValidation(field)}
                  showPreview={showPreview}
                  availableTabs={tabs}
                  activeTabId={activeTabId}
                  sectionsForActiveTab={sectionsForActiveTab}
                />
              ))}
              {visibleFields.length === 0 && (
                <div className="text-center p-8 border border-dashed rounded-md text-muted-foreground">
                  {t('schema.emptyTab', { action: t('schema.addAttribute') })}
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </TooltipProvider>
  );
}, (prev, next) => {
  // SchemaBuilder only uses `value` on initial mount to populate state.
  // We don't want it to re-render every time react-hook-form echoes the value back down.
  return prev.onChange === next.onChange;
});
