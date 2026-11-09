// ConflictReconciliationSheet.tsx — Conflict resolution UI
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, X } from 'lucide-react';

interface ConflictField {
  field: string;
  localValue: string;
  serverValue: string;
}

interface ConflictReconciliationSheetProps {
  fields: ConflictField[];
  onResolve: (resolution: 'local' | 'server' | 'merge', mergedValues?: Record<string, string>) => void;
  onClose: () => void;
}

export function ConflictReconciliationSheet({
  fields,
  onResolve,
  onClose,
}: ConflictReconciliationSheetProps) {
  const { t } = useTranslation(['sync', 'common']);
  const [selectedResolution, setSelectedResolution] = useState<'local' | 'server' | 'merge'>('server');
  const [mergedValues, setMergedValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.field, f.serverValue])),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-2xl bg-background p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-semibold">{t('conflictSheet.title')}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common:actions.close')}
            title={t('common:actions.close')}
            className="rounded-full p-1 hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {t('conflictSheet.description')}
        </p>

        <div className="mb-4 space-y-3">
          {fields.map((field) => (
            <div key={field.field} className="rounded-lg border p-3">
              <p className="text-sm font-medium">{field.field}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-blue-500/10 p-2">
                  <p className="font-medium text-blue-600">{t('conflictSheet.local')}</p>
                  <p>{field.localValue || t('conflictSheet.empty')}</p>
                </div>
                <div className="rounded bg-green-500/10 p-2">
                  <p className="font-medium text-green-600">{t('conflictSheet.server')}</p>
                  <p>{field.serverValue || t('conflictSheet.empty')}</p>
                </div>
              </div>
              {selectedResolution === 'merge' && (
                <input
                  type="text"
                  value={mergedValues[field.field] ?? ''}
                  onChange={(e) =>
                    setMergedValues((prev) => ({ ...prev, [field.field]: e.target.value }))
                  }
                  className="mt-2 flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              )}
            </div>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          {(['server', 'local', 'merge'] as const).map((res) => (
            <button
              key={res}
              onClick={() => setSelectedResolution(res)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                selectedResolution === res
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input hover:bg-muted'
              }`}
            >
              {res === 'server'
                ? t('conflictSheet.server')
                : res === 'local'
                ? t('conflictSheet.local')
                : t('conflictSheet.merge')}
            </button>
          ))}
        </div>

        <button
          onClick={() => onResolve(selectedResolution, selectedResolution === 'merge' ? mergedValues : undefined)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground"
        >
          <Check className="h-4 w-4" />
          {t('conflictSheet.resolve')}
        </button>
      </div>
    </div>
  );
}
