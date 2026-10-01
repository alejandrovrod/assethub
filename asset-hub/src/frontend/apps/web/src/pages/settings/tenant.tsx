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
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'

export default function SettingsTenant() {
  const { can } = usePermissions()
  const canWrite = can('tenant:write')
  const { t } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')
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
      toast.error(t('tenant.toast.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSaving(true)
    try {
      await tenantService.updateSettings(settings)
      toast.success(t('tenant.toast.brandSaved'))
    } catch (error) {
      toast.error(t('tenant.toast.saveError'))
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
      toast.success(t('tenant.toast.logoUploaded'))
    } catch (error) {
      toast.error(t('tenant.toast.logoUploadError'))
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
      toast.success(t('tenant.toast.mappingUpdated'))
    } catch (error) {
      toast.error(t('tenant.toast.mappingUpdateError'))
    }
  }

  const getMappingForEvent = (systemEvent: string) => {
    const mapping = mappings.find(m => m.systemEvent === systemEvent)
    return mapping?.templateId || 'none'
  }

  if (loading) {
    return <div className="p-4">{t('tenant.loading')}</div>
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t('tenant.title')}</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="branding">{t('tenant.tabs.branding')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('tenant.tabs.notifications')}</TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('tenant.branding.title')}</CardTitle>
              <CardDescription>
                {t('tenant.branding.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="logo">{t('tenant.branding.logoLabel')}</Label>
                <div className="flex items-center gap-4">
                  {settings.logoUrl && (
                    <img 
                      src={getMediaUrl(settings.logoUrl)} 
                      alt={t('tenant.branding.logoAlt')} 
                      className="h-16 w-16 object-contain rounded border bg-white" 
                    />
                  )}
                  <Input 
                    id="logo" 
                    type="file" 
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploading || !canWrite}
                    className="max-w-xs"
                  />
                  {uploading && <span className="text-sm text-muted-foreground">{t('tenant.branding.uploading')}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('tenant.branding.formats')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supportEmail">{t('tenant.branding.supportEmailLabel')}</Label>
                <Input 
                  id="supportEmail" 
                  type="email"
                  placeholder={t('tenant.branding.supportEmailPlaceholder')}
                  value={settings.supportEmail || ''}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  disabled={!canWrite}
                  className="max-w-md"
                />
              </div>

              {canWrite && (
                <Button onClick={handleSaveSettings} disabled={isSaving}>
                  {isSaving ? t('tenant.branding.saving') : tCommon('actions.saveChanges')}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('tenant.notifications.title')}</CardTitle>
              <CardDescription>
                {t('tenant.notifications.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t('tenant.notifications.sections.incidents')}</h4>
                
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>{t('tenant.notifications.events.incidentReported.label')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('tenant.notifications.events.incidentReported.description')}
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Incident.Created')}
                    onValueChange={(val) => handleMappingChange('Incident.Created', val)}
                    disabled={!canWrite}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('tenant.notifications.selectTemplate')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('tenant.notifications.defaultSystemOption')}</SelectItem>
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
                    <Label>{t('tenant.notifications.events.incidentStatusChanged.label')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('tenant.notifications.events.incidentStatusChanged.description')}
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Incident.StatusChanged')}
                    onValueChange={(val) => handleMappingChange('Incident.StatusChanged', val)}
                    disabled={!canWrite}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('tenant.notifications.selectTemplate')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('tenant.notifications.noNotificationOption')}</SelectItem>
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
                <h4 className="text-sm font-medium">{t('tenant.notifications.sections.workTasks')}</h4>
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>{t('tenant.notifications.events.taskCreated.label')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('tenant.notifications.events.taskCreated.description')}
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Task.Created')}
                    onValueChange={(val) => handleMappingChange('Task.Created', val)}
                    disabled={!canWrite}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('tenant.notifications.selectTemplate')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('tenant.notifications.defaultSystemOption')}</SelectItem>
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
                <h4 className="text-sm font-medium">{t('tenant.notifications.sections.maintenance')}</h4>
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>{t('tenant.notifications.events.maintenanceOrderCreated.label')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('tenant.notifications.events.maintenanceOrderCreated.description')}
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('MaintenanceOrder.Created')}
                    onValueChange={(val) => handleMappingChange('MaintenanceOrder.Created', val)}
                    disabled={!canWrite}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('tenant.notifications.selectTemplate')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('tenant.notifications.defaultSystemOption')}</SelectItem>
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
                <h4 className="text-sm font-medium">{t('tenant.notifications.sections.assets')}</h4>
                <div className="grid grid-cols-[1fr_300px] items-center gap-4 border p-4 rounded-md">
                  <div>
                    <Label>{t('tenant.notifications.events.assetStateChanged.label')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('tenant.notifications.events.assetStateChanged.description')}
                    </p>
                  </div>
                  <Select 
                    value={getMappingForEvent('Asset.StateChanged')}
                    onValueChange={(val) => handleMappingChange('Asset.StateChanged', val)}
                    disabled={!canWrite}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('tenant.notifications.selectTemplate')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('tenant.notifications.defaultSystemOption')}</SelectItem>
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
