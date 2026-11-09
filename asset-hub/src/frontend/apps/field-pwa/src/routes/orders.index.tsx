// orders.index.tsx — Maintenance Orders list reading from Dexie via MaintenanceOrderRepository
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Wrench, CheckCircle2, Clock, AlertTriangle, ShieldCheck, ListTodo } from 'lucide-react';
import {
  db,
  MaintenanceOrderRepository,
  type MaintenanceOrderKind,
  type MaintenanceOrderState,
  type TaskRecord,
  type TaskState,
} from '@asset-hub/core-offline';

interface OrdersPageProps {
  tenantId: string;
  employeeId?: string;
  userId?: string;
  teamIds?: string[];
  onSelectOrder: (orderId: string) => void;
  onSelectTask?: (taskId: string) => void;
}

type OrderStateKey =
  | 'states.draft'
  | 'states.approved'
  | 'states.scheduled'
  | 'states.inProgress'
  | 'states.rescheduled'
  | 'states.done'
  | 'states.verified'
  | 'states.cancelled';

type TaskStateKey =
  | 'taskStates.todo'
  | 'taskStates.rework'
  | 'taskStates.inProgress'
  | 'taskStates.paused'
  | 'taskStates.done'
  | 'taskStates.cancelled';

const TASK_STATE_CONFIG: Record<TaskState, { labelKey: TaskStateKey; className: string }> = {
  todo: { labelKey: 'taskStates.todo', className: 'bg-muted text-muted-foreground' },
  rework: { labelKey: 'taskStates.rework', className: 'bg-destructive/10 text-destructive' },
  in_progress: { labelKey: 'taskStates.inProgress', className: 'bg-amber-500/15 text-amber-700' },
  paused: { labelKey: 'taskStates.paused', className: 'bg-amber-500/10 text-amber-600' },
  done: { labelKey: 'taskStates.done', className: 'bg-emerald-500/10 text-emerald-600' },
  cancelled: { labelKey: 'taskStates.cancelled', className: 'bg-muted text-muted-foreground line-through' },
};

const STATE_CONFIG: Record<
  MaintenanceOrderState,
  { labelKey: OrderStateKey; className: string; icon: React.ReactNode }
> = {
  draft: { labelKey: 'states.draft', className: 'bg-muted text-muted-foreground', icon: <Clock className="h-3 w-3" /> },
  approved: { labelKey: 'states.approved', className: 'bg-blue-500/10 text-blue-600', icon: <Clock className="h-3 w-3" /> },
  scheduled: { labelKey: 'states.scheduled', className: 'bg-indigo-500/10 text-indigo-600', icon: <Clock className="h-3 w-3" /> },
  in_progress: { labelKey: 'states.inProgress', className: 'bg-amber-500/15 text-amber-700 font-bold', icon: <Wrench className="h-3 w-3" /> },
  rescheduled: { labelKey: 'states.rescheduled', className: 'bg-indigo-500/10 text-indigo-600', icon: <Clock className="h-3 w-3" /> },
  done: { labelKey: 'states.done', className: 'bg-emerald-500/10 text-emerald-600', icon: <CheckCircle2 className="h-3 w-3" /> },
  verified: { labelKey: 'states.verified', className: 'bg-purple-500/10 text-purple-600', icon: <ShieldCheck className="h-3 w-3" /> },
  cancelled: { labelKey: 'states.cancelled', className: 'bg-destructive/10 text-destructive', icon: <AlertTriangle className="h-3 w-3" /> },
};

const KIND_LABELS: Record<MaintenanceOrderKind, 'kinds.corrective' | 'kinds.preventive'> = {
  corrective: 'kinds.corrective',
  preventive: 'kinds.preventive',
};

const FILTER_LABELS = {
  all: 'list.filters.all',
  active: 'list.filters.active',
  completed: 'list.filters.completed',
} as const;

export function OrdersPage({
  tenantId,
  employeeId,
  userId,
  teamIds,
  onSelectOrder,
  onSelectTask,
}: OrdersPageProps) {
  const { t } = useTranslation('orders');
  const [filterState, setFilterState] = useState<string>('all');

  const orders = useLiveQuery(async () => {
    const repo = new MaintenanceOrderRepository(db);
    return repo.findForActor({ tenantId, employeeId, userId, teamIds });
  }, [tenantId, employeeId, userId, JSON.stringify(teamIds)]);

  // Tasks grouped by maintenance order — one query, no N+1 against Dexie.
  const tasksByOrder = useLiveQuery(async () => {
    const all = await db.tasks.where('tenantId').equals(tenantId).toArray();
    const map = new Map<string, TaskRecord[]>();
    for (const task of all) {
      if (!task.maintenanceOrderId) continue;
      const list = map.get(task.maintenanceOrderId) ?? [];
      list.push(task);
      map.set(task.maintenanceOrderId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.dueAtMs - b.dueAtMs);
    return map;
  }, [tenantId]);

  if (orders === undefined) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (filterState === 'all') return true;
    if (filterState === 'active') return o.state === 'in_progress' || o.state === 'scheduled';
    if (filterState === 'completed') return o.state === 'done' || o.state === 'verified';
    return o.state === filterState;
  });

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('list.count', { count: orders.length })}
          </p>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
        {(['all', 'active', 'completed'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setFilterState(st)}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              filterState === st
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t(FILTER_LABELS[st])}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-medium">{t('list.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredOrders.map((order) => {
            const stateCfg = STATE_CONFIG[order.state] ?? STATE_CONFIG.draft;
            const orderTasks = tasksByOrder?.get(order.id) ?? [];
            return (
              <div
                key={order.id}
                onClick={() => onSelectOrder(order.id)}
                role="button"
                tabIndex={0}
                aria-label={t('list.openOrder', { title: order.title })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectOrder(order.id);
                }}
                className="cursor-pointer rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-semibold text-foreground">
                      {order.code ? `[${order.code}] ` : ''}
                      {order.title}
                    </span>
                    {order.assetName && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {order.assetName} {order.assetCode ? `· ${order.assetCode}` : ''}
                      </p>
                    )}
                  </div>
                  <span
                    className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${stateCfg.className}`}
                  >
                    {stateCfg.icon}
                    {t(stateCfg.labelKey)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                  <span className="capitalize">{t('fields.type')}: {t(KIND_LABELS[order.kind])}</span>
                  {order.syncState !== 'synced' && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700">
                      {t('list.pendingSync')}
                    </span>
                  )}
                </div>

                {orderTasks.length > 0 && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <ListTodo className="h-3.5 w-3.5" />
                      {t('list.tasks', { count: orderTasks.length })}
                    </div>
                    {orderTasks.map((task) => {
                      const taskCfg = TASK_STATE_CONFIG[task.state] ?? TASK_STATE_CONFIG.todo;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTask?.(task.id);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                        >
                          <span className="truncate">{task.title}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${taskCfg.className}`}
                          >
                            {t(taskCfg.labelKey)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
