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
import { GripVertical, Plus, Trash2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { SchemaFieldPreview } from './schema-field-preview';

interface SchemaField {
  id: string; // React key, immutable
  keyName: string; // The editable JSON property key
  title: string;
  type: string; // 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'catalog'
  required: boolean;
  enumOptions?: string;
  catalogCode?: string;
  propagateToWork?: boolean;
}

interface SchemaBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

const FIELD_TYPE_OPTIONS = [
  { value: 'string', label: 'Texto', help: 'Cualquier texto libre.' },
  { value: 'number', label: 'Número', help: 'Valores numéricos, enteros o decimales.' },
  { value: 'boolean', label: 'Sí / No', help: 'Interruptor de verdadero/falso.' },
  { value: 'date', label: 'Fecha', help: 'Selector de fecha.' },
  { value: 'enum', label: 'Lista fija', help: 'Opciones predefinidas separadas por coma.' },
  { value: 'catalog', label: 'Catálogo', help: 'Opciones dinámicas tomadas de un catálogo.' },
  { value: 'employee', label: 'Persona / Empleado', help: 'Selección de un empleado del sistema.' },
  { value: 'team', label: 'Grupo / Equipo', help: 'Selección de un equipo del sistema.' },
  { value: 'file', label: 'Archivo / Foto', help: 'Un solo archivo o imagen.' },
  { value: 'files', label: 'Archivos / Fotos', help: 'Varios archivos o imágenes.' },
];

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// FieldTypeHelp removed to improve performance

const SortableField = memo(function SortableField({
  field,
  onUpdate,
  onDelete,
  catalogs,
  validation,
  showPreview,
}: {
  field: SchemaField;
  onUpdate: (id: string, updates: Partial<SchemaField>) => void;
  onDelete: (id: string) => void;
  catalogs: Catalog[];
  validation: { emptyKey: boolean; duplicateKey: boolean; missingConfig: boolean; message?: string };
  showPreview: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

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
              placeholder="Clave (ej: marca)"
              className={`font-mono text-sm ${validation.emptyKey || validation.duplicateKey ? 'border-destructive' : ''}`}
            />
          </div>
          <div className="md:col-span-4">
            <Input
              value={field.title}
              onChange={(e) => onUpdate(field.id, { title: e.target.value })}
              placeholder="Etiqueta visible"
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
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.help}</span>
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
                      Propagar a Órdenes
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    Copia el valor de este campo a la Orden o Tarea al crearse desde el activo.
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
                Obl.
              </Label>
            </div>
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
            placeholder="Opciones separadas por coma (Ej: Rojo, Azul, Verde)"
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
              <SelectValue placeholder="Seleccionar catálogo..." />
            </SelectTrigger>
            <SelectContent>
              {catalogs.length === 0 ? (
                <SelectItem value="none" disabled>
                  No hay catálogos disponibles
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

      {showPreview && (
        <div className="pl-8 pr-12">
          <SchemaFieldPreview
            field={{
              keyName: field.keyName || 'preview',
              title: field.title || 'Vista previa',
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
    prev.validation.emptyKey === next.validation.emptyKey &&
    prev.validation.duplicateKey === next.validation.duplicateKey &&
    prev.validation.missingConfig === next.validation.missingConfig &&
    prev.validation.message === next.validation.message
  );
});

export const SchemaBuilder = memo(function SchemaBuilder({ value, onChange }: SchemaBuilderProps) {
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const { data: catalogs = EMPTY_CATALOGS } = useQuery({
    queryKey: ['catalogs'],
    queryFn: () => catalogService.getCatalogs(),
  });

  useEffect(() => {
    try {
      if (value) {
        const schema = JSON.parse(value);
        if (schema.type === 'object' && schema.properties) {
          const loadedFields: SchemaField[] = Object.keys(schema.properties).map((key) => {
            const prop = schema.properties[key];
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

            return {
              id: generateId(),
              keyName: key,
              title: prop.title || key,
              type,
              required: schema.required?.includes(key) || false,
              enumOptions,
              catalogCode,
              propagateToWork: prop.propagateToWork || false,
            };
          });
          setFields(loadedFields);
        }
      }
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
    const trimmedKey = field.keyName.trim();
    const normalizedKey = trimmedKey.toLowerCase();

    if (!trimmedKey) {
      return { emptyKey: true, duplicateKey: false, missingConfig: false, message: 'La clave no puede estar vacía.' };
    }

    if (keyCounts[normalizedKey] > 1) {
      return { emptyKey: false, duplicateKey: true, missingConfig: false, message: 'Esta clave está repetida.' };
    }

    if (field.type === 'enum') {
      const opts = (field.enumOptions || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        return { emptyKey: false, duplicateKey: false, missingConfig: true, message: 'Agregá al menos una opción.' };
      }
    }

    if (field.type === 'catalog' && !field.catalogCode) {
      return { emptyKey: false, duplicateKey: false, missingConfig: true, message: 'Seleccioná un catálogo.' };
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
      const schema = {
        type: 'object',
        properties: {} as Record<string, any>,
        required: [] as string[],
      };

      newFields.forEach((f) => {
        const key = f.keyName.trim() || 'unnamed_field';
        const propConfig: any = {
          title: f.title,
        };
        
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

        schema.properties[key] = propConfig;

        if (f.required) {
          schema.required.push(key);
        }
      });

      if (schema.required.length === 0) {
        delete (schema as any).required;
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

  // Memoize fieldIds so SortableContext doesn't trigger context updates for all items on every keystroke
  const fieldIdsStr = fields.map((f) => f.id).join(',');
  const fieldIds = useMemo(() => fields.map((f) => f.id), [fieldIdsStr]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        notifyChange(newArray);
        return newArray;
      });
    }
  };

  const addField = useCallback(() => {
    setFields((prev) => {
      const newId = generateId();
      const newFields = [
        ...prev,
        { id: newId, keyName: newId, title: 'Nuevo Atributo', type: 'string', required: false },
      ];
      notifyChange(newFields);
      return newFields;
    });
  }, [notifyChange]);

  const updateField = useCallback((id: string, updates: Partial<SchemaField>) => {
    setFields((prev) => {
      const newFields = prev.map((f) => (f.id === id ? { ...f, ...updates } : f));
      notifyChange(newFields);
      return newFields;
    });
  }, [notifyChange]);

  const deleteField = useCallback((id: string) => {
    setFields((prev) => {
      const newFields = prev.filter((f) => f.id !== id);
      notifyChange(newFields);
      return newFields;
    });
  }, [notifyChange]);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 border rounded-md p-4 bg-muted/10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Atributos de la plantilla</h4>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Definí los campos que tendrán los activos de esta plantilla. Cada campo necesita una
              clave única (usada internamente), una etiqueta visible y un tipo de dato.
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
              {showPreview ? 'Ocultar vista previa' : 'Ver vista previa'}
            </Button>
            <Button type="button" onClick={addField} variant="secondary" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Atributo
            </Button>
          </div>
        </div>

        {hasErrors && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-md">
            <AlertCircle className="h-4 w-4" />
            <span>Hay campos con errores. Corregilos antes de guardar.</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {FIELD_TYPE_OPTIONS.map((opt) => (
            <Tooltip key={opt.value}>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help text-xs font-normal">
                  {opt.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">{opt.help}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {fields.map((field) => (
                <SortableField
                  key={field.id}
                  field={field}
                  onUpdate={updateField}
                  onDelete={deleteField}
                  catalogs={catalogs}
                  validation={getValidation(field)}
                  showPreview={showPreview}
                />
              ))}
              {fields.length === 0 && (
                <div className="text-center p-8 border border-dashed rounded-md text-muted-foreground">
                  No hay atributos personalizados. Hacé clic en "Agregar Atributo" para comenzar.
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
