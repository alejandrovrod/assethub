// LoadingState.tsx — Skeleton loading, empty, error, stale states
import { Inbox, AlertCircle, WifiOff } from 'lucide-react';

interface StateProps {
  className?: string;
}

export function LoadingSkeleton({ className }: StateProps) {
  return (
    <div className={`animate-pulse space-y-3 ${className ?? ''}`}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export function EmptyState({ message = 'No hay datos', className }: StateProps & { message?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className ?? ''}`}>
      <Inbox className="h-12 w-12 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function ErrorState({ message = 'Error al cargar', onRetry, className }: StateProps & { message?: string; onRetry?: () => void }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className ?? ''}`}>
      <AlertCircle className="h-12 w-12 text-destructive" />
      <p className="mt-3 text-sm text-destructive">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export function StaleState({ message = 'Datos desactualizados', className }: StateProps & { message?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 ${className ?? ''}`}>
      <WifiOff className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}
