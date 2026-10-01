import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('assets')
  const options = useMemo(() => {
    if (field.type !== 'enum') return []
    return (field.enumOptions || '').split(',').map((s) => s.trim()).filter(Boolean)
  }, [field.type, field.enumOptions])

  const label = field.title || field.keyName || t('preview.unnamedField')

  const renderControl = () => {
    switch (field.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch id={`preview-${field.keyName}`} />
            <Label htmlFor={`preview-${field.keyName}`} className="text-sm text-muted-foreground">
              {t('preview.yesNo')}
            </Label>
          </div>
        )
      case 'date':
        return <Input type="date" placeholder={t('preview.datePlaceholder')} disabled />
      case 'number':
        return <Input type="number" placeholder="0" disabled />
      case 'enum':
        return (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder={options.length ? t('preview.selectPlaceholder') : t('preview.noOptions')} />
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
              <SelectValue placeholder={t('preview.selectFromCatalog', { catalog: field.catalogCode || t('preview.catalogFallback') })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="preview">{t('preview.previewLabel')}</SelectItem>
            </SelectContent>
          </Select>
        )
      case 'employee':
        return (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder={t('preview.searchEmployee')} />
            </SelectTrigger>
          </Select>
        )
      case 'team':
        return (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder={t('preview.searchTeam')} />
            </SelectTrigger>
          </Select>
        )
      case 'file':
        return <Input type="file" disabled />
      case 'files':
        return <Input type="file" multiple disabled />
      case 'string':
      default:
        return <Input placeholder={t('preview.freeText')} disabled />
    }
  }

  return (
    <div className="border rounded-md p-3 bg-background/50">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-medium">{label}</Label>
        {field.required && (
          <span className="text-xs text-destructive font-medium">{t('preview.required')}</span>
        )}
      </div>
      {renderControl()}
    </div>
  )
}
