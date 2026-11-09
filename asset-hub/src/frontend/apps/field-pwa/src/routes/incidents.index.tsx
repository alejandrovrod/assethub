// incidents.index.tsx — List of incidents
import { useLiveQuery } from 'dexie-react-hooks';
import { db, IncidentRepository, type IncidentSyncState } from '@asset-hub/core-offline';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IncidentDetail } from '../features/incidents/IncidentDetail';
import { formatDateTime } from '../lib/format';

type SyncStateKey =
  | 'syncStates.draft'
  | 'syncStates.pending'
  | 'syncStates.synced'
  | 'syncStates.conflict'
  | 'syncStates.blocked'
  | 'syncStates.dead';

const SYNC_STATE_LABELS = {
  draft: 'syncStates.draft',
  pending: 'syncStates.pending',
  synced: 'syncStates.synced',
  conflict: 'syncStates.conflict',
  blocked: 'syncStates.blocked',
  dead: 'syncStates.dead',
} as const satisfies Record<IncidentSyncState, SyncStateKey>;

interface IncidentsPageProps {
  tenantId?: string;
  employeeId?: string;
  userId?: string;
  teamIds?: string[];
  onNavigateOrder?: (orderId: string) => void;
  onNavigateTask?: (taskId: string) => void;
  onNavigateAssets?: () => void;
}

export function IncidentsPage({
  tenantId,
  employeeId,
  userId,
  teamIds,
  onNavigateOrder,
  onNavigateTask,
  onNavigateAssets,
}: IncidentsPageProps) {
  const { t } = useTranslation(['incidents', 'common']);
  const incidents = useLiveQuery(async () => {
    if (!tenantId) return db.incidents.toArray();
    const repo = new IncidentRepository(db);
    return repo.findForActor({ tenantId, employeeId, userId, teamIds });
  }, [tenantId, employeeId, userId, JSON.stringify(teamIds)]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <IncidentDetail
        incidentId={selectedId}
        onClose={() => setSelectedId(null)}
        onNavigateOrder={onNavigateOrder}
        onNavigateTask={onNavigateTask}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">{t('list.title')}</h2>
          {incidents && incidents.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('list.count', { count: incidents.length })}
            </span>
          )}
        </div>
        {onNavigateAssets && (
          <button
            onClick={onNavigateAssets}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <span>{t('list.reportOnAsset')}</span>
          </button>
        )}
      </div>

      {(!incidents || incidents.length === 0) && (
        <p className="text-muted-foreground">{t('list.empty')}</p>
      )}

      <ul className="space-y-2">
        {incidents?.map((inc) => (
          <li key={inc.id} className="rounded-lg border p-3 cursor-pointer" onClick={() => setSelectedId(inc.id)}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{inc.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                inc.syncState === 'synced' ? 'bg-green-500/10 text-green-600' :
                inc.syncState === 'pending' ? 'bg-amber-500/10 text-amber-600' :
                'bg-red-500/10 text-red-600'
              }`}>
                {t(SYNC_STATE_LABELS[inc.syncState])}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{inc.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(inc.createdAtLocalIso)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
