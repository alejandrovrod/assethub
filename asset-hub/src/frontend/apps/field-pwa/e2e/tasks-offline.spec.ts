// e2e/tasks-offline.spec.ts — Spec §5.3: "Iniciar tarea sin conectividad"
import { test, expect } from '@playwright/test';

test.describe('US1: Ejecutar tareas sin conectividad (Spec §5.3)', () => {
  test('Scenario: Iniciar tarea sin conectividad', async ({ page, context }) => {
    // 1. Given un técnico autenticado con tareas cacheadas localmente
    await page.goto('/');

    // Ensure session is set up or seed test task in Dexie
    await page.evaluate(async () => {
      const { createFieldDatabase } = await import('@asset-hub/core-offline');
      const db = createFieldDatabase();
      await db.tasks.put({
        id: 'task-e2e-1',
        tenantId: 'tenant-demo',
        assignedToId: 'tech-001',
        title: 'Inspección de Bombas de Alimentación',
        priority: 'high',
        state: 'todo',
        serverState: 'todo',
        dueAtMs: Date.now() + 3600000,
        cachedAtMs: Date.now(),
        updatedAtLocalMs: Date.now(),
        syncState: 'synced',
      });
    });

    // 2. And el dispositivo sin conectividad (modo offline)
    await context.setOffline(true);

    // 3. When el técnico abre la tarea y pulsa "Iniciar"
    await page.reload();
    await expect(page.getByText('Inspección de Bombas de Alimentación')).toBeVisible();
    await page.getByText('Inspección de Bombas de Alimentación').click();

    // Bottom action bar
    await page.getByRole('button', { name: /Cambiar Estado/i }).click();
    await page.getByRole('button', { name: /Iniciar tarea/i }).click();
    await page.getByRole('button', { name: /Confirmar/i }).click();

    // 4. Then la tarea pasa a in_progress en la UI
    await expect(page.getByText('IN_PROGRESS')).toBeVisible();

    // 5. And se encola exactamente 1 mutación PUT en el outbox
    const mutationCount = await page.evaluate(async () => {
      const { createFieldDatabase } = await import('@asset-hub/core-offline');
      const db = createFieldDatabase();
      const mutations = await db.outbox_mutations.where('aggregateId').equals('task-e2e-1').toArray();
      return mutations.length;
    });
    expect(mutationCount).toBe(1);
  });
});

