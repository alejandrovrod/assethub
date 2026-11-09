import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, RefreshCw, X, ShieldAlert, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import type { TaskRecord, FieldDatabase } from '@asset-hub/core-offline';
import { HttpClient, pullTasks, pullOrders } from '@asset-hub/core-offline';
import { loadSession } from '../../auth/session-store';
import { apiFetch } from '../../lib/http';
import { useLanguageStore } from '../../store/language.store';
import { formatTime } from '../../lib/format';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5168';

export interface TaskConflictDialogProps {
  task: TaskRecord;
  db: FieldDatabase;
  onClose: () => void;
  onResolved: () => void;
}

export function TaskConflictDialog({
  task,
  db,
  onClose,
  onResolved,
}: TaskConflictDialogProps) {
  const { t } = useTranslation(['sync', 'common']);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Aceptar versión del servidor
  // Descarta cualquier mutación pendiente sobre esta tarea y sincroniza desde el servidor (rework, etag nuevo)
  const handleAcceptServer = async () => {
    setIsResolving(true);
    setError(null);
    try {
      // Eliminar mutaciones locales pendientes/bloqueadas de la tarea para no reintentar pisar
      await db.outbox_mutations
        .where('aggregateId')
        .equals(task.id)
        .delete();

      // Traer la verdad del servidor
      const session = await loadSession();
      const tenantId = session?.tenantSlug ?? task.tenantId ?? 'default';
      const http = new HttpClient({
        baseUrl: API_BASE,
        getAccessToken: async () => session?.accessToken ?? '',
        getTenantSlug: async () => session?.tenantSlug ?? undefined,
        getLocale: () => useLanguageStore.getState().lang,
      });
      await pullTasks(db, http, tenantId);
      await pullOrders(db, http, tenantId);

      onResolved();
    } catch (err: any) {
      setError(err?.message || t('taskConflict.errors.fetchServerVersion'));
    } finally {
      setIsResolving(false);
    }
  };

  // 2. Conservar y forzar versión local
  // Trae el nuevo ETag del servidor para que el If-Match sea válido y vuelve a encolar la mutación
  const handleForceLocal = async () => {
    setIsResolving(true);
    setError(null);
    try {
      const session = await loadSession();
      if (!session?.accessToken) {
        throw new Error(t('taskConflict.errors.noSession'));
      }

      const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5168';
      // Obtener el estado y ETag vigentes del servidor
      const res = await apiFetch(`${API_BASE}/api/v1/work-tasks/${task.id}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(t('taskConflict.errors.etagCheck'));
      }

      const serverTask = await res.json();
      const freshEtag = serverTask.etag || res.headers.get('etag')?.replace(/^W\/|"$/g, '');

      // Actualizar el version en la tarea local para que use el If-Match actual
      await db.tasks.update(task.id, {
        version: freshEtag,
        syncState: 'pending',
      });

      // Desbloquear / rearmar la mutación outbox para que se envíe en el próximo drain
      const mutations = await db.outbox_mutations
        .where('aggregateId')
        .equals(task.id)
        .toArray();

      for (const m of mutations) {
        await db.outbox_mutations.update(m.id, {
          status: 'pending',
          attempts: 0,
          nextAttemptAtMs: 0,
        });
      }

      onResolved();
    } catch (err: any) {
      setError(err?.message || t('taskConflict.errors.prepareLocal'));
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border shadow-xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">{t('taskConflict.title')}</h3>
              <p className="text-xs text-muted-foreground">{task.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isResolving}
            aria-label={t('common:actions.close')}
            title={t('common:actions.close')}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Advertencia de Sincronización Previa */}
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{t('taskConflict.warningTitle')}</p>
            <p className="text-[11px] leading-relaxed">
              {t('taskConflict.warningBody')}
            </p>
          </div>
        </div>

        {/* Comparativa */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-xl border bg-muted/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-primary">
              <ArrowUpCircle className="h-4 w-4" />
              <span>{t('taskConflict.device')}</span>
            </div>
            <p className="text-muted-foreground text-[11px]">
              {t('labels.localState')} <strong className="text-foreground uppercase">{task.state}</strong>
            </p>
            {task.updatedAtLocalMs && (
              <p className="text-[10px] text-muted-foreground">
                {t('taskConflict.savedAt', { time: formatTime(task.updatedAtLocalMs) })}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-muted/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <ArrowDownCircle className="h-4 w-4" />
              <span>{t('taskConflict.server')}</span>
            </div>
            <p className="text-muted-foreground text-[11px]">
              {t('taskConflict.state')} <strong className="text-foreground uppercase">{task.serverState || 'REWORK'}</strong>
            </p>
            {task.reworkReason && (
              <p className="text-[10px] text-destructive truncate">
                {t('taskConflict.reason', { reason: task.reworkReason })}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/15 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Opciones de Acción */}
        <div className="space-y-2 pt-2 border-t">
          <button
            onClick={handleAcceptServer}
            disabled={isResolving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isResolving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t('taskConflict.acceptServer')}
          </button>

          <button
            onClick={handleForceLocal}
            disabled={isResolving}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 py-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {t('taskConflict.forceLocal')}
          </button>
        </div>
      </div>
    </div>
  );
}
