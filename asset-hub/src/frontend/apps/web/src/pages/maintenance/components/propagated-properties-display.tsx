import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assetService } from '@/services/asset.service'
import { employeeService } from '@/services/employee.service'
import { teamService } from '@/services/team.service'
import { useResolvedSchema } from '@/hooks/use-resolved-schema'
import { FileText, Loader2, Pencil, Save } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import Form from '@rjsf/core'
import { customValidator as validator } from '@/lib/rjsf-validator'
import { FileUploadWidget } from '@/components/widgets/FileUploadWidget'
import { EmployeeSelectWidget } from '@/components/widgets/EmployeeSelectWidget'
import { TeamSelectWidget } from '@/components/widgets/TeamSelectWidget'

interface Props {
  assetId: string
  propertiesJson: string
  disabled?: boolean
  onUpdate?: (newPropertiesJson: string) => void
  isUpdating?: boolean
  inlineEdit?: boolean
  onChange?: (newPropertiesJson: string) => void
}

export function PropagatedPropertiesDisplay({ assetId, propertiesJson, disabled, onUpdate, isUpdating, inlineEdit, onChange }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<any>({})

  const { data: asset } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => assetService.getAssetById(assetId),
    enabled: !!assetId
  })

  const { schema, uiSchema, isResolving } = useResolvedSchema(asset?.schemaJson || '')

  const { data: allEmployees } = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => employeeService.getAll({ pageSize: 1000 }).then(res => res.items)
  })

  const { data: allTeams } = useQuery({
    queryKey: ['teams', 'all'],
    queryFn: () => teamService.getAll({ pageSize: 1000 }).then(res => res.items)
  })

  const properties = useMemo(() => {
    try {
      return JSON.parse(propertiesJson)
    } catch {
      return {}
    }
  }, [propertiesJson])

  const subSchema = useMemo(() => {
    if (!schema || typeof schema !== 'object' || !('properties' in schema)) return null
    const baseSchema = schema as any
    const newSchema: any = { type: 'object', properties: {} }
    Object.keys(baseSchema.properties).forEach(key => {
      if (baseSchema.properties[key].propagateToWork) {
        newSchema.properties[key] = baseSchema.properties[key]
      }
    })
    return newSchema
  }, [schema])

  const handleEditClick = () => {
    setFormData(properties)
    setIsEditing(true)
  }

  const handleSubmit = ({ formData: newFormData }: any) => {
    if (onUpdate) {
      onUpdate(JSON.stringify(newFormData))
      setIsEditing(false)
    }
  }

  if (isResolving) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (Object.keys(properties).length === 0 && !inlineEdit) return null

  if (inlineEdit && subSchema && Object.keys(subSchema.properties).length > 0) {
    return (
      <div className="space-y-3 mt-6">
        <Separator />
        <h4 className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" /> Información Propagada
        </h4>
        <div className="rjsf-tailwind bg-muted/10 p-4 rounded-md border">
          <Form
            schema={subSchema}
            uiSchema={uiSchema}
            validator={validator}
            formData={properties}
            onChange={e => onChange?.(JSON.stringify(e.formData))}
            disabled={disabled}
            widgets={{
              FileWidget: FileUploadWidget,
              EmployeeSelectWidget,
              TeamSelectWidget
            }}
          >
            <></>
          </Form>
        </div>
      </div>
    )
  }

  if (Object.keys(properties).length === 0) return null

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" /> Información Propagada
          </h4>
          {onUpdate && !disabled && (
            <Button variant="ghost" size="sm" onClick={handleEditClick} className="h-8">
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
        </div>
        
        <div className="grid gap-2 text-sm bg-muted/20 p-3 rounded-md border">
          {Object.entries(properties).map(([key, rawValue]) => {
            const fieldSchema = (schema as any)?.properties?.[key]
            const title = fieldSchema?.title || key.replace(/_/g, ' ')
            let displayValue = rawValue

            if (rawValue && fieldSchema?.oneOf && !Array.isArray(rawValue)) {
              const matchedOption = fieldSchema.oneOf.find((opt: any) => opt.const === rawValue)
              if (matchedOption?.title) {
                displayValue = matchedOption.title
              }
            } else if (rawValue && fieldSchema?.type === 'array' && fieldSchema?.items?.oneOf && Array.isArray(rawValue)) {
              displayValue = (rawValue as string[]).map(val => {
                const matchedOption = fieldSchema.items.oneOf.find((opt: any) => opt.const === val)
                return matchedOption?.title || val
              }).join(', ')
            }

            if (fieldSchema?.format === 'employee' && rawValue && allEmployees) {
              const emp = allEmployees.find(e => e.id === rawValue)
              if (emp) displayValue = `${emp.firstName} ${emp.lastName}`
            }

            if (fieldSchema?.format === 'team' && rawValue && allTeams) {
              const team = allTeams.find(t => t.id === rawValue)
              if (team) displayValue = team.name
            }

            return (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{title}</span>
                <span>{displayValue?.toString() || '-'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {subSchema && (
        <Sheet open={isEditing} onOpenChange={setIsEditing}>
          <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-[540px] flex flex-col p-0 h-full">
            <div className="p-6 pb-2 border-b">
              <SheetHeader>
                <SheetTitle>Editar Información Propagada</SheetTitle>
                <SheetDescription>
                  Actualiza los datos adicionales para este registro.
                </SheetDescription>
              </SheetHeader>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <div className="rjsf-tailwind mt-6">
                <Form
                  schema={subSchema}
                  uiSchema={uiSchema}
                  validator={validator}
                  formData={formData}
                  onChange={e => setFormData(e.formData)}
                  onSubmit={handleSubmit}
                  widgets={{
                    FileWidget: FileUploadWidget,
                    EmployeeSelectWidget,
                    TeamSelectWidget
                  }}
                >
                  <div className="flex justify-end mt-6 gap-2 border-t pt-4">
                    <Button variant="outline" type="button" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isUpdating}>
                      {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Save className="mr-2 h-4 w-4" />
                      Guardar Cambios
                    </Button>
                  </div>
                </Form>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
