// DeadLetterSheet.tsx — Dead letter resolution UI
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { db } from '@asset-hub/core-offline';

interface DeadLetterSheetProps {
  mutationId: string;
  operation: string;
  lastError: string;
  onClose: () => void;
  onResolved: () => void;
}

export function DeadLetterSheet({ mutationId, operation, lastError, onClose, onResolved }: DeadLetterSheetProps) {
  const { t } = useTranslation(['sync', 'common']);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRetry = async () => {
    setIsProcessing(true);
    try {
      await db.outbox_mutations.update(mutationId, {
        status: 'pending',
        attempts: 0,
        nextAttemptAtMs: 0,
      });
      onResolved();
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscard = async () => {
    setIsProcessing(true);
    try {
      await db.outbox_mutations.update(mutationId, {
        status: 'discarded',
      });
      onResolved();
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-2xl bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h3 className="text-lg font-semibold">{t('deadLetter.title')}</h3>
        </div>

        <div className="mb-4 space-y-2">
          <p className="text-sm">
            <span className="font-medium">{t('deadLetter.operation')}</span> {operation}
          </p>
          <p className="text-sm">
            <span className="font-medium">{t('deadLetter.error')}</span> {lastError}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('deadLetter.reason')}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRetry}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            {t('common:actions.retry')}
          </button>
          <button
            onClick={handleDiscard}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {t('common:actions.discard')}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-md py-2 text-sm text-muted-foreground"
        >
          {t('common:actions.close')}
        </button>
      </div>
    </div>
  );
}
