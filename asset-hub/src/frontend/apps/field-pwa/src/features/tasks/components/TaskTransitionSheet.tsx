// TaskTransitionSheet.tsx — Bottom sheet for task state transitions with confirmation
import { useState } from 'react';
import { Play, Pause, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { useTaskActions } from '../hooks/useTaskActions';
import type { TaskState } from '@asset-hub/core-offline';

interface TaskTransitionSheetProps {
  taskId: string;
  currentState: TaskState;
  allowedTransitions: string[];
  maintenanceOrderState?: string;
  onClose: () => void;
  onTransitioned: () => void;
}

const TRANSITION_LABELS: Record<
  string,
  { label: string; actionLabel: string; icon: React.ReactNode; color: string }
> = {
  in_progress: {
    label: 'Iniciar tarea',
    actionLabel: 'Iniciar',
    icon: <Play className="h-5 w-5" />,
    color: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  paused: {
    label: 'Pausar tarea',
    actionLabel: 'Pausar',
    icon: <Pause className="h-5 w-5" />,
    color: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  done: {
    label: 'Completar tarea',
    actionLabel: 'Completar',
    icon: <CheckCircle className="h-5 w-5" />,
    color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

export function TaskTransitionSheet({
  taskId,
  currentState,
  allowedTransitions,
  maintenanceOrderState,
  onClose,
  onTransitioned,
}: TaskTransitionSheetProps) {
  const { start, pause, complete } = useTaskActions();
  const [targetState, setTargetState] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOrderLocked =
    maintenanceOrderState && maintenanceOrderState !== 'in_progress';

  const handleExecuteTransition = async (stateToApply: string) => {
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
      setError(err instanceof Error ? err.message : 'Error al cambiar de estado');
    } finally {
      setIsProcessing(false);
    }
  };

  const availableTransitions = isOrderLocked
    ? []
    : allowedTransitions.filter((t) => TRANSITION_LABELS[t]);

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
            <h3 className="text-base font-bold">Cambiar estado de la tarea</h3>
            <p className="text-xs text-muted-foreground">Estado actual: {currentState}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Cerrar"
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
              La orden de trabajo está en estado "{maintenanceOrderState}". Debe iniciarse primero
              para poder operar sobre esta tarea.
            </span>
          </div>
        )}

        {targetState ? (
          // Confirmation dialog
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-4 text-center">
              <p className="text-sm font-medium">
                ¿Confirmas cambiar la tarea a{' '}
                <span className="font-bold text-foreground">
                  {TRANSITION_LABELS[targetState]?.actionLabel.toUpperCase()}
                </span>
                ?
              </p>
            </div>

            {targetState === 'paused' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Motivo de la pausa (opcional):
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. Esperando repuestos, lluvia..."
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
                Volver
              </button>
              <button
                type="button"
                onClick={() => handleExecuteTransition(targetState)}
                disabled={isProcessing}
                className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-bold ${TRANSITION_LABELS[targetState]?.color} disabled:opacity-50`}
              >
                {isProcessing ? 'Procesando…' : 'Confirmar'}
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
                  <span>{config.label}</span>
                </button>
              );
            })}

            {availableTransitions.length === 0 && !isOrderLocked && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay transiciones válidas disponibles para el estado "{currentState}".
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
