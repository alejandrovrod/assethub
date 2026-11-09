import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from '@asset-hub/core-offline';
import { SessionProvider } from '../features/auth/hooks/useSession';

export function Providers({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation(['sync', 'common']);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW registered:', r);
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (needRefresh) {
      // Check if outbox is empty before showing update prompt
      db.outbox_mutations.where('status').equals('pending').count().then((count) => {
        setPendingCount(count);
        if (count === 0) {
          setShowUpdatePrompt(true);
        }
      });
    }
  }, [needRefresh]);

  const applyUpdate = useCallback(() => {
    updateServiceWorker(true);
    setShowUpdatePrompt(false);
  }, [updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    setShowUpdatePrompt(false);
    setNeedRefresh(false);
  }, [setNeedRefresh]);

  return (
    <SessionProvider>
      {children}
      {showUpdatePrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border bg-background p-4 shadow-lg">
          <p className="text-sm font-medium">{t('update.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('update.applyNow')}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={applyUpdate}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              {t('update.apply')}
            </button>
            <button
              onClick={dismissUpdate}
              className="rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              {t('common:actions.later')}
            </button>
          </div>
        </div>
      )}
      {needRefresh && pendingCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border bg-amber-500/10 p-4 shadow-lg">
          <p className="text-sm font-medium text-amber-700">{t('update.pendingTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('update.pendingBody', { count: pendingCount })}
          </p>
        </div>
      )}
    </SessionProvider>
  );
}
