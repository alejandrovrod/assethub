import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { financeService } from '@/services/finance.service'
import { useQuery } from '@tanstack/react-query'
import { FinanceProfileForm } from './FinanceProfileForm'
import { DepreciationScheduleTable } from './DepreciationScheduleTable'
import { DepreciationEntriesTable } from './DepreciationEntriesTable'
import { ValueAdjustmentsTable } from './ValueAdjustmentsTable'
import { DisposalComponent } from './DisposalComponent'
import { CustodyTransfersTimeline } from './CustodyTransfersTimeline'
import { FinanceSummaryCard } from './FinanceSummaryCard'
import { usePermissions } from '@/hooks/use-permissions'
import { Loader2, AlertCircle, Shield } from 'lucide-react'

interface FinanzasTabProps {
  assetId: string
  assetState: string
  onAssetStateChange?: () => void
}

export function FinanzasTab({ assetId, assetState, onAssetStateChange }: FinanzasTabProps) {
  const { can } = usePermissions()
  const canRead = can('assets.finance.read')

  const { data: financeProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['finance-profile', assetId],
    queryFn: () => financeService.getFinanceProfile(assetId),
    enabled: !!assetId,
    staleTime: 30000,
  })

  const isDisposed = assetState === 'Disposed' || assetState === 'Scrapped'
  const hasFinanceBook = !!financeProfile

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">Sin permisos</h3>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Necesitas el permiso <code>assets.finance.read</code> para acceder a esta sección.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Main Tabs */}
      <Tabs defaultValue="profile" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="profile" disabled={isDisposed}>
            Perfil Financiero
          </TabsTrigger>
          <TabsTrigger value="schedule" disabled={isDisposed || !hasFinanceBook}>
            Cronograma
          </TabsTrigger>
          <TabsTrigger value="entries" disabled={isDisposed || !hasFinanceBook}>
            Asientos Devengados
          </TabsTrigger>
          <TabsTrigger value="adjustments" disabled={isDisposed || !hasFinanceBook}>
            Ajustes Valor
          </TabsTrigger>
          <TabsTrigger value="disposal">
            Baja / Desincorp.
          </TabsTrigger>
          <TabsTrigger value="custody">
            Custodias
          </TabsTrigger>
          <TabsTrigger value="summary" disabled={!hasFinanceBook}>
            Resumen
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="profile" className="flex-1 overflow-y-auto p-4">
            {profileLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !hasFinanceBook ? (
              <div className="max-w-2xl mx-auto">
                <FinanceProfileForm
                  assetId={assetId}
                  initialData={null}
                  onClose={() => {}}
                  onSuccess={onAssetStateChange}
                />
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                <FinanceProfileForm
                  assetId={assetId}
                  initialData={financeProfile}
                  onClose={() => {}}
                  onSuccess={onAssetStateChange}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="flex-1 overflow-y-auto p-4">
            {hasFinanceBook ? (
              <DepreciationScheduleTable assetId={assetId} assetState={assetState} />
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="font-medium text-muted-foreground">Sin perfil financiero</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Configura el perfil financiero en la pestaña "Perfil Financiero" para generar el cronograma.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="entries" className="flex-1 overflow-y-auto p-4">
            {hasFinanceBook ? (
              <DepreciationEntriesTable assetId={assetId} />
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="font-medium text-muted-foreground">Sin perfil financiero</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Configura el perfil financiero para devengar cuotas.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="adjustments" className="flex-1 overflow-y-auto p-4">
            {hasFinanceBook ? (
              <ValueAdjustmentsTable assetId={assetId} assetState={assetState} />
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="font-medium text-muted-foreground">Sin perfil financiero</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Configura el perfil financiero para registrar ajustes de valor.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="disposal" className="flex-1 overflow-y-auto p-4">
            <DisposalComponent assetId={assetId} assetState={assetState} onDisposed={onAssetStateChange} />
          </TabsContent>

          <TabsContent value="custody" className="flex-1 overflow-y-auto p-4">
            <CustodyTransfersTimeline assetId={assetId} assetState={assetState} />
          </TabsContent>

          <TabsContent value="summary" className="flex-1 overflow-y-auto p-4">
            {hasFinanceBook ? (
              <div className="max-w-3xl mx-auto space-y-6">
                <FinanceSummaryCard assetId={assetId} assetState={assetState} />
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Configuración Actual</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Método:</span>
                        <span>{financeProfile?.depreciationMethod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Frecuencia:</span>
                        <span>{financeProfile?.frequencyMonths} mes(es)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vida Útil:</span>
                        <span>{financeProfile?.usefulLifeMonths} meses</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Costo Adquisición:</span>
                        <span className="font-medium">{financeProfile?.acquisitionCost?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor Residual:</span>
                        <span className="font-medium">{financeProfile?.residualValue?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Estado del Cronograma</h4>
                    {/* This would need a separate query to get counts */}
                    <p className="text-sm text-muted-foreground">
                      Usa la pestaña "Cronograma" para ver el estado detallado de cada período.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="font-medium text-muted-foreground">Sin perfil financiero configurado</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Ve a la pestaña "Perfil Financiero" para crear la configuración.
                </p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}