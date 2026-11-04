// consume-material.ts — Consume material from stock offline
import type { FieldDatabase } from '@asset-hub/core-offline';
import { enqueue } from '@asset-hub/core-offline';
import { uuidv7 } from '@asset-hub/core-offline';

export interface ConsumeMaterialParams {
  warehouseId: string;
  catalogItemId: string;
  quantity: number;
  workTaskId: string;
  reason: string;
  tenantId: string;
  rowVersion: string;
}

export interface ConsumeMaterialResult {
  mutationId: string;
}

export async function consumeMaterial(
  db: FieldDatabase,
  params: ConsumeMaterialParams,
): Promise<ConsumeMaterialResult> {
  const mutationId = uuidv7();

  // Reserve locally first
  const stockKey = `${params.warehouseId}:${params.catalogItemId}`;
  const existing = await db.materials_stock.get(stockKey);
  if (existing) {
    await db.materials_stock.update(stockKey, {
      qtyReservedLocal: (existing.qtyReservedLocal ?? 0) + params.quantity,
    } as any);
  }

  await db.transaction('rw', db.outbox_mutations, async (tx) => {
    await enqueue(tx, {
      id: mutationId,
      aggregateType: 'material',
      aggregateId: stockKey,
      operation: 'material.consume',
      method: 'POST',
      path: '/api/v1/inventory/consumptions',
      bodyJson: JSON.stringify({
        warehouseId: params.warehouseId,
        catalogItemId: params.catalogItemId,
        quantity: params.quantity,
        workTaskId: params.workTaskId,
        reason: params.reason,
      }),
      headersJson: JSON.stringify({ 'If-Match': params.rowVersion }),
      tenantId: params.tenantId,
      priority: 100,
      status: 'pending',
    });
  });

  return { mutationId };
}

