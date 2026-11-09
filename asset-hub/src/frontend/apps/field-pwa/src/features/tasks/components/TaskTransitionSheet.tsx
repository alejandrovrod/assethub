// TaskTransitionSheet.tsx — Bottom sheet for task state transitions with confirmation
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Play, Pause, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { useTaskActions } from '../hooks/useTaskActions';
import { ORDER_STATE_LABELS, STATE_LABELS } from '../hooks/useTasks';
import type { TaskState } from '@asset-hub/core-offline';

interface TaskTransitionSheetProps {
  taskId: string;
  currentState: TaskState;
  allowedTransitions: string[];
  maintenanceOrderState?: string;
  onClose: () => void;
  onTransitioned: () => void;
}

type TransitionKey = 'in_progress' | 'paused' | 'done';

type TransitionLabelKey =
  | 'transition.start'
  | 'transition.startAction'
  | 'transition.pause'
  | 'transition.pauseAction'
  | 'transition.complete'
  | 'transition.completeAction';

const TRANSITION_LABELS: Record<
  TransitionKey,
  { label: TransitionLabelKey; actionLabel: TransitionLabelKey; icon: React.ReactNode; color: string }
> = {
  in_progress: {
    label: 'transition.start',
    actionLabel: 'transition.startAction',
    icon: <Play className="h-5 w-5" />,
    color: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  paused: {
    label: 'transition.pause',
    actionLabel: 'transition.pauseAction',
    icon: <Pause className="h-5 w-5" />,
    color: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  done: {
    label: 'transition.complete',
    actionLabel: 'transition.completeAction',
    icon: <CheckCircle className="h-5 w-5" />,
    color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

const isTransitionKey = (value: string): value is TransitionKey => value in TRANSITION_LABELS;

export function TaskTransitionSheet({
  taskId,
  currentState,
  allowedTransitions,
  maintenanceOrderState,
  onClose,
  onTransitioned,
}: TaskTransitionSheetProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const { start, pause, complete } = useTaskActions();
  const [targetState, setTargetState] = useState<TransitionKey | null>(null);
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOrderLocked =
    maintenanceOrderState && maintenanceOrderState !== 'in_progress';

  /** Order and task states are technical values: only their label is localized. */
  const orderStateLabel = (state: string): string => {
    const key = ORDER_STATE_LABELS[state];
    return key ? t(key) : state;
  };
  const taskStateLabel = (state: string): string => {
    const key = STATE_LABELS[state];
    return key ? t(key) : state;
  };

  const handleExecuteTransition = async (stateToApply: TransitionKey) => {
    setIsProcessing(true);
    setError(null);
    try {
      if (stateToApply === 'in_progress') {
        await start(taskId);
      } else if (stateToApply === 'paused') {
        await pause(taskId, reason || undefined);
      } else if (stateToApply === 'done') {
        await complete(taskId);
      }
      onTransitioned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('transition.error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const availableTransitions: TransitionKey[] = isOrderLocked
    ? []
    : allowedTransitions.filter(isTransitionKey);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-card p-5 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-base font-bold">{t('transition.title')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('transition.currentState', { state: taskStateLabel(currentState) })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
            aria-label={t('common:actions.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {isOrderLocked && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/15 p-3 text-xs text-amber-800 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {t('transition.orderLocked', {
                state: orderStateLabel(maintenanceOrderState ?? ''),
              })}
            </span>
          </div>
        )}

        {targetState ? (
          // Confirmation dialog
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-4 text-center">
              <p className="text-sm font-medium">
                <Trans
                  i18nKey="transition.confirm"
                  values={{ state: t(TRANSITION_LABELS[targetState].actionLabel).toUpperCase() }}
                  components={{ bold: <span className="font-bold text-foreground" /> }}
                />
              </p>
            </div>

            {targetState === 'paused' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {t('transition.pauseReason')}
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('transition.pausePlaceholder')}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTargetState(null)}
                disabled={isProcessing}
                className="flex h-12 flex-1 items-center justify-center rounded-lg border text-sm font-medium"
              >
                {t('common:actions.back')}
              </button>
              <button
                type="button"
                onClick={() => handleExecuteTransition(targetState)}
                disabled={isProcessing}
                className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-bold ${TRANSITION_LABELS[targetState].color} disabled:opacity-50`}
              >
                {isProcessing ? t('transition.processing') : t('common:actions.confirm')}
              </button>
            </div>
          </div>
        ) : (
          // Transition buttons list
          <div className="space-y-2.5">
            {availableTransitions.map((target) => {
              const config = TRANSITION_LABELS[target];
              return (
                <button
                  key={target}
                  onClick={() => setTargetState(target)}
                  disabled={isProcessing}
                  className={`flex h-14 w-full items-center gap-3 rounded-xl px-4 text-left font-semibold transition-transform active:scale-98 ${config.color} disabled:opacity-50`}
                >
                  {config.icon}
                  <span>{t(config.label)}</span>
                </button>
              );
            })}

            {availableTransitions.length === 0 && !isOrderLocked && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('transition.noTransitions', { state: taskStateLabel(currentState) })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
