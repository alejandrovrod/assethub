// StockConflictBanner.tsx — Conflict banner for insufficient stock
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['sync', 'common']);

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {t('stockConflict.title')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('stockConflict.availability', { available, requested })}
          </p>

          {alternatives.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium">{t('stockConflict.alternatives')}</p>
              <ul className="mt-1 space-y-1">
                {alternatives.map((alt) => (
                  <li key={alt.warehouseId} className="text-xs text-muted-foreground">
                    {t('stockConflict.alternativeItem', {
                      warehouseName: alt.warehouseName,
                      quantity: alt.quantityOnHand,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label={t('common:actions.close')}
          title={t('common:actions.close')}
          className="text-muted-foreground hover:text-foreground"
        >
          <span className="sr-only">{t('common:actions.close')}</span>×
        </button>
      </div>
    </div>
  );
}
