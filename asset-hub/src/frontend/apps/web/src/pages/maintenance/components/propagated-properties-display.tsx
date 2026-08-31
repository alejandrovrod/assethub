import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assetService } from '@/services/asset.service'
import { employeeService } from '@/services/employee.service'
import { teamService } from '@/services/team.service'
import { incidentService } from '@/services/incident.service'
import { maintenanceOrderService } from '@/services/maintenance-order.service'
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
import { WorkflowTemplateService } from '@/services/workflow-template.service'

interface Props {
  assetId?: string
  workflowTemplateId?: string
  incidentId?: string
  maintenanceOrderId?: string
  propertiesJson: string
  disabled?: boolean
  onUpdate?: (newPropertiesJson: string) => void
  isUpdating?: boolean
  inlineEdit?: boolean
  onChange?: (newPropertiesJson: string) => void
}

export function PropagatedPropertiesDisplay({ assetId, workflowTemplateId, incidentId, maintenanceOrderId, propertiesJson, disabled, onUpdate, isUpdating, inlineEdit, onChange }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<any>({})

  const { data: asset } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => assetService.getAssetById(assetId!),
    enabled: !!assetId
  })

  const { data: incident } = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => incidentService.getById(incidentId!),
    enabled: !!incidentId
  })

  const { data: order } = useQuery({
    queryKey: ['maintenance-order', maintenanceOrderId],
    queryFn: () => maintenanceOrderService.getById(maintenanceOrderId!),
    enabled: !!maintenanceOrderId
  })

  const allWorkflowTemplateIds = useMemo(() => {
    const ids = new Set<string>()
    if (workflowTemplateId) ids.add(workflowTemplateId)
    if (incident?.workflowTemplateId) ids.add(incident.workflowTemplateId)
    if (order?.workflowTemplateId) ids.add(order.workflowTemplateId)
    return Array.from(ids)
  }, [workflowTemplateId, incident?.workflowTemplateId, order?.workflowTemplateId])

  const { data: workflowTemplates } = useQuery({
    queryKey: ['workflow-templates-multiple', allWorkflowTemplateIds],
    queryFn: async () => {
      return await Promise.all(allWorkflowTemplateIds.map(id => WorkflowTemplateService.getById(id)))
    },
    enabled: allWorkflowTemplateIds.length > 0
  })

  const rawSchemaJson = useMemo(() => {
    let combined: any = { type: 'object', properties: {} }
    let hasProperties = false

    if (asset?.schemaJson) {
      try {
        const parsed = JSON.parse(asset.schemaJson)
        if (parsed.properties) {
          for (const key of Object.keys(parsed.properties)) {
            parsed.properties[key]._source = 'asset'
          }
          Object.assign(combined.properties, parsed.properties)
          hasProperties = true
        }
      } catch (e) {}
    }

    if (workflowTemplates) {
      for (const wt of workflowTemplates) {
        if (wt?.schemaJson) {
          try {
            const parsed = JSON.parse(wt.schemaJson)
            if (parsed.properties) {
              for (const key of Object.keys(parsed.properties)) {
                parsed.properties[key]._source = 'workflowTemplate'
              }
              Object.assign(combined.properties, parsed.properties)
              hasProperties = true
            }
          } catch (e) {}
        }
      }
    }

    return hasProperties ? JSON.stringify(combined) : ''
  }, [asset?.schemaJson, workflowTemplates])

  const { schema, uiSchema, isResolving } = useResolvedSchema(rawSchemaJson)

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
      const prop = baseSchema.properties[key]
      if (prop._source === 'workflowTemplate' || prop.propagateToWork || (!prop._source && allWorkflowTemplateIds.length > 0)) {
        newSchema.properties[key] = prop
      }
    })
    return newSchema
  }, [schema, allWorkflowTemplateIds.length])

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
        <div className="rjsf-tailwind rjsf-single-column bg-muted/10 p-4 rounded-md border">
          <Form
            schema={subSchema}
            uiSchema={uiSchema}
            validator={validator}
            formData={properties}
            onChange={e => onChange?.(JSON.stringify(e.formData))}
            disabled={disabled}
            tagName="div"
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
              <div className="rjsf-tailwind rjsf-single-column mt-6">
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
