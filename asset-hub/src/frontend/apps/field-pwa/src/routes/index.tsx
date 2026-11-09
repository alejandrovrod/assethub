// routes/index.tsx — "Mi Jornada" (Work tasks grouped by urgency)
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, AlertTriangle, Clock, Calendar, CheckCircle, AlertCircle, ShieldAlert } from 'lucide-react';
import { STATE_LABELS, SYNC_STATE_LABELS, useTasks } from '../features/tasks/hooks/useTasks';
import type { TaskRecord, SyncState } from '@asset-hub/core-offline';
import { db } from '@asset-hub/core-offline';
import { TaskConflictDialog } from '../shared/components/TaskConflictDialog';
import { formatDate } from '../lib/format';

interface MiJornadaPageProps {
  userId: string;
  tenantId: string;
  employeeId?: string;
  teamIds?: string[];
  onSelectTask: (taskId: string) => void;
  onRefresh?: () => Promise<void>;
}

const SYNC_BADGE_CLASS: Record<SyncState, string> = {
  synced: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  conflict: 'bg-destructive/10 text-destructive',
  blocked: 'bg-orange-500/10 text-orange-700',
  dead: 'bg-red-500/20 text-red-800',
};

export function MiJornadaPage({
  userId,
  tenantId,
  employeeId,
  teamIds,
  onSelectTask,
  onRefresh,
}: MiJornadaPageProps) {
  const { t } = useTranslation('tasks');
  const { groups, isLoading } = useTasks({ tenantId, userId, employeeId, teamIds });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [conflictTask, setConflictTask] = useState<TaskRecord | null>(null);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeTasks =
    groups.rework.length +
    groups.overdue.length +
    groups.today.length +
    groups.upcoming.length;
  const totalTasks = activeTasks + groups.completed.length;
  // Without an employee/user id the repository returns nothing on purpose (it must not leak
  // other people's work), so "no tasks" would be a misleading message.
  const hasActor = Boolean(employeeId || userId);

  return (
    <div className="space-y-4 pb-16">
      {/* Header bar with pull-to-refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('journey.title')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('journey.pending', { count: activeTasks })}
            {groups.completed.length > 0 &&
              ` · ${t('journey.completed', { count: groups.completed.length })}`}
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-muted active:scale-95 disabled:opacity-50"
            aria-label={t('journey.refresh')}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {!hasActor ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
          <p className="font-medium">{t('journey.missingActorTitle')}</p>
          <p className="text-xs">{t('journey.missingActorHint')}</p>
        </div>
      ) : totalTasks === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium">{t('journey.emptyTitle')}</p>
          <p className="text-xs">{t('journey.emptyHint')}</p>
        </div>
      ) : null}

      {/* 0. Conflictos de sincronización (requiere decisión del usuario) */}
      {groups.conflicts.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <h3 className="font-bold">{t('sections.conflicts', { count: groups.conflicts.length })}</h3>
          </div>
          <div className="space-y-2">
            {groups.conflicts.map((task) => (
              <div key={task.id} className="relative">
                <TaskCard task={task} onSelect={() => setConflictTask(task)} />
                <button
                  onClick={() => setConflictTask(task)}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-destructive/15 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/25 transition-colors"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {t('card.resolveConflict')}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 1. Tareas Devueltas / Rework (prioridad máxima con motivo) */}
      {groups.rework.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <h3 className="font-bold">{t('sections.rework', { count: groups.rework.length })}</h3>
          </div>
          <div className="space-y-2">
            {groups.rework.map((task) => (
              <TaskCard key={task.id} task={task} onSelect={onSelectTask} isRework />
            ))}
          </div>
        </section>
      )}

      {/* 2. Vencidas (Overdue) */}
      {groups.overdue.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-semibold">{t('sections.overdue', { count: groups.overdue.length })}</h3>
          </div>
          <div className="space-y-2">
            {groups.overdue.map((task) => (
              <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
            ))}
          </div>
        </section>
      )}

      {/* 3. Para Hoy (Today) */}
      {groups.today.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Clock className="h-5 w-5" />
            <h3 className="font-semibold">{t('sections.today', { count: groups.today.length })}</h3>
          </div>
          <div className="space-y-2">
            {groups.today.map((task) => (
              <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
            ))}
          </div>
        </section>
      )}

      {/* 4. Próximas (Upcoming) */}
      {groups.upcoming.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-5 w-5" />
            <h3 className="font-semibold">{t('sections.upcoming', { count: groups.upcoming.length })}</h3>
          </div>
          <div className="space-y-2">
            {groups.upcoming.map((task) => (
              <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
            ))}
          </div>
        </section>
      )}

      {/* 5. Terminadas — history, kept apart so it never hides the real workload */}
      {groups.completed.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-500">
            <CheckCircle className="h-5 w-5" />
            <h3 className="font-semibold">{t('sections.completed', { count: groups.completed.length })}</h3>
          </div>
          <div className="space-y-2">
            {groups.completed.map((task) => (
              <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
            ))}
          </div>
        </section>
      )}
      {/* Modal de resolución de conflicto */}
      {conflictTask && (
        <TaskConflictDialog
          task={conflictTask}
          db={db}
          onClose={() => setConflictTask(null)}
          onResolved={() => {
            setConflictTask(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  onSelect,
  isRework,
}: {
  task: TaskRecord;
  onSelect: (taskId: string) => void;
  isRework?: boolean;
}) {
  const { t } = useTranslation('tasks');
  const syncBadgeClass = SYNC_BADGE_CLASS[task.syncState] ?? SYNC_BADGE_CLASS.synced;
  const stateKey = STATE_LABELS[task.state];
  const stateLabel = stateKey ? t(stateKey) : task.state;

  return (
    <div
      onClick={() => onSelect(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(task.id);
      }}
      className={`min-h-[56px] w-full cursor-pointer rounded-xl border p-4 transition-colors hover:bg-muted/50 active:bg-muted ${
        isRework ? 'border-destructive/40 bg-destructive/5' : 'bg-card'
      }`}
    >
      {/* Rework banner if applicable */}
      {isRework && task.reworkReason && (
        <div className="mb-2 rounded-md bg-destructive/15 p-2 text-xs font-medium text-destructive">
          <strong>{t('card.reworkReason')}</strong> {task.reworkReason}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-semibold text-foreground">{task.title}</span>
          {task.assetName && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {task.assetName} {task.assetCode ? `· ${task.assetCode}` : ''}
            </p>
          )}
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {stateLabel}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs">
        <div className="flex items-center gap-2">
          {task.dueAtMs > 0 && (
            <span className="text-muted-foreground">
              {t('card.due', { date: formatDate(task.dueAtMs) })}
            </span>
          )}
          {task.maintenanceOrderTitle && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {t('card.order', { title: task.maintenanceOrderTitle })}
            </span>
          )}
        </div>

        <span className={`rounded-full px-2 py-0.5 font-medium ${syncBadgeClass}`}>
          {t(SYNC_STATE_LABELS[task.syncState])}
        </span>
      </div>
    </div>
  );
}

