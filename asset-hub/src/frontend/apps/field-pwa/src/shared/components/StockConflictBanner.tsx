// StockConflictBanner.tsx — Conflict banner for insufficient stock
import { AlertTriangle } from 'lucide-react';

interface Alternative {
  warehouseId: string;
  warehouseName: string;
  quantityOnHand: number;
  catalogItemId: string;
}

interface StockConflictBannerProps {
  available: number;
  requested: number;
  alternatives: Alternative[];
  onDismiss: () => void;
}

export function StockConflictBanner({ available, requested, alternatives, onDismiss }: StockConflictBannerProps) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Stock insuficiente
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Disponible: {available}, solicitado: {requested}
          </p>

          {alternatives.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium">Almacenes alternativos:</p>
              <ul className="mt-1 space-y-1">
                {alternatives.map((alt) => (
                  <li key={alt.warehouseId} className="text-xs text-muted-foreground">
                    {alt.warehouseName}: {alt.quantityOnHand} disponibles
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
          <span className="sr-only">Cerrar</span>×
        </button>
      </div>
    </div>
  );
}
