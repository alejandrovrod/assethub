import { Link, useParams } from 'react-router'
import { LayoutDashboard, ChevronRight } from 'lucide-react'

import { ReliabilityMetricsCard } from './components/reliability-metrics-card'
import { TcoBreakdownChart } from './components/tco-breakdown-chart'
import { AssetReliabilityTable } from './components/asset-reliability-table'

export default function DashboardPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const scope = assetId ?? 'global'

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/dashboard" className="flex items-center gap-1 hover:underline">
          <LayoutDashboard className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        {assetId && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{scope === 'global' ? 'Global' : assetId}</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReliabilityMetricsCard assetId={assetId} />
        <TcoBreakdownChart assetId={assetId} />
      </div>

      {!assetId && <AssetReliabilityTable />}
    </div>
  )
}
