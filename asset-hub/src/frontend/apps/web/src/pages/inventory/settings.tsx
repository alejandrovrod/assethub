import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Settings2, Zap, Globe, GitMerge } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { inventoryService, type InventoryOperatingMode } from '@/services/inventory.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { usePermissions } from '@/hooks/use-permissions'

const MODES: {
  value: InventoryOperatingMode
  labelKey:
    | 'settings.modes.external.label'
    | 'settings.modes.internal.label'
    | 'settings.modes.hybrid.label'
  descriptionKey:
    | 'settings.modes.external.description'
    | 'settings.modes.internal.description'
    | 'settings.modes.hybrid.description'
  icon: React.ElementType
  badgeClass: string
}[] = [
  {
    value: 'external',
    labelKey: 'settings.modes.external.label',
    descriptionKey: 'settings.modes.external.description',
    icon: Globe,
    badgeClass: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400',
  },
  {
    value: 'internal',
    labelKey: 'settings.modes.internal.label',
    descriptionKey: 'settings.modes.internal.description',
    icon: Zap,
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  },
  {
    value: 'hybrid',
    labelKey: 'settings.modes.hybrid.label',
    descriptionKey: 'settings.modes.hybrid.description',
    icon: GitMerge,
    badgeClass: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400',
  },
]

export default function InventorySettingsPage() {
  const { t } = useTranslation(['inventory', 'common'])
  const { can } = usePermissions()
  const canConfigure = can('inventory:configure')
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['inventory-settings'],
    queryFn: inventoryService.getSettings,
  })

  const [mode, setMode] = useState<InventoryOperatingMode | null>(null)
  const [allowNegative, setAllowNegative] = useState<boolean | null>(null)

  // Effective values — local overrides first
  const effectiveMode = mode ?? settings?.operatingMode ?? 'external'
  const effectiveNegative = allowNegative ?? settings?.allowNegativeStock ?? false

  const updateMutation = useMutation({
    mutationFn: () =>
      inventoryService.updateSettings({
        operatingMode: effectiveMode,
        allowNegativeStock: effectiveNegative,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-settings'] })
      // Reset local overrides
      setMode(null)
      setAllowNegative(null)
      toast.success(t('settings.toast.saved'))
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.title || t('settings.toast.saveError'))
    },
  })

  const hasChanges = mode !== null || allowNegative !== null

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('settings.subtitle')}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Operating Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                {t('settings.modeSection.title')}
              </CardTitle>
              <CardDescription>
                {t('settings.modeSection.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {MODES.map(m => {
                const Icon = m.icon
                const isSelected = effectiveMode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    disabled={!canConfigure}
                    onClick={() => setMode(m.value)}
                    className={`
                      w-full text-left rounded-lg border p-4 flex items-start gap-4 transition-all
                      hover:border-primary/50
                      ${isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border bg-card'}
                    `}
                  >
                    <div className={`rounded-md p-2 ${isSelected ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{t(m.labelKey)}</span>
                        {isSelected && (
                          <Badge variant="outline" className={`text-[10px] ${m.badgeClass}`}>
                            {t('common:status.active')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{t(m.descriptionKey)}</p>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          {/* Advanced options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('settings.advanced.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="allow-negative" className="font-medium">
                    {t('settings.advanced.allowNegativeLabel')}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('settings.advanced.allowNegativeHint')}
                  </p>
                </div>
                <Switch
                  id="allow-negative"
                  checked={effectiveNegative}
                  onCheckedChange={v => setAllowNegative(v)}
                  disabled={!canConfigure}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          {canConfigure && (
            <div className="flex justify-end gap-2">
              {hasChanges && (
                <Button
                  variant="ghost"
                  onClick={() => { setMode(null); setAllowNegative(null) }}
                >
                  {t('settings.discardChanges')}
                </Button>
              )}
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || !hasChanges}
              >
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('settings.save')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
