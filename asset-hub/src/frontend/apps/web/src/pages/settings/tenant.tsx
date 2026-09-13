import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { tenantService, TenantSettings, NotificationMapping } from '@/services/tenant.service'
import { communicationTemplateService, CommunicationTemplateSummary } from '@/services/communication-template.service'
import { mediaService } from '@/services/media.service'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getMediaUrl } from '@/lib/api-client'

export default function SettingsTenant() {
  const [activeTab, setActiveTab] = useState('branding')
  const [settings, setSettings] = useState<TenantSettings>({})
  const [loading, setLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const [mappings, setMappings] = useState<NotificationMapping[]>([])
  const [templates, setTemplates] = useState<CommunicationTemplateSummary[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [settingsData, mappingsData, templatesData] = await Promise.all([
        tenantService.getSettings(),
        tenantService.getNotificationMappings(),
        communicationTemplateService.getTemplates({ templateType: 'email' })
      ])
      
      console.log('Templates data:', templatesData)

      setSettings(settingsData)
      setMappings(mappingsData)
      setTemplates(templatesData.items)
    } catch (error) {
      toast.error('No se pudieron cargar las configuraciones del tenant.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSaving(true)
    try {
      await tenantService.updateSettings(settings)
      toast.success('La configuración de marca ha sido actualizada.')
    } catch (error) {
      toast.error('No se pudo guardar la configuración.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await mediaService.uploadMedia(file)
      setSettings((prev) => ({ ...prev, logoUrl: result.url }))
      toast.success('El logo se ha subido correctamente.')
    } catch (error) {
      toast.error('No se pudo subir el logo.')
    } finally {
      setUploading(false)
    }
  }

  const handleMappingChange = async (systemEvent: string, templateId: string) => {
    try {
      if (templateId === 'none') {
        const mapping = mappings.find(m => m.systemEvent === systemEvent)
        if (mapping) {
          await tenantService.deleteNotificationMapping(mapping.id)
          setMappings(prev => prev.filter(m => m.id !== mapping.id))
        }
      } else {
        const result = await tenantService.updateNotificationMapping({
          systemEvent,
          templateId,
          isActive: true
        })
        const newMapping = { id: result.id, systemEvent, templateId, isActive: true }
        
        setMappings(prev => {
          const exists = prev.find(m => m.systemEvent === systemEvent)
          if (exists) {
            return prev.map(m => m.systemEvent === systemEvent ? newMapping : m)
          }
          return [...prev, newMapping]
        })
      }
      toast.success('Regla de notificación actualizada.')
    } catch (error) {
      toast.error('No se pudo actualizar la regla.')
    }
  }

  const getMappingForEvent = (systemEvent: string) => {
    const mapping = mappings.find(m => m.systemEvent === systemEvent)
    return mapping?.templateId || 'none'
  }

  if (loading) {
    return <div className="p-4">Cargando configuración...</div>
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Configuración del Tenant</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="branding">Marca (Branding)</TabsTrigger>
          <TabsTrigger value="notifications">Reglas de Notificación</TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personalización de Marca</CardTitle>
              <CardDescription>
                Configura el logotipo y el correo de soporte que se mostrarán en tus plantillas de correo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="logo">Logo de la Empresa</Label>
                <div className="flex items-center gap-4">
                  {settings.logoUrl && (
                    <img 
                      src={getMediaUrl(settings.logoUrl)} 
                      alt="Logo" 
                      className="h-16 w-16 object-contain rounded border bg-white" 
                    />
                  )}
                  <Input 
                    id="logo" 
                    type="file" 
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="max-w-xs"
                  />
                  {uploading && <span className="text-sm text-muted-foreground">Subiendo...</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Formatos soportados: PNG, JPG, GIF. Máximo 5MB.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supportEmail">Correo Electrónico de Soporte</Label>
                <Input 
                  id="supportEmail" 
                  type="email" 
                  placeholder="soporte@tuempresa.com"
                  value={settings.supportEmail || ''}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="max-w-md"
                />
              </div>

              <Button onClick={handleSaveSettings} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reglas de Notificación</CardTitle>
              <CardDescription>
                Asigna plantillas de comunicación específicas a los eventos del sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Eventos de Incidencias</h4>
                
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>Incidencia Reportada</Label>
                    <p className="text-sm text-muted-foreground">
                      Se dispara cuando un usuario reporta una nueva incidencia.
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Incident.Created')}
                    onValueChange={(val) => handleMappingChange('Incident.Created', val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar plantilla..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Sistema por defecto --</SelectItem>
                      {templates.filter(t => t.entityScope?.toLowerCase() === 'incident').map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>Estado de Incidencia Actualizado</Label>
                    <p className="text-sm text-muted-foreground">
                      Se dispara cuando una incidencia cambia de estado (ej: a Resuelto).
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Incident.StatusChanged')}
                    onValueChange={(val) => handleMappingChange('Incident.StatusChanged', val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar plantilla..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Sin notificación --</SelectItem>
                      {templates.filter(t => t.entityScope?.toLowerCase() === 'incident').map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Eventos de Tareas de Trabajo</h4>
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>Nueva Tarea Asignada</Label>
                    <p className="text-sm text-muted-foreground">
                      Se dispara cuando se crea y asigna una nueva tarea de trabajo.
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Task.Created')}
                    onValueChange={(val) => handleMappingChange('Task.Created', val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar plantilla..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Sistema por defecto --</SelectItem>
                      {templates.filter(t => t.entityScope?.toLowerCase() === 'worktask').map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Eventos de Mantenimiento</h4>
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>Nueva Orden Generada</Label>
                    <p className="text-sm text-muted-foreground">
                      Se dispara cuando se genera una nueva orden de mantenimiento.
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('MaintenanceOrder.Created')}
                    onValueChange={(val) => handleMappingChange('MaintenanceOrder.Created', val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar plantilla..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Sistema por defecto --</SelectItem>
                      {templates.filter(t => t.entityScope?.toLowerCase() === 'maintenanceorder').map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Eventos de Activos</h4>
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>Cambio de Estado (con notificación)</Label>
                    <p className="text-sm text-muted-foreground">
                      Se dispara cuando un activo cambia de estado y tiene configurada una acción de notificación.
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Asset.StateChanged')}
                    onValueChange={(val) => handleMappingChange('Asset.StateChanged', val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar plantilla..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Sistema por defecto --</SelectItem>
                      {templates.filter(t => t.entityScope?.toLowerCase() === 'asset').map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
