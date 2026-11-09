// stock.tsx — Stock consumption screen
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@asset-hub/core-offline';

export function StockPage() {
  const { t } = useTranslation('stock');
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isConsuming, setIsConsuming] = useState(false);
  const [consumeError, setConsumeError] = useState<string | null>(null);

  const stockItems = useLiveQuery(() => db.materials_stock.toArray());

  const filtered = (stockItems ?? [])
    .filter((item) => item.name && !isNaN(item.qtyAvailableServer))
    .filter((item) =>
      query.trim()
        ? (item.name ?? '').toLowerCase().includes(query.toLowerCase()) ||
          (item.sku ?? '').toLowerCase().includes(query.toLowerCase())
        : true,
    );

  const handleConsume = async () => {
    if (!selectedItem) return;
    setIsConsuming(true);
    setConsumeError(null);
    try {
      const { consumeMaterial } = await import('../commands/consume-material');
      // Find the selected stock item
      const item = filtered.find((s) => s.id === selectedItem);
      if (!item) return;
      await consumeMaterial(db, {
        warehouseId: item.warehouseId ?? '',
        catalogItemId: item.materialId ?? '',
        quantity,
        workTaskId: '',
        reason: t('consume.reason'),
        tenantId: item.tenantId ?? '',
        rowVersion: item.rowVersion ?? '',
      });
      setSelectedItem(null);
      setQuantity(1);
    } catch (err) {
      console.error('Consume failed:', err);
      setConsumeError(t('errors.consumeFailed'));
    } finally {
      setIsConsuming(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">{t('list.empty')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('list.emptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => (
            <li
              key={item.id}
              onClick={() => setSelectedItem(item.id)}
              className={`cursor-pointer rounded-lg border p-3 ${
                selectedItem === item.id ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{item.name ?? item.materialId}</span>
                <span className="text-sm text-muted-foreground">
                  {item.qtyAvailableServer - (item.qtyReservedLocal ?? 0)}{' '}
                  {item.unit ?? t('units.default')}
                </span>
              </div>
              {item.sku && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('list.sku', { sku: item.sku })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {consumeError && (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {consumeError}
        </p>
      )}

      {selectedItem && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label htmlFor="consume-quantity" className="text-sm font-medium">
              {t('consume.quantityLabel')}
            </label>
            <input
              id="consume-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              aria-label={t('consume.quantityAria')}
              className="flex h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <button
            onClick={handleConsume}
            disabled={isConsuming}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isConsuming ? t('consume.submitting') : t('consume.submit')}
          </button>
        </div>
      )}
    </div>
  );
}
