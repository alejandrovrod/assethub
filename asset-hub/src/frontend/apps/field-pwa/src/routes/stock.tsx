// stock.tsx — Stock consumption screen
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@asset-hub/core-offline';

export function StockPage() {
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isConsuming, setIsConsuming] = useState(false);

  const stockItems = useLiveQuery(() => db.materials_stock.toArray());

  const filtered = (stockItems ?? []).filter((item) =>
    query.trim()
      ? (item.name ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (item.sku ?? '').toLowerCase().includes(query.toLowerCase())
      : true,
  );

  const handleConsume = async () => {
    if (!selectedItem) return;
    setIsConsuming(true);
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
        reason: 'Consumo de campo',
        tenantId: item.tenantId ?? '',
        rowVersion: item.rowVersion ?? '',
      });
      setSelectedItem(null);
      setQuantity(1);
    } catch (err) {
      console.error('Consume failed:', err);
    } finally {
      setIsConsuming(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por SKU o nombre..."
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

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
                {item.qtyAvailableServer - (item.qtyReservedLocal ?? 0)} {item.unit ?? 'uds'}
              </span>
            </div>
            {item.sku && (
              <p className="mt-1 text-xs text-muted-foreground">SKU: {item.sku}</p>
            )}
          </li>
        ))}
      </ul>

      {selectedItem && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Cantidad:</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="flex h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <button
            onClick={handleConsume}
            disabled={isConsuming}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isConsuming ? 'Consumiendo…' : 'Consumir'}
          </button>
        </div>
      )}
    </div>
  );
}


