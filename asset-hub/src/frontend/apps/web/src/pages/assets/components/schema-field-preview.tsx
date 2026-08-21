import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export interface SchemaFieldDefinition {
  keyName: string
  title: string
  type: string
  required: boolean
  enumOptions?: string
  catalogCode?: string
}

interface SchemaFieldPreviewProps {
  field: SchemaFieldDefinition
}

export function SchemaFieldPreview({ field }: SchemaFieldPreviewProps) {
  const options = useMemo(() => {
    if (field.type !== 'enum') return []
    return (field.enumOptions || '').split(',').map((s) => s.trim()).filter(Boolean)
  }, [field.type, field.enumOptions])

  const label = field.title || field.keyName || 'Campo sin nombre'

  const renderControl = () => {
    switch (field.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch id={`preview-${field.keyName}`} />
            <Label htmlFor={`preview-${field.keyName}`} className="text-sm text-muted-foreground">
              Sí / No
            </Label>
          </div>
        )
      case 'date':
        return <Input type="date" placeholder="dd/mm/aaaa" disabled />
      case 'number':
        return <Input type="number" placeholder="0" disabled />
      case 'enum':
        return (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder={options.length ? 'Seleccionar...' : 'Sin opciones'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case 'catalog':
        return (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder={field.catalogCode ? `Catálogo: ${field.catalogCode}` : 'Catálogo no seleccionado'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_placeholder">Opción de catálogo</SelectItem>
            </SelectContent>
          </Select>
        )
      case 'file':
        return <Input type="file" disabled />
      case 'files':
        return <Input type="file" multiple disabled />
      case 'string':
      default:
        return <Input placeholder="Texto libre" disabled />
    }
  }

  return (
    <div className="border rounded-md p-3 bg-background/50">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-medium">{label}</Label>
        {field.required && (
          <span className="text-xs text-destructive font-medium">Obligatorio</span>
        )}
      </div>
      {renderControl()}
    </div>
  )
}
