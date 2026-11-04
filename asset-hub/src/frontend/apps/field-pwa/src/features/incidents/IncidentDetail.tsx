// incident-detail.tsx — Incident detail with state transitions
import { useState } from 'react';
import { db } from '@asset-hub/core-offline';
import { useLiveQuery } from 'dexie-react-hooks';
import { changeIncidentState } from '../../commands/change-incident-state';

interface Props {
  incidentId: string;
  onClose: () => void;
}

const STATE_LABELS: Record<string, string> = {
  open: 'Abierta',
  in_progress: 'En progreso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
  reopened: 'Reabierta',
};

export function IncidentDetail({ incidentId, onClose }: Props) {
  const incident = useLiveQuery(() => db.incidents.get(incidentId), [incidentId]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!incident) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Incidencia no encontrada</p>
      </div>
    );
  }

const allowedTransitions = ['in_progress', 'resolved', 'closed'];

  const handleTransition = async (targetState: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      await changeIncidentState(db, {
        incidentId: incident.id,
        targetState,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la transición');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{incident.title}</h1>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">✕</button>
        </div>
        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs">
          {incident.syncState}
        </span>
      </header>

      <main className="flex-1 space-y-4 p-4">
        {incident.description && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Descripción</h3>
            <p className="mt-1">{incident.description}</p>
          </div>
        )}

        {incident.assetCode && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Activo</h3>
            <p className="mt-1">{incident.assetCode}</p>
          </div>
        )}

        {incident.severity && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Severidad</h3>
            <p className="mt-1">{incident.severity}</p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Reportada</h3>
          <p className="mt-1">{new Date(incident.createdAtLocalIso).toLocaleString()}</p>
        </div>

        {incident.syncState !== 'synced' && (
          <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700">
            Cambios pendientes de sincronización
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
      </main>

      {allowedTransitions.length > 0 && (
        <footer className="border-t p-4">
          <div className="flex gap-2">
            {allowedTransitions.map((target) => (
              <button
                key={target}
                onClick={() => handleTransition(target)}
                disabled={isProcessing}
                className="flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {STATE_LABELS[target] ?? target}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
