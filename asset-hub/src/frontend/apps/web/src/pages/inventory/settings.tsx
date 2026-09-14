import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Settings2, Zap, Globe, GitMerge } from 'lucide-react'

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
  label: string
  description: string
  icon: React.ElementType
  badgeClass: string
}[] = [
  {
    value: 'external',
    label: 'Externo',
    description: 'Las órdenes de mantenimiento usan proveedores externos. No se descuenta stock del sistema.',
    icon: Globe,
    badgeClass: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400',
  },
  {
    value: 'internal',
    label: 'Interno',
    description: 'Los repuestos se consumen del inventario propio. El stock se descuenta al registrar partes en las órdenes.',
    icon: Zap,
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  },
  {
    value: 'hybrid',
    label: 'Híbrido',
    description: 'Cada repuesto puede configurarse individualmente como interno o externo por orden.',
    icon: GitMerge,
    badgeClass: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400',
  },
]

export default function InventorySettingsPage() {
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
      toast.success('Configuración de inventario guardada')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.title || 'Error al guardar la configuración')
    },
  })

  const hasChanges = mode !== null || allowNegative !== null

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración de Inventario</h1>
        <p className="text-muted-foreground text-sm">
          Definí cómo opera el módulo de inventario para este tenant.
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
                Modo de operación
              </CardTitle>
              <CardDescription>
                Controla cómo se integra el inventario con las órdenes de mantenimiento.
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
                        <span className="font-medium text-sm">{m.label}</span>
                        {isSelected && (
                          <Badge variant="outline" className={`text-[10px] ${m.badgeClass}`}>
                            Activo
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{m.description}</p>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          {/* Advanced options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opciones avanzadas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="allow-negative" className="font-medium">
                    Permitir stock negativo
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Si está deshabilitado, las transacciones que generarían stock negativo serán rechazadas.
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
                  Descartar cambios
                </Button>
              )}
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || !hasChanges}
              >
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar configuración
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
