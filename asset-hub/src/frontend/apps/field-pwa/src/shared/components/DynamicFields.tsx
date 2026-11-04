// DynamicFields.tsx — Render template-based dynamic fields from schemaJson + propertiesJson
import { useMemo } from 'react';

interface SchemaField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

interface Props {
  schemaJson?: string;
  propertiesJson?: string;
  className?: string;
}

export function DynamicFields({ schemaJson, propertiesJson, className }: Props) {
  const fields = useMemo<SchemaField[]>(() => {
    if (!schemaJson) return [];
    try {
      const schema = JSON.parse(schemaJson);
      if (Array.isArray(schema.fields)) return schema.fields;
      if (schema.properties) {
        return Object.keys(schema.properties).map((key) => ({
          key,
          label: schema.properties[key]?.title ?? key,
          type: schema.properties[key]?.type ?? 'string',
          required: schema.required?.includes(key),
        }));
      }
      return [];
    } catch {
      return [];
    }
  }, [schemaJson]);

  const values = useMemo<Record<string, unknown>>(() => {
    if (!propertiesJson) return {};
    try {
      return JSON.parse(propertiesJson);
    } catch {
      return {};
    }
  }, [propertiesJson]);

  if (fields.length === 0 && Object.keys(values).length === 0) return null;

  // If no schema, just show raw key-value pairs
  if (fields.length === 0) {
    return (
      <div className={`space-y-0.5 text-xs text-muted-foreground ${className ?? ''}`}>
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="flex gap-1">
            <span className="font-medium">{key}:</span>
            <span>{String(value)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-0.5 text-xs ${className ?? ''}`}>
      {fields.map((field) => (
        <div key={field.key} className="flex gap-1 text-muted-foreground">
          <span className="font-medium">
            {field.label}
            {field.required && <span className="text-destructive">*</span>}:
          </span>
          <span className="text-foreground">
            {values[field.key] !== undefined ? String(values[field.key]) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
