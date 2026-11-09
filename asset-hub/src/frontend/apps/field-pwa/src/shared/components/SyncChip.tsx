import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, AlertCircle, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncChipProps {
  isSyncing: boolean;
  pendingCount: number;
  deadCount: number;
  isOnline: boolean;
  className?: string;
}

export function SyncChip({ isSyncing, pendingCount, deadCount, isOnline, className }: SyncChipProps) {
  const { t } = useTranslation(['sync', 'common']);

  const ariaLabel = t('chip.aria');

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn('flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground', className)}
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>{t('common:app.offline')}</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        role="status"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn('flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400', className)}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t('common:loading.syncing')}</span>
      </div>
    );
  }

  if (deadCount > 0) {
    return (
      <div
        role="status"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn('flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400', className)}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{t('chip.errors', { count: deadCount })}</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div
        role="status"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn('flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400', className)}
      >
        <Loader2 className="h-3.5 w-3.5" />
        <span>{t('chip.pending', { count: pendingCount })}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn('flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400', className)}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>{t('states.synced')}</span>
    </div>
  );
}
