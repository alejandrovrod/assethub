// incident-detail.tsx — Incident detail with dynamic template properties, asset card, maintenance order, tasks & state transitions
import { useState, useMemo } from 'react';
import {
  db,
  evaluateWorkflowLifecycle,
  updateIncidentProperties,
  type IncidentSyncState,
} from '@asset-hub/core-offline';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Building2,
  Calendar,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Wrench,
  CheckSquare,
} from 'lucide-react';
import { changeIncidentState } from '../../commands/change-incident-state';
import { PropagatedPropertiesDisplay } from '../../shared/components/PropagatedPropertiesDisplay';
import { formatDate } from '../../lib/format';

interface Props {
  incidentId: string;
  onClose: () => void;
  onNavigateOrder?: (orderId: string) => void;
  onNavigateTask?: (taskId: string) => void;
}

type Severity = 'low' | 'medium' | 'high' | 'critical';
type SeverityKey =
  | 'severity.low'
  | 'severity.medium'
  | 'severity.high'
  | 'severity.critical'
  | 'severity.unknown';

type StateKey =
  | 'states.reported'
  | 'states.open'
  | 'states.triaged'
  | 'states.assigned'
  | 'states.inProgress'
  | 'states.resolved'
  | 'states.closed'
  | 'states.cancelled'
  | 'states.reopened';

type OrderStateKey =
  | 'orderStates.draft'
  | 'orderStates.approved'
  | 'orderStates.scheduled'
  | 'orderStates.inProgress'
  | 'orderStates.done'
  | 'orderStates.rescheduled'
  | 'orderStates.verified'
  | 'orderStates.cancelled';

type TaskStateKey =
  | 'taskStates.todo'
  | 'taskStates.ready'
  | 'taskStates.inProgress'
  | 'taskStates.paused'
  | 'taskStates.done'
  | 'taskStates.verified'
  | 'taskStates.cancelled'
  | 'taskStates.rework';

type SyncStateKey =
  | 'syncStates.draft'
  | 'syncStates.pending'
  | 'syncStates.synced'
  | 'syncStates.conflict'
  | 'syncStates.blocked'
  | 'syncStates.dead';

const STATE_LABELS: Partial<Record<string, StateKey>> = {
  reported: 'states.reported',
  open: 'states.open',
  triaged: 'states.triaged',
  assigned: 'states.assigned',
  in_progress: 'states.inProgress',
  resolved: 'states.resolved',
  closed: 'states.closed',
  cancelled: 'states.cancelled',
  reopened: 'states.reopened',
};

const ORDER_STATE_LABELS: Partial<Record<string, OrderStateKey>> = {
  draft: 'orderStates.draft',
  approved: 'orderStates.approved',
  scheduled: 'orderStates.scheduled',
  in_progress: 'orderStates.inProgress',
  done: 'orderStates.done',
  rescheduled: 'orderStates.rescheduled',
  verified: 'orderStates.verified',
  cancelled: 'orderStates.cancelled',
};

const TASK_STATE_LABELS: Partial<Record<string, TaskStateKey>> = {
  todo: 'taskStates.todo',
  ready: 'taskStates.ready',
  in_progress: 'taskStates.inProgress',
  paused: 'taskStates.paused',
  done: 'taskStates.done',
  verified: 'taskStates.verified',
  cancelled: 'taskStates.cancelled',
  rework: 'taskStates.rework',
};

const SEVERITY_BADGES = {
  low: { key: 'severity.low', bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300' },
  medium: { key: 'severity.medium', bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  high: { key: 'severity.high', bg: 'bg-orange-500/10', text: 'text-orange-700 dark:text-orange-300' },
  critical: { key: 'severity.critical', bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-300' },
} as const satisfies Record<Severity, { key: SeverityKey; bg: string; text: string }>;

const SYNC_STATE_LABELS = {
  draft: 'syncStates.draft',
  pending: 'syncStates.pending',
  synced: 'syncStates.synced',
  conflict: 'syncStates.conflict',
  blocked: 'syncStates.blocked',
  dead: 'syncStates.dead',
} as const satisfies Record<IncidentSyncState, SyncStateKey>;

export function IncidentDetail({ incidentId, onClose, onNavigateOrder, onNavigateTask }: Props) {
  const { t } = useTranslation(['incidents', 'common']);
  const incident = useLiveQuery(() => db.incidents.get(incidentId), [incidentId]);

  const asset = useLiveQuery(
    () => (incident?.assetId ? db.assets.get(incident.assetId) : undefined),
    [incident?.assetId]
  );

  const workflowTemplate = useLiveQuery(
    () =>
      incident?.workflowTemplateId
        ? db.workflow_templates.get(incident.workflowTemplateId)
        : undefined,
    [incident?.workflowTemplateId]
  );

  // Maintenance order linked to this incident (by incident.maintenanceOrderId or reverse index)
  const maintenanceOrder = useLiveQuery(async () => {
    if (!incident) return undefined;
    if (incident.maintenanceOrderId) {
      return db.maintenance_orders.get(incident.maintenanceOrderId);
    }
    // Search in maintenance_orders by incidentId or serverId
    const targetIncidentId = incident.serverId || incident.id;
    return db.maintenance_orders
      .where('incidentId')
      .equals(targetIncidentId)
      .first();
  }, [incident?.id, incident?.serverId, incident?.maintenanceOrderId]);

  // Tasks linked directly to the incident OR to the associated maintenance order
  const tasks = useLiveQuery(async () => {
    if (!incident) return [];
    const targetIncidentId = (incident.serverId || incident.id).toLowerCase();
    const orderId = maintenanceOrder?.id?.toLowerCase() || incident.maintenanceOrderId?.toLowerCase();

    const allTasks = await db.tasks.toArray();
    return allTasks.filter((task) => {
      const matchInc = task.incidentId && task.incidentId.toLowerCase() === targetIncidentId;
      const matchOrd = orderId && task.maintenanceOrderId && task.maintenanceOrderId.toLowerCase() === orderId;
      return matchInc || matchOrd;
    });
  }, [incident?.id, incident?.serverId, incident?.maintenanceOrderId, maintenanceOrder?.id]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transitions: dynamic from WorkflowTemplate if available, otherwise sensible default
  const allowedTransitions = useMemo(() => {
    if (!incident) return [];
    if (workflowTemplate?.lifecycleStatesJson) {
      const { availableTransitions } = evaluateWorkflowLifecycle(
        incident.state || 'reported',
        workflowTemplate.lifecycleStatesJson
      );
      if (availableTransitions.length > 0) return availableTransitions;
    }

    // Default fallback transitions
    const curr = incident.state || 'reported';
    if (curr === 'reported' || curr === 'open') return ['in_progress', 'resolved', 'closed'];
    if (curr === 'in_progress') return ['resolved', 'closed'];
    if (curr === 'resolved') return ['closed'];
    return [];
  }, [incident?.state, workflowTemplate?.lifecycleStatesJson]);

  const stateLabel = (state?: string): string => {
    const key = state ? STATE_LABELS[state] : undefined;
    return key ? t(key) : state ?? '';
  };

  const orderStateLabel = (state: string): string => {
    const key = ORDER_STATE_LABELS[state];
    return key ? t(key) : state;
  };

  const taskStateLabel = (state: string): string => {
    const key = TASK_STATE_LABELS[state];
    return key ? t(key) : state;
  };

  if (!incident) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">{t('detail.notFound')}</p>
      </div>
    );
  }

  const handleTransition = async (targetState: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      await changeIncidentState(db, {
        incidentId: incident.id,
        targetState,
        propertiesJson: incident.propertiesJson,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.transition'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveProperties = async (newPropertiesJson: string) => {
    try {
      await updateIncidentProperties(db, incident.id, newPropertiesJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveProperties'));
    }
  };

  const severityBadge: { key: SeverityKey; bg: string; text: string } =
    SEVERITY_BADGES[incident.severity] ?? {
      key: 'severity.unknown',
      bg: 'bg-muted',
      text: 'text-muted-foreground',
    };

  const currentStateLabel = stateLabel(incident.state) || t('states.reported');

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <h1 className="truncate text-base font-bold text-foreground">
                {incident.title}
              </h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {t('detail.state')}: <span className="font-semibold text-primary">{currentStateLabel}</span>
              </span>
              <span>•</span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  incident.syncState === 'synced'
                    ? 'bg-green-500/10 text-green-700 dark:text-green-300'
                    : incident.syncState === 'pending'
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'bg-red-500/10 text-red-700 dark:text-red-300'
                }`}
              >
                {t(SYNC_STATE_LABELS[incident.syncState])}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-transform"
            aria-label={t('detail.closeAria')}
          >
            ✕
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 space-y-4 p-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* General Description Card */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('detail.descriptionTitle')}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {incident.description || t('detail.noDescription')}
          </p>
        </div>

        {/* Asset and Metadata Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Asset Info Card */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              <span>{t('detail.assetTitle')}</span>
            </div>
            <div className="mt-2">
              <div className="text-sm font-semibold text-foreground">
                {asset?.name || incident.assetName || incident.assetCode || t('detail.unassigned')}
              </div>
              {(asset?.code || incident.assetCode) && (
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {t('detail.code')}: {asset?.code || incident.assetCode}
                </div>
              )}
            </div>
          </div>

          {/* Severity & Date Card */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <span>{t('detail.severityAndDate')}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityBadge.bg} ${severityBadge.text}`}
              >
                {t(severityBadge.key)}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(incident.createdAtLocalIso)}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Template Properties */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('detail.infoTitle')}
              </h2>
              {workflowTemplate?.name && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('detail.templateAttributes', { name: workflowTemplate.name })}
                </p>
              )}
            </div>
          </div>

          <PropagatedPropertiesDisplay
            ctx={{
              tenantId: incident.tenantId ?? 'default',
              incidentId: incident.id,
              assetId: incident.assetId,
              workflowTemplateId: incident.workflowTemplateId,
            }}
            localPropertiesJson={incident.propertiesJson}
            isReadOnly={incident.state === 'resolved' || incident.state === 'closed'}
            onSave={handleSaveProperties}
          />
        </div>

        {/* Associated Maintenance Order Section */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('detail.orderTitle')}
              </h2>
            </div>
          </div>

          {maintenanceOrder ? (
            <div
              onClick={() => onNavigateOrder && onNavigateOrder(maintenanceOrder.id)}
              role="button"
              tabIndex={0}
              className={`flex items-center justify-between rounded-xl border bg-muted/30 p-3.5 transition-all ${
                onNavigateOrder ? 'cursor-pointer hover:bg-muted/60 active:scale-98' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">
                    {maintenanceOrder.title}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    {orderStateLabel(maintenanceOrder.state)}
                  </span>
                  <span>•</span>
                  <span>
                    {t('detail.orderKind', {
                      kind:
                        maintenanceOrder.kind === 'corrective'
                          ? t('orderKinds.corrective')
                          : t('orderKinds.preventive'),
                    })}
                  </span>
                </div>
              </div>
              {onNavigateOrder && (
                <div className="flex items-center gap-1 text-xs font-medium text-primary pl-2">
                  <span>{t('detail.viewOrder')}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {t('detail.noOrder')}
            </div>
          )}
        </div>

        {/* Derived Tasks Section */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tasks && tasks.length > 0
                  ? t('detail.tasksTitleWithCount', { count: tasks.length })
                  : t('detail.tasksTitle')}
              </h2>
            </div>
          </div>

          {!tasks || tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {t('detail.noTasks')}
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onNavigateTask && onNavigateTask(task.id)}
                  role="button"
                  tabIndex={0}
                  className={`flex items-center justify-between rounded-xl border bg-card p-3 transition-colors ${
                    onNavigateTask ? 'cursor-pointer hover:bg-muted/50 active:scale-98' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {taskStateLabel(task.state)}
                      </span>
                      {task.priority && (
                        <span>• {t('detail.priority', { priority: task.priority })}</span>
                      )}
                    </div>
                  </div>
                  {onNavigateTask && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {incident.syncState !== 'synced' && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300">
            {t('detail.pendingSync')}
          </div>
        )}
      </main>

      {/* State Transition Actions Footer */}
      {allowedTransitions.length > 0 && (
        <footer className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur p-4">
          <div className="mx-auto flex max-w-md gap-2">
            {allowedTransitions.map((target) => (
              <button
                key={target}
                onClick={() => handleTransition(target)}
                disabled={isProcessing}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow transition hover:bg-primary/90 active:scale-98 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>{t('detail.changeTo', { state: stateLabel(target) || target })}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-80" />
                  </>
                )}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
