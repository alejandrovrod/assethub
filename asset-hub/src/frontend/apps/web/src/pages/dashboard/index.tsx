import { useEffect } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { assetService } from '@/services/asset.service'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'

import { ReliabilityMetricsCard } from './components/reliability-metrics-card'
import { TcoBreakdownChart } from './components/tco-breakdown-chart'
import { AssetReliabilityTable } from './components/asset-reliability-table'

export default function DashboardPage() {
  const { assetId } = useParams<{ assetId: string }>()

  const { data: asset } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => assetService.getAssetById(assetId!),
    enabled: !!assetId,
  })

  const setCustomTitle = useBreadcrumbStore(state => state.setCustomTitle)

  useEffect(() => {
    if (asset?.name) {
      setCustomTitle(asset.name)
    } else if (assetId) {
      setCustomTitle(null)
    }
    return () => setCustomTitle(null)
  }, [asset, assetId, setCustomTitle])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReliabilityMetricsCard assetId={assetId} />
        <TcoBreakdownChart assetId={assetId} />
      </div>

      {!assetId && <AssetReliabilityTable />}
    </div>
  )
}
