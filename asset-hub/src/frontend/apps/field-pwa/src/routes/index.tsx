// routes/index.tsx — "Mi Jornada" (Work tasks grouped by urgency)
import { useState } from 'react';
import { RefreshCw, AlertTriangle, Clock, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { useTasks } from '../features/tasks/hooks/useTasks';
import type { TaskRecord, SyncState } from '@asset-hub/core-offline';

interface MiJornadaPageProps {
  userId: string;
  tenantId: string;
  employeeId?: string;
  teamIds?: string[];
  onSelectTask: (taskId: string) => void;
  onRefresh?: () => Promise<void>;
}

const SYNC_BADGE_CONFIG: Record<
  SyncState,
  { label: string; className: string }
> = {
  synced: { label: 'Sincronizado', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  pending: { label: 'Pendiente', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  conflict: { label: 'Conflicto', className: 'bg-destructive/10 text-destructive' },
  blocked: { label: 'Bloqueado', className: 'bg-orange-500/10 text-orange-700' },
  dead: { label: 'Error fatal', className: 'bg-red-500/20 text-red-800' },
};

export function MiJornadaPage({
  userId,
  tenantId,
  employeeId,
  teamIds,
  onSelectTask,
  onRefresh,
}: MiJornadaPageProps) {
  const { groups, isLoading } = useTasks({ tenantId, userId, employeeId, teamIds });
  const [isRefreshing, setIsRefreshing] = useState(false);

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
          <h2 className="text-xl font-bold tracking-tight">Mi Jornada</h2>
          <p className="text-xs text-muted-foreground">
            {activeTasks} {activeTasks === 1 ? 'tarea pendiente' : 'tareas pendientes'}
            {groups.completed.length > 0 && ` · ${groups.completed.length} terminadas`}
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-muted active:scale-95 disabled:opacity-50"
            aria-label="Refrescar jornada"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {!hasActor ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
          <p className="font-medium">No pudimos identificar tu perfil de empleado</p>
          <p className="text-xs">
            Cierra sesión y vuelve a entrar para vincular tu usuario con un empleado.
          </p>
        </div>
      ) : totalTasks === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium">No tienes tareas asignadas</p>
          <p className="text-xs">Disfruta tu jornada o refresca para sincronizar.</p>
        </div>
      ) : null}

      {/* 1. Tareas Devueltas / Rework (prioridad máxima con motivo) */}
      {groups.rework.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <h3 className="font-bold">Tareas Devueltas ({groups.rework.length})</h3>
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
            <h3 className="font-semibold">Vencidas ({groups.overdue.length})</h3>
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
            <h3 className="font-semibold">Para Hoy ({groups.today.length})</h3>
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
            <h3 className="font-semibold">Próximas ({groups.upcoming.length})</h3>
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
            <h3 className="font-semibold">Terminadas ({groups.completed.length})</h3>
          </div>
          <div className="space-y-2">
            {groups.completed.map((task) => (
              <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
            ))}
          </div>
        </section>
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
  const syncBadge = SYNC_BADGE_CONFIG[task.syncState] ?? SYNC_BADGE_CONFIG.synced;

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
          <strong>Motivo de devolución:</strong> {task.reworkReason}
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
          {task.state}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs">
        <div className="flex items-center gap-2">
          {task.dueAtMs > 0 && (
            <span className="text-muted-foreground">
              Vence: {new Date(task.dueAtMs).toLocaleDateString()}
            </span>
          )}
          {task.maintenanceOrderTitle && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              OT: {task.maintenanceOrderTitle}
            </span>
          )}
        </div>

        <span className={`rounded-full px-2 py-0.5 font-medium ${syncBadge.className}`}>
          {syncBadge.label}
        </span>
      </div>
    </div>
  );
}

