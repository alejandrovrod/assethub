// DynamicTemplateForm.tsx — Reusable form renderer for workflow templates in PWA (offline-capable)
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  Users,
  Tag,
  Calendar,
  Image as ImageIcon,
  Camera,
  Trash2,
} from 'lucide-react';
import { db, uuidv7, sha256, type WorkflowTemplateRecord, type MediaQueueItem } from '@asset-hub/core-offline';
import { SearchableSelect } from './SearchableSelect';
import { loadSession } from '../../auth/session-store';
import { uploadMedia } from '../../media/uploader';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5168';

export interface DynamicFormField {
  key: string;
  title: string;
  kind: 'image' | 'employee' | 'team' | 'catalog' | 'date' | 'boolean' | 'text' | 'number';
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  catalogCode?: string;
  schema?: any;
}

interface DynamicTemplateFormProps {
  template: WorkflowTemplateRecord | null;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onPhotosChange?: (photoIds: string[]) => void;
  disabled?: boolean;
}

export function DynamicTemplateForm({
  template,
  values,
  onChange,
  onPhotosChange,
  disabled = false,
}: DynamicTemplateFormProps) {
  const [directoryMap, setDirectoryMap] = useState<Map<string, { name: string; kind: string }>>(new Map());
  const [catalogMap, setCatalogMap] = useState<Map<string, Array<{ code: string; label: string }>>>(new Map());
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activePhotoFieldKey, setActivePhotoFieldKey] = useState<string | null>(null);

  // Load directory entries and catalog items from Dexie
  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const [entries, items] = await Promise.all([
          db.directory_entries.toArray(),
          db.catalog_items.toArray(),
        ]);
        if (!active) return;

        const dir = new Map<string, { name: string; kind: string }>();
        for (const e of entries) {
          dir.set(e.id, { name: e.name, kind: e.kind });
        }
        setDirectoryMap(dir);

        const cats = new Map<string, Array<{ code: string; label: string }>>();
        for (const item of items) {
          const code = item.catalogCode || 'default';
          const list = cats.get(code) || [];
          list.push({ code: item.code || item.id, label: item.label });
          cats.set(code, list);
        }
        setCatalogMap(cats);
      } catch {
        // Dexie load failed silently
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, []);

  // Parse schema properties from template
  const parsedFields = useMemo<DynamicFormField[]>(() => {
    if (!template?.schemaJson) return [];
    try {
      const parsed = typeof template.schemaJson === 'string'
        ? JSON.parse(template.schemaJson)
        : template.schemaJson;

      const props = (parsed?.properties || {}) as Record<string, any>;
      const requiredList = Array.isArray(parsed?.required) ? parsed.required : [];

      return Object.entries(props).map(([key, schema]) => {
        let kind: DynamicFormField['kind'] = 'text';

        const isEmployeeKey = key === 'reportar_a' || key === 'asignar_a' || key.toLowerCase().includes('employee');
        const isEmployeeFormat = schema.format === 'employee' || schema['x-format'] === 'employee';

        if (isEmployeeKey || isEmployeeFormat) {
          kind = 'employee';
        } else if (schema.format === 'team' || schema['x-format'] === 'team') {
          kind = 'team';
        } else if (schema.type === 'array' && (schema.items?.format === 'data-url' || schema.items?.format === 'uri' || key.toLowerCase().includes('image') || key.toLowerCase().includes('foto'))) {
          kind = 'image';
        } else if (schema.catalogCode || schema['x-catalog']) {
          kind = 'catalog';
        } else if (schema.format === 'date' || schema.format === 'date-time') {
          kind = 'date';
        } else if (schema.type === 'boolean') {
          kind = 'boolean';
        } else if (schema.type === 'number' || schema.type === 'integer') {
          kind = 'number';
        } else if (schema.enum && Array.isArray(schema.enum)) {
          kind = 'catalog';
        }

        let options: Array<{ value: string; label: string }> | undefined;
        if (schema.enum && Array.isArray(schema.enum)) {
          options = schema.enum.map((opt: string) => ({ value: opt, label: opt }));
        } else if (schema.oneOf && Array.isArray(schema.oneOf)) {
          options = schema.oneOf.map((opt: any) => ({
            value: String(opt.const ?? opt.value ?? ''),
            label: String(opt.title ?? opt.label ?? opt.const ?? ''),
          }));
        }

        return {
          key,
          title: schema.title || key,
          kind,
          required: requiredList.includes(key),
          options,
          catalogCode: schema.catalogCode || schema['x-catalog'],
          schema,
        };
      });
    } catch {
      return [];
    }
  }, [template]);

  // Handle Photo selection from camera / gallery
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activePhotoFieldKey) return;

    const file = files[0];
    const fieldKey = activePhotoFieldKey;

    // Generar vista previa inmediata en el UI
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreviews((prev) => ({
      ...prev,
      [fieldKey]: [...(prev[fieldKey] || (Array.isArray(values[fieldKey]) ? values[fieldKey] : [])), previewUrl],
    }));

    try {
      const hash = await sha256(file);
      const session = await loadSession();
      const tenantId = session?.tenantSlug ?? '';

      // Si tenemos conexión y token, intentamos subir de inmediato al servidor de la API
      if (navigator.onLine && session?.accessToken) {
        try {
          const uploadRes = await uploadMedia(
            db,
            file,
            tenantId,
            'incident',
            uuidv7(),
            'incident_photo',
            API_BASE,
            session.accessToken
          );

          if (uploadRes.remoteUrl) {
            const currentList = Array.isArray(values[fieldKey]) ? [...values[fieldKey]] : [];
            const updatedList = [...currentList, uploadRes.remoteUrl];
            onChange(fieldKey, updatedList);
            if (onPhotosChange) {
              onPhotosChange([uploadRes.mediaId]);
            }
            return;
          }
        } catch (uploadErr) {
          console.warn('Direct upload failed, fallback to offline queue:', uploadErr);
        }
      }

      // Si estamos offline o falló la subida inmediata, encolamos en media_queue
      const existing = await db.media_queue.where('sha256').equals(hash).first();
      let photoId = existing?.id;
      if (!existing) {
        photoId = uuidv7();
        const mediaItem: MediaQueueItem = {
          id: photoId,
          tenantId,
          ownerType: 'incident',
          ownerId: photoId,
          purpose: 'incident_photo',
          blob: file,
          mimeType: file.type || 'image/jpeg',
          bytes: file.size,
          sha256: hash,
          status: 'pending',
          attempts: 0,
          nextAttemptAtMs: 0,
          createdAtMs: Date.now(),
        };
        await db.media_queue.put(mediaItem);
      }

      const mediaToken = `media://${photoId}`;
      const currentList = Array.isArray(values[fieldKey]) ? [...values[fieldKey]] : [];
      const updatedList = [...currentList, mediaToken];
      onChange(fieldKey, updatedList);

      if (onPhotosChange && photoId) {
        onPhotosChange([photoId]);
      }
    } catch (err) {
      console.error('Failed to process photo:', err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (fieldKey: string, indexToRemove: number) => {
    const currentList = Array.isArray(values[fieldKey]) ? [...values[fieldKey]] : [];
    const updatedList = currentList.filter((_, idx) => idx !== indexToRemove);
    onChange(fieldKey, updatedList);
    setPhotoPreviews((prev) => ({
      ...prev,
      [fieldKey]: updatedList,
    }));
  };

  if (!template || parsedFields.length === 0) {
    return null;
  }

  const employees = Array.from(directoryMap.entries())
    .filter(([_, e]) => e.kind === 'employee')
    .map(([id, e]) => ({ value: id, label: e.name }));

  const teams = Array.from(directoryMap.entries())
    .filter(([_, t]) => t.kind === 'team')
    .map(([id, t]) => ({ value: id, label: t.name }));

  return (
    <div className="space-y-3.5 rounded-xl border border-border/60 bg-muted/20 p-3.5 my-2">
      <div className="flex items-center gap-1.5 pb-1 border-b border-border/40 text-xs font-semibold text-foreground/80">
        <span>Campos de la plantilla</span>
        <span className="text-[11px] font-normal text-muted-foreground">({template.name})</span>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment"
        onChange={handlePhotoSelect}
        className="hidden"
      />

      {parsedFields.map((field) => {
        const val = values[field.key] ?? '';

        // 1. Employee picker
        if (field.kind === 'employee') {
          return (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-500" />
                  {field.title}
                </span>
                {field.required && <span className="text-[10px] text-destructive">* Requerido</span>}
              </label>
              <SearchableSelect
                disabled={disabled}
                value={String(val)}
                onChange={(next) => onChange(field.key, next)}
                required={field.required}
                options={employees}
                placeholder="Seleccione un empleado…"
                searchPlaceholder="Buscar empleado..."
                icon={<User className="h-3.5 w-3.5" />}
              />
            </div>
          );
        }

        // 2. Team picker
        if (field.kind === 'team') {
          return (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-purple-500" />
                  {field.title}
                </span>
                {field.required && <span className="text-[10px] text-destructive">* Requerido</span>}
              </label>
              <SearchableSelect
                disabled={disabled}
                value={String(val)}
                onChange={(next) => onChange(field.key, next)}
                required={field.required}
                options={teams}
                placeholder="Seleccione un equipo…"
                searchPlaceholder="Buscar equipo..."
                icon={<Users className="h-3.5 w-3.5" />}
              />
            </div>
          );
        }

        // 3. Image upload / camera capture
        if (field.kind === 'image') {
          const rawPhotos = Array.isArray(val) ? val : [];
          const previewList = photoPreviews[field.key] || [];
          const currentPhotos = previewList.length > 0 ? previewList : rawPhotos;
          return (
            <div key={field.key} className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-sky-500" />
                  {field.title}
                </span>
                {field.required && <span className="text-[10px] text-destructive">* Requerido</span>}
              </label>

              {/* Photo Previews */}
              {currentPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {currentPhotos.map((imgUrl, idx) => {
                    const displaySrc = imgUrl.startsWith('/') ? `${API_BASE}${imgUrl}` : imgUrl;
                    return (
                      <div
                        key={idx}
                        className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border shadow-xs bg-muted"
                      >
                        <img
                          src={displaySrc}
                          alt={`Evidencia ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(field.key, idx)}
                            className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-destructive transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons */}
              {!disabled && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActivePhotoFieldKey(field.key);
                      fileInputRef.current?.click();
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-input bg-background/50 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5 text-primary" />
                    <span>Tomar foto o subir evidencia</span>
                  </button>
                </div>
              )}
            </div>
          );
        }

        // 4. Catalog or Enum select
        if (field.kind === 'catalog' || field.options || field.catalogCode) {
          const catItems = field.catalogCode ? catalogMap.get(field.catalogCode) || [] : [];
          const options = field.options || catItems.map((ci) => ({ value: ci.code, label: ci.label }));

          return (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-amber-500" />
                  {field.title}
                </span>
                {field.required && <span className="text-[10px] text-destructive">* Requerido</span>}
              </label>
              <SearchableSelect
                disabled={disabled}
                value={String(val)}
                onChange={(next) => onChange(field.key, next)}
                required={field.required}
                options={options}
                placeholder="Seleccione una opción…"
                searchPlaceholder="Buscar opción..."
                icon={<Tag className="h-3.5 w-3.5" />}
              />
            </div>
          );
        }

        // 5. Date input
        if (field.kind === 'date') {
          return (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                  {field.title}
                </span>
                {field.required && <span className="text-[10px] text-destructive">* Requerido</span>}
              </label>
              <input
                type="date"
                disabled={disabled}
                value={String(val)}
                onChange={(e) => onChange(field.key, e.target.value)}
                required={field.required}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          );
        }

        // 6. Boolean toggle
        if (field.kind === 'boolean') {
          return (
            <div key={field.key} className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id={`field_${field.key}`}
                disabled={disabled}
                checked={Boolean(val)}
                onChange={(e) => onChange(field.key, e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <label htmlFor={`field_${field.key}`} className="text-xs font-semibold text-foreground">
                {field.title}
              </label>
            </div>
          );
        }

        // 7. Generic Text / Number / Multiline
        return (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{field.title}</span>
              {field.required && <span className="text-[10px] text-destructive">* Requerido</span>}
            </label>
            <input
              type={field.kind === 'number' ? 'number' : 'text'}
              disabled={disabled}
              value={String(val)}
              onChange={(e) =>
                onChange(field.key, field.kind === 'number' ? Number(e.target.value) : e.target.value)
              }
              required={field.required}
              placeholder={`Ingrese ${field.title.toLowerCase()}…`}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
        );
      })}
    </div>
  );
}
