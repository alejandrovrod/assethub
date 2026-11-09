// PropagatedPropertiesDisplay.tsx — Sleek mobile-first dynamic properties display and editor
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Pencil,
  Save,
  X,
  Loader2,
  Calendar,
  User,
  Users,
  Tag,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react';
import {
  db,
  buildPropagatedAndResolvedSchema,
  type PropagatedContextIds,
  type ResolvedSchemaResult,
} from '@asset-hub/core-offline';
import { formatDate } from '../../lib/format';

interface PropagatedPropertiesDisplayProps {
  ctx: PropagatedContextIds;
  localPropertiesJson?: string;
  isReadOnly?: boolean;
  onSave?: (propertiesJson: string) => Promise<void>;
}

interface ResolvedDisplayValue {
  key: string;
  title: string;
  rawValue: unknown;
  displayLabel: string;
  kind: 'image' | 'file' | 'employee' | 'team' | 'catalog' | 'date' | 'boolean' | 'text';
  urls?: string[];
  fieldSchema?: any;
  isFieldEditable?: boolean;
}

type CatalogLabelKey =
  | 'propagated.catalogs.project'
  | 'propagated.catalogs.assetType'
  | 'propagated.catalogs.level'
  | 'propagated.catalogs.incidentType'
  | 'propagated.catalogs.activityType'
  | 'propagated.catalogs.logbookType'
  | 'propagated.catalogs.category1'
  | 'propagated.catalogs.category2'
  | 'propagated.catalogs.category3'
  | 'propagated.catalogs.category4'
  | 'propagated.catalogs.category5'
  | 'propagated.catalogs.priority'
  | 'propagated.catalogs.bioRiskLevel'
  | 'propagated.catalogs.cleaningFrequency'
  | 'propagated.catalogs.cleaningSupplies'
  | 'propagated.catalogs.brand'
  | 'propagated.catalogs.sparePartType'
  | 'propagated.catalogs.specialty';

const KNOWN_CATALOGS: Record<string, CatalogLabelKey> = {
  '009': 'propagated.catalogs.project',
  '001': 'propagated.catalogs.assetType',
  '002': 'propagated.catalogs.level',
  '003': 'propagated.catalogs.incidentType',
  '004': 'propagated.catalogs.activityType',
  '005': 'propagated.catalogs.logbookType',
  '015': 'propagated.catalogs.category1',
  '016': 'propagated.catalogs.category2',
  '017': 'propagated.catalogs.category3',
  '018': 'propagated.catalogs.category4',
  '019': 'propagated.catalogs.category5',
  '020': 'propagated.catalogs.priority',
  priority: 'propagated.catalogs.priority',
  BIO_RISK_LEVEL: 'propagated.catalogs.bioRiskLevel',
  CLEANING_FREQUENCY: 'propagated.catalogs.cleaningFrequency',
  CLEANING_SUPPLIES: 'propagated.catalogs.cleaningSupplies',
  'SYS-CAT-MARCAS': 'propagated.catalogs.brand',
  'SYS-CAT-REFACCIONES': 'propagated.catalogs.sparePartType',
  'SYS-CAT-ESPECIALIDADES': 'propagated.catalogs.specialty',
};

export function PropagatedPropertiesDisplay({
  ctx,
  localPropertiesJson,
  isReadOnly = false,
  onSave,
}: PropagatedPropertiesDisplayProps) {
  const { t } = useTranslation(['forms', 'common']);
  const [resolved, setResolved] = useState<ResolvedSchemaResult | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reference dictionaries for offline human-readable label lookup
  const [directoryMap, setDirectoryMap] = useState<Map<string, { name: string; kind: string }>>(new Map());
  const [catalogMap, setCatalogMap] = useState<Map<string, string>>(new Map());
  const [catalogMetaMap, setCatalogMetaMap] = useState<Map<string, { catalogCode: string; label: string }>>(
    new Map()
  );

  // Load directory entries and catalog items from Dexie into lookup maps
  const loadLookups = useCallback(async () => {
    try {
      const [entries, items] = await Promise.all([
        db.directory_entries.toArray(),
        db.catalog_items.toArray(),
      ]);

      const dir = new Map<string, { name: string; kind: string }>();
      for (const e of entries) {
        dir.set(e.id, { name: e.name, kind: e.kind });
      }
      setDirectoryMap(dir);

      const cat = new Map<string, string>();
      const catMeta = new Map<string, { catalogCode: string; label: string }>();
      for (const item of items) {
        if (item.id) {
          cat.set(item.id, item.label);
          catMeta.set(item.id, { catalogCode: item.catalogCode, label: item.label });
        }
        if (item.code) {
          cat.set(item.code, item.label);
          catMeta.set(item.code, { catalogCode: item.catalogCode, label: item.label });
        }
      }
      setCatalogMap(cat);
      setCatalogMetaMap(catMeta);
    } catch {
      // Best effort
    }
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  // Load and resolve schemas
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await buildPropagatedAndResolvedSchema(db, ctx, localPropertiesJson);
        if (!cancelled) {
          setResolved(res);
          setFormData(res.mergedFormData);
        }
      } catch (err) {
        console.error('Failed to resolve propagated schema:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ctx.tenantId, ctx.assetId, ctx.incidentId, ctx.maintenanceOrderId, ctx.workflowTemplateId, localPropertiesJson]);

  // Compute resolved display items for viewing
  const displayItems = useMemo<ResolvedDisplayValue[]>(() => {
    if (!resolved) return [];
    const schemaProps = (resolved.schema?.properties || {}) as Record<string, any>;
    const merged = { ...(resolved.mergedFormData || {}), ...(formData || {}) };

    // Combine keys defined in schema.
    // If schema defines properties, only show keys that belong to the active schema
    // (matching the web app behavior, ignoring orphaned historical JSON properties).
    const schemaKeyList = Object.keys(schemaProps);
    const allKeys = (
      schemaKeyList.length > 0
        ? schemaKeyList
        : Object.keys(merged)
    ).filter((k) => !k.startsWith('_'));

    const rawItems = allKeys.map((key) => {
      const prop = schemaProps[key] || {};
      const rawValue = merged[key];
      const strRaw = typeof rawValue === 'string' ? rawValue : '';
      const matchedCatalogItem = strRaw ? catalogMetaMap.get(strRaw) : undefined;
      const matchedDirectoryEntry = strRaw ? directoryMap.get(strRaw) : undefined;

      // Detect kind
      const isUrl = (val: string) => /^https?:\/\/|^data:image\//i.test(val);
      let kind: ResolvedDisplayValue['kind'] = 'text';
      let urls: string[] = [];

      if (Array.isArray(rawValue)) {
        const strUrls = rawValue.filter((v): v is string => typeof v === 'string' && isUrl(v));
        if (strUrls.length > 0) {
          kind = 'image';
          urls = strUrls;
        }
      } else if (typeof rawValue === 'string' && isUrl(rawValue)) {
        kind = 'image';
        urls = [rawValue];
      } else if (prop.format === 'employee' || key === 'reportar_a' || matchedDirectoryEntry?.kind === 'employee') {
        kind = 'employee';
      } else if (prop.format === 'team' || matchedDirectoryEntry?.kind === 'team') {
        kind = 'team';
      } else if (prop.format === 'date' || prop.type === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(strRaw)) {
        kind = 'date';
      } else if (typeof rawValue === 'boolean') {
        kind = 'boolean';
      } else if (prop.catalogCode || prop.oneOf || matchedCatalogItem) {
        kind = 'catalog';
      }

      // Formulate human-friendly title (never show raw timestamp / numeric ID)
      let title = prop.title;
      const isGenericOrNumeric =
        !title ||
        /^\d+$/.test(title) ||
        /^field_\d+/i.test(title) ||
        /^field_[a-z0-9]+/i.test(title);

      if (isGenericOrNumeric) {
        const catCode = prop.catalogCode || matchedCatalogItem?.catalogCode;
        if (catCode && KNOWN_CATALOGS[catCode]) {
          title = t(KNOWN_CATALOGS[catCode]);
        } else if (catCode) {
          title = t('propagated.catalogFallback', { code: catCode });
        } else if (kind === 'employee') {
          title = t('propagated.reportTo');
        } else if (kind === 'team') {
          title = t('propagated.assignedTeam');
        } else if (kind === 'image') {
          title = t('propagated.images');
        } else if (kind === 'date') {
          title = t('common:fields.date');
        } else {
          const stripped = key.replace(/^field_/i, '').replace(/_/g, ' ');
          title = /^\d+$/.test(stripped) ? t('propagated.additionalField') : stripped;
        }
      }

      // Resolve human-readable display label
      let displayLabel = rawValue !== undefined && rawValue !== null ? String(rawValue) : '—';

      if (kind === 'employee' && strRaw) {
        const found = directoryMap.get(strRaw);
        if (found) displayLabel = found.name;
      } else if (kind === 'team' && strRaw) {
        const found = directoryMap.get(strRaw);
        if (found) displayLabel = found.name;
      } else if (kind === 'catalog') {
        if (matchedCatalogItem?.label) {
          displayLabel = matchedCatalogItem.label;
        } else if (catalogMap.has(strRaw)) {
          displayLabel = catalogMap.get(strRaw)!;
        } else if (prop.oneOf && Array.isArray(prop.oneOf)) {
          const matched = prop.oneOf.find(
            (opt: any) => String(opt.const) === strRaw || String(opt.id) === strRaw
          );
          if (matched?.title) displayLabel = matched.title;
        }
      } else if (kind === 'date' && strRaw) {
        try {
          const d = new Date(strRaw);
          if (!isNaN(d.getTime())) {
            displayLabel = formatDate(d);
          }
        } catch {
          // Keep raw
        }
      } else if (kind === 'boolean') {
        displayLabel = rawValue ? t('common:state.yes') : t('common:state.no');
      }

      // Determine if this property is editable in field execution:
      // 1. Asset properties (_source === 'asset') are NEVER editable in field tasks/orders.
      // 2. Dispatch/ownership fields (asignar_a, reportar_a) are NEVER editable in field tasks/orders.
      // 3. WorkflowTemplate properties are editable ONLY if explicitly marked with `editableInField: true`.
      const isAssetSource = prop._source === 'asset';
      const isDispatchField = key === 'asignar_a' || key === 'reportar_a';
      const isExplicitlyEditable = Boolean(prop.editableInField);
      const isFieldEditable = !isAssetSource && !isDispatchField && isExplicitlyEditable;

      return {
        key,
        title,
        rawValue,
        displayLabel,
        kind,
        urls,
        fieldSchema: prop,
        isFieldEditable,
      };
    });

    // Disambiguate duplicate titles (e.g. Proyecto on Asset vs Proyecto on Task)
    const seenTitles = new Map<string, number>();
    return rawItems.map((item) => {
      const count = seenTitles.get(item.title) ?? 0;
      seenTitles.set(item.title, count + 1);
      if (count > 0) {
        return {
          ...item,
          title: `${item.title} (${count + 1})`,
        };
      }
      return item;
    });
  }, [resolved, formData, directoryMap, catalogMap, catalogMetaMap, t]);

  // Check if at least one field is allowed to be edited in field mode
  // (Always call hooks unconditionally before early returns to satisfy React Rules of Hooks)
  const hasEditableFields = useMemo(() => {
    return displayItems.some((item) => item.isFieldEditable);
  }, [displayItems]);

  const editableDisplayItems = useMemo(() => {
    return displayItems.filter((item) => item.isFieldEditable);
  }, [displayItems]);

  const handleInputChange = (key: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value === '' ? undefined : value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSave) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await onSave(JSON.stringify(formData));
      setStatusMessage({ type: 'success', text: t('propagated.saveSuccess') });
      setIsEditing(false);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('propagated.saveError'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
        {t('propagated.loading')}
      </div>
    );
  }

  if (!resolved || displayItems.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground">
        {t('propagated.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with edit toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('propagated.fieldCount', { count: displayItems.length })}
        </span>

        {!isReadOnly && onSave && hasEditableFields && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(!isEditing);
              setStatusMessage(null);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1 text-xs font-semibold text-foreground shadow-xs hover:bg-muted/50 active:scale-95 transition-all"
          >
            {isEditing ? (
              <>
                <X className="h-3.5 w-3.5 text-muted-foreground" />
                {t('common:actions.cancel')}
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5 text-primary" />
                {t('propagated.editFields')}
              </>
            )}
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-medium ${statusMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 text-destructive'
            }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* VIEW MODE: Sleek unified property inspector */}
      {!isEditing && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
          <div className="divide-y divide-border/40">
            {displayItems.map((item) => (
              <div
                key={item.key}
                className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/20"
              >
                {/* Field Label & Icon */}
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-foreground/70">
                    {item.kind === 'employee' && <User className="h-3.5 w-3.5 text-blue-500" />}
                    {item.kind === 'team' && <Users className="h-3.5 w-3.5 text-purple-500" />}
                    {item.kind === 'catalog' && <Tag className="h-3.5 w-3.5 text-amber-500" />}
                    {item.kind === 'date' && <Calendar className="h-3.5 w-3.5 text-emerald-500" />}
                    {item.kind === 'image' && <ImageIcon className="h-3.5 w-3.5 text-sky-500" />}
                    {item.kind === 'boolean' && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />}
                    {item.kind === 'text' && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <span className="uppercase tracking-wider text-[11px]">{item.title}</span>
                </div>

                {/* Field Value Display */}
                <div className="pl-8 sm:pl-0 text-sm font-medium text-foreground">
                  {item.kind === 'image' && item.urls && item.urls.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {item.urls.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative block h-16 w-16 overflow-hidden rounded-lg border border-border shadow-xs hover:border-primary transition-all"
                        >
                          <img
                            src={url}
                            alt={`${item.title} ${idx + 1}`}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <ExternalLink className="h-3.5 w-3.5 text-white" />
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : item.kind === 'employee' ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-50/60 px-2.5 py-1 text-xs font-semibold text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                        {item.displayLabel.charAt(0).toUpperCase()}
                      </span>
                      <span>{item.displayLabel}</span>
                    </div>
                  ) : item.kind === 'team' ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-50/60 px-2.5 py-1 text-xs font-semibold text-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">
                        {item.displayLabel.charAt(0).toUpperCase()}
                      </span>
                      <span>{item.displayLabel}</span>
                    </div>
                  ) : item.kind === 'catalog' ? (
                    <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      {item.displayLabel}
                    </span>
                  ) : item.kind === 'date' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {item.displayLabel}
                    </span>
                  ) : item.kind === 'boolean' ? (
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${item.rawValue
                          ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'border border-muted bg-muted text-muted-foreground'
                        }`}
                    >
                      {item.displayLabel}
                    </span>
                  ) : (
                    <span
                      className={
                        item.displayLabel === '—'
                          ? 'text-xs text-muted-foreground italic'
                          : 'text-xs font-semibold text-foreground'
                      }
                    >
                      {item.displayLabel}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EDIT MODE: Styled, accessible form inputs */}
      {isEditing && (
        <form onSubmit={handleSave} className="space-y-3.5 pt-1">
          {editableDisplayItems.map((item) => {
            const schema = item.fieldSchema || {};
            const val = formData[item.key] ?? '';

            // 1. Employee select
            if (item.kind === 'employee') {
              const employees = Array.from(directoryMap.entries())
                .filter(([_, e]) => e.kind === 'employee')
                .map(([id, e]) => ({ value: id, label: e.name }));

              return (
                <div key={item.key} className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <User className="h-3 w-3 text-blue-500" />
                    {item.title}
                  </label>
                  <select
                    value={String(val)}
                    onChange={(e) => handleInputChange(item.key, e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">Seleccione un empleado…</option>
                    {employees.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            // 2. Team select
            if (item.kind === 'team') {
              const teams = Array.from(directoryMap.entries())
                .filter(([_, t]) => t.kind === 'team')
                .map(([id, t]) => ({ value: id, label: t.name }));

              return (
                <div key={item.key} className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Users className="h-3 w-3 text-purple-500" />
                    {item.title}
                  </label>
                  <select
                    value={String(val)}
                    onChange={(e) => handleInputChange(item.key, e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">Seleccione un equipo…</option>
                    {teams.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            // 3. Catalog select
            if (item.kind === 'catalog' || schema.oneOf) {
              const options = (schema.oneOf as Array<{ const: any; title: string; id?: string }>) || [];
              return (
                <div key={item.key} className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3 text-amber-500" />
                    {item.title}
                  </label>
                  <select
                    value={String(val)}
                    onChange={(e) => handleInputChange(item.key, e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">Seleccione una opción…</option>
                    {options.map((opt) => (
                      <option key={String(opt.const)} value={opt.const}>
                        {opt.title}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            // 4. Date input
            if (item.kind === 'date') {
              return (
                <div key={item.key} className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-emerald-500" />
                    {item.title}
                  </label>
                  <input
                    type="date"
                    value={String(val)}
                    onChange={(e) => handleInputChange(item.key, e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              );
            }

            // 5. Boolean
            if (item.kind === 'boolean') {
              return (
                <div key={item.key} className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id={`check_${item.key}`}
                    checked={Boolean(val)}
                    onChange={(e) => handleInputChange(item.key, e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <label htmlFor={`check_${item.key}`} className="text-xs font-semibold text-foreground">
                    {item.title}
                  </label>
                </div>
              );
            }

            // 6. Generic Text / Number
            return (
              <div key={item.key} className="space-y-1">
                <label className="text-xs font-semibold text-foreground">{item.title}</label>
                <input
                  type={schema.type === 'number' ? 'number' : 'text'}
                  value={String(val)}
                  onChange={(e) =>
                    handleInputChange(
                      item.key,
                      schema.type === 'number' ? Number(e.target.value) : e.target.value
                    )
                  }
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder={`Ingrese ${item.title.toLowerCase()}…`}
                />
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-input bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Guardar cambios
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
