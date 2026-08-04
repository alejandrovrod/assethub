import React, { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

interface SchemaField {
  id: string; // React key, immutable
  keyName: string; // The editable JSON property key
  title: string;
  type: string;
  required: boolean;
}

interface SchemaBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

function SortableField({ 
  field, 
  onUpdate, 
  onDelete 
}: { 
  field: SchemaField, 
  onUpdate: (id: string, updates: Partial<SchemaField>) => void,
  onDelete: (id: string) => void 
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-card border rounded-md mb-2 shadow-sm">
      <div {...attributes} {...listeners} tabIndex={-1} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-5 w-5" />
      </div>
      
      <div className="flex-1 grid grid-cols-12 gap-3 items-center">
        <div className="col-span-3">
          <Input 
            value={field.keyName} 
            onChange={(e) => onUpdate(field.id, { keyName: e.target.value })} 
            placeholder="Clave (ej: marca)" 
            className="font-mono text-sm"
          />
        </div>
        <div className="col-span-4">
          <Input 
            value={field.title} 
            onChange={(e) => onUpdate(field.id, { title: e.target.value })} 
            placeholder="Etiqueta visible" 
          />
        </div>
        <div className="col-span-3">
          <Select 
            value={field.type} 
            onValueChange={(val) => onUpdate(field.id, { type: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">Texto</SelectItem>
              <SelectItem value="number">Número</SelectItem>
              <SelectItem value="boolean">Verdadero/Falso</SelectItem>
              <SelectItem value="date">Fecha</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox 
              checked={field.required} 
              onCheckedChange={(c) => onUpdate(field.id, { required: !!c })} 
              id={`req-${field.id}`}
            />
            <label htmlFor={`req-${field.id}`} className="text-sm font-medium leading-none cursor-pointer">
              Req.
            </label>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(field.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SchemaBuilder({ value, onChange }: SchemaBuilderProps) {
  const [fields, setFields] = useState<SchemaField[]>([]);

  useEffect(() => {
    try {
      if (value) {
        const schema = JSON.parse(value);
        if (schema.type === 'object' && schema.properties) {
          const loadedFields: SchemaField[] = Object.keys(schema.properties).map((key) => {
            const prop = schema.properties[key];
            return {
              id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              keyName: key,
              title: prop.title || key,
              type: prop.type || 'string',
              required: schema.required?.includes(key) || false,
            };
          });
          setFields(loadedFields);
        }
      }
    } catch (e) {
      console.error('Error parsing schema JSON', e);
    }
  }, []); // Run only once

  const notifyChange = (newFields: SchemaField[]) => {
    const schema = {
      type: 'object',
      properties: {} as Record<string, any>,
      required: [] as string[],
    };

    newFields.forEach(f => {
      // Avoid empty keys
      const key = f.keyName.trim() || 'unnamed_field';
      schema.properties[key] = {
        type: f.type,
        title: f.title,
      };
      if (f.required) {
        schema.required.push(key);
      }
    });

    if (schema.required.length === 0) {
      delete (schema as any).required;
    }

    onChange(JSON.stringify(schema, null, 2));
  };

  const pointerSensor = useSensor(PointerSensor);
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  
  const sensors = useSensors(pointerSensor, keyboardSensor);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        notifyChange(newArray);
        return newArray;
      });
    }
  };

  const addField = () => {
    const newId = `field_${Date.now()}`;
    const newFields = [...fields, { id: newId, keyName: newId, title: 'Nuevo Atributo', type: 'string', required: false }];
    setFields(newFields);
    notifyChange(newFields);
  };

  const updateField = (id: string, updates: Partial<SchemaField>) => {
    const newFields = fields.map(f => f.id === id ? { ...f, ...updates } : f);
    setFields(newFields);
    notifyChange(newFields);
  };

  const deleteField = (id: string) => {
    const newFields = fields.filter(f => f.id !== id);
    setFields(newFields);
    notifyChange(newFields);
  };

  return (
    <div className="flex flex-col gap-4 border rounded-md p-4 bg-muted/10">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm text-muted-foreground">
          Arrastrá los campos para reordenarlos. Configurá el tipo de dato y si es obligatorio para el usuario.
        </p>
        <Button type="button" onClick={addField} variant="secondary" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Atributo
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {fields.map((field) => (
              <SortableField 
                key={field.id} 
                field={field} 
                onUpdate={updateField} 
                onDelete={deleteField} 
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
  );
}
