import { test, Browser, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initTutorialOverlay,
  narrate,
  highlightElement,
  moveAndClick,
  moveAndType,
  waitForPageReady,
} from '../../helpers/tutorial-recorder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Lang = 'es' | 'en';

const ATLAS_BASE_URL = 'http://atlas-industrial.localhost:5173';
const ATLAS_ADMIN = {
  email: 'rmendez@atlas-industrial.com',
  password: 'Password123!',
};

const VIDEOS_OUTPUT_DIR = path.resolve(
  __dirname,
  '../../../../learning-hub/public/videos/05-inventario/02-saldos-stock',
);
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-05b');

interface CopyPack {
  modTitle: string;
  sLangTitle: string;
  sLangDesc: string;
  sIntroTitle: string;
  sIntroDesc: string;
  sKpiCardsTitle: string;
  sKpiCardsDesc: string;
  sWarehouseFilterTitle: string;
  sWarehouseFilterDesc: string;
  sStockTableTitle: string;
  sStockTableDesc: string;
  sNewMovementTitle: string;
  sNewMovementDesc: string;
  sFillMovementTitle: string;
  sFillMovementDesc: string;
  sSubmitMovementTitle: string;
  sSubmitMovementDesc: string;
  sSummaryTitle: string;
  sSummaryDesc: string;
}

const DATA_BY_LANG: Record<
  Lang,
  {
    whId: string;
    whName: string;
    itemId: string;
    itemName: string;
    itemCode: string;
    qty: string;
    unitCost: string;
    reason: string;
    copy: CopyPack;
  }
> = {
  es: {
    whId: 'wh-001',
    whName: 'Almacén Central de Repuestos',
    itemId: 'part-rod-001',
    itemName: 'Rodamiento de Husillo Cerámico Doble Hilera NSK 7014',
    itemCode: 'NSK-7014-H-P4',
    qty: '12',
    unitCost: '3250.00',
    reason: 'Recepción de embarque nacional OC-2026-0889 de proveedor NSK México',
    copy: {
      modTitle: 'Inventario — Saldos de Stock y Ajustes',
      sLangTitle: 'Demostración Multilingüe de la Plataforma',
      sLangDesc: 'Supervisión en tiempo real de existencias, valorización de inventario y entradas de almacén.',
      sIntroTitle: 'Consola de Saldos de Stock (/inventory/stock)',
      sIntroDesc: 'Visualización integral de repuestos mecánicos, eléctricos y consumibles por centro logístico.',
      sKpiCardsTitle: 'Métricas de Inventario y Valor Total',
      sKpiCardsDesc: 'Resumen ejecutivo de artículos en stock, valuación en moneda local y alertas de desabasto.',
      sWarehouseFilterTitle: 'Filtro Dinámico por Almacén',
      sWarehouseFilterDesc: 'Filtramos el inventario por ubicación física o visualizamos el consolidado global de la planta.',
      sStockTableTitle: 'Matriz Detallada de Existencias y Costo Medio',
      sStockTableDesc: 'Trazabilidad de existencias físicas, costo unitario promedio ponderado y última actualización.',
      sNewMovementTitle: 'Registro de Entrada / Ajuste de Stock',
      sNewMovementDesc: 'Abrimos el formulario lateral para ingresar nuevos repuestos o corregir desvíos de conteo.',
      sFillMovementTitle: 'Datos del Movimiento y Repuesto',
      sFillMovementDesc: 'Seleccionamos almacén destino, repuesto de catálogo, cantidad recibida y costo de adquisición.',
      sSubmitMovementTitle: 'Confirmación y Actualización de Saldos',
      sSubmitMovementDesc: 'Guardamos la recepción actualizando el stock disponible y recalculando el costo promedio.',
      sSummaryTitle: 'Control Integral de Inventario Operativo',
      sSummaryDesc: 'Los técnicos y compras disponen de visibilidad exacta de refacciones para mantenimiento preventivo y correctivo.',
    },
  },
  en: {
    whId: 'wh-001',
    whName: 'Central Spares Warehouse',
    itemId: 'part-rod-001',
    itemName: 'Double Row Ceramic Spindle Bearing NSK 7014',
    itemCode: 'NSK-7014-H-P4',
    qty: '12',
    unitCost: '3250.00',
    reason: 'Domestic shipment receipt PO-2026-0889 from NSK Mexico vendor',
    copy: {
      modTitle: 'Inventory — Stock Balances & Movements',
      sLangTitle: 'Multilingual Platform Walkthrough',
      sLangDesc: 'Real-time inventory levels, stock valuation, receipts, and count adjustments.',
      sIntroTitle: 'Stock Management Console (/inventory/stock)',
      sIntroDesc: 'Centralized oversight of mechanical spares, electrical modules, and tooling across warehouses.',
      sKpiCardsTitle: 'Inventory KPIs & Total Value',
      sKpiCardsDesc: 'High-level metrics covering total items, capital valuation in local currency, and stockouts.',
      sWarehouseFilterTitle: 'Dynamic Warehouse Filter',
      sWarehouseFilterDesc: 'Isolating stock balances by facility or viewing plant-wide consolidated inventory.',
      sStockTableTitle: 'Stock Balances & Weighted Average Cost',
      sStockTableDesc: 'Tracking on-hand quantities, weighted moving average costs, and latest adjustment timestamps.',
      sNewMovementTitle: 'Registering Stock Receipt / Adjustment',
      sNewMovementDesc: 'Opening the adjustment drawer to record replenishment shipments or cycle count corrections.',
      sFillMovementTitle: 'Movement Parameters & Line Items',
      sFillMovementDesc: 'Specifying destination warehouse, catalog spare part, quantity received, and unit cost.',
      sSubmitMovementTitle: 'Posting Movement & Balance Refresh',
      sSubmitMovementDesc: 'Committing the transaction to immediately update on-hand quantities and moving average cost.',
      sSummaryTitle: 'Complete Operational Inventory Control',
      sSummaryDesc: 'Maintenance and supply chain teams operate with accurate parts availability for work orders.',
    },
  },
};

async function ensureAtlasAuthState(browser: Browser, lang: Lang): Promise<string> {
  const authPath = path.resolve(__dirname, `../../.auth/atlas-admin-${lang}.json`);
  if (fs.existsSync(authPath)) {
    return authPath;
  }

  const ctx = await browser.newContext({
    baseURL: ATLAS_BASE_URL,
    locale: lang === 'en' ? 'en-US' : 'es-ES',
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();
  await page.addInitScript((langCode) => {
    window.localStorage.setItem('assethub_lang', langCode);
  }, lang);

  await page.goto(`${ATLAS_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await waitForPageReady(page, 600);
  await page.locator('input[name="email"]').fill(ATLAS_ADMIN.email);
  await page.locator('input[name="password"]').fill(ATLAS_ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 25_000 });
  await waitForPageReady(page, 900);

  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  await ctx.storageState({ path: authPath });
  await ctx.close();
  return authPath;
}

async function runStockTutorial(browser: Browser, lang: Lang): Promise<void> {
  const pack = DATA_BY_LANG[lang];
  const c = pack.copy;

  fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

  const authStatePath = await ensureAtlasAuthState(browser, lang);

  const context = await browser.newContext({
    baseURL: ATLAS_BASE_URL,
    locale: lang === 'en' ? 'en-US' : 'es-ES',
    viewport: { width: 1280, height: 720 },
    storageState: authStatePath,
    recordVideo: {
      dir: TEMP_VIDEOS_DIR,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  await initTutorialOverlay(page, lang);
  const session = { context, page };

  const currentStock = [
    {
      warehouseId: pack.whId,
      warehouseName: pack.whName,
      catalogItemId: pack.itemId,
      catalogItemCode: pack.itemCode,
      catalogItemName: pack.itemName,
      quantityOnHand: 8,
      averageUnitCost: 3200,
      updatedAt: '2026-02-10T11:30:00Z',
    },
    {
      warehouseId: pack.whId,
      warehouseName: pack.whName,
      catalogItemId: 'part-oil-002',
      catalogItemCode: 'MOBIL-VACTRA-2',
      catalogItemName: lang === 'es' ? 'Aceite de Guías Lineales Mobil Vactra No. 2 (20L)' : 'Mobil Vactra Oil No. 2 Slideway Lubricant (20L)',
      quantityOnHand: 25,
      averageUnitCost: 1450,
      updatedAt: '2026-02-11T09:15:00Z',
    },
    {
      warehouseId: pack.whId,
      warehouseName: pack.whName,
      catalogItemId: 'part-belt-003',
      catalogItemCode: 'GATES-SYNC-01',
      catalogItemName: lang === 'es' ? 'Correa Sincrónica de Husillo Gates PowerGrip GT3' : 'Gates PowerGrip GT3 Spindle Timing Belt',
      quantityOnHand: 4,
      averageUnitCost: 890,
      updatedAt: '2026-02-08T16:00:00Z',
    },
  ];

  try {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    // Mock auth/profile
    await page.route('**/api/v1/auth/me*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'c016fe84-846c-48a3-81ca-6de48a2be410',
          email: ATLAS_ADMIN.email,
          fullName: 'Ing. Roberto Méndez',
          roles: ['Tenant Admin'],
          permissions: ['stock:read', 'stock:adjust', 'receipts:create', 'warehouses:read'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // 1. Mock de almacenes
    await page.route(/\/api\/v1\/inventory\/warehouses(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: pack.whId,
            code: 'ALM-CENTRAL',
            name: pack.whName,
            isActive: true,
          },
          {
            id: 'wh-002',
            code: 'PAN-HERR',
            name: lang === 'es' ? 'Pañol de Utillajes' : 'Tooling Staging Crib',
            isActive: true,
          },
        ]),
      });
    });

    // 2. Mock de items de catálogo (parts)
    await page.route(/\/api\/v1\/catalogs\/parts\/items(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { id: pack.itemId, code: pack.itemCode, label: pack.itemName },
            { id: 'part-oil-002', code: 'MOBIL-VACTRA-2', label: 'Mobil Vactra No. 2 (20L)' },
            { id: 'part-belt-003', code: 'GATES-SYNC-01', label: 'Gates PowerGrip GT3 Belt' },
          ],
        }),
      });
    });

    // 3. Mock de saldos de stock
    await page.route(/\/api\/v1\/inventory\/stock(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentStock),
      });
    });

    // 4. Mock de recepción / ajuste
    await page.route(/\/api\/v1\/inventory\/adjustments(\?.*)?$/, async (route) => {
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON() || {};
        currentStock[0].quantityOnHand += payload.quantity || 12;
        currentStock[0].updatedAt = new Date().toISOString();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'adj-rec-01',
            warehouseId: payload.warehouseId || pack.whId,
            catalogItemId: payload.catalogItemId || pack.itemId,
            quantity: payload.quantity || 12,
            unitCost: payload.unitCost || 3250,
            type: payload.type || 'Receipt',
            state: 'Posted',
            createdAt: new Date().toISOString(),
          }),
        });
      }
      return route.fallback();
    });

    // PASO 1: Navegar a /inventory/stock
    await page.goto(`${ATLAS_BASE_URL}/inventory/stock`, { waitUntil: 'load' });
    await waitForPageReady(page, 1500);

    await narrate(page, c.modTitle, c.sLangTitle, c.sLangDesc, 2000);
    const langBtn = page.locator('button:has(svg.lucide-languages)').first();
    if (await langBtn.isVisible().catch(() => false)) {
      await highlightElement(page, langBtn, 700);
      await moveAndClick(page, langBtn, 500);
      const menuItem = page.getByRole('menuitem').nth(lang === 'es' ? 0 : 1);
      if (await menuItem.isVisible().catch(() => false)) {
        await moveAndClick(page, menuItem, 700);
      }
    }

    // PASO 2: Introducción a la consola de stock
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2600);

    // PASO 3: Tarjetas KPI de resumen
    await narrate(page, c.modTitle, c.sKpiCardsTitle, c.sKpiCardsDesc, 2800);
    const summaryGrid = page.locator('.grid.grid-cols-1.sm\\:grid-cols-3').first();
    if (await summaryGrid.isVisible().catch(() => false)) {
      await highlightElement(page, summaryGrid, 1000);
    }

    // PASO 4: Filtro por Almacén
    await narrate(page, c.modTitle, c.sWarehouseFilterTitle, c.sWarehouseFilterDesc, 2600);
    const whFilter = page.locator('button[role="combobox"]').first();
    if (await whFilter.isVisible().catch(() => false)) {
      await highlightElement(page, whFilter, 700);
      await moveAndClick(page, whFilter, 600);
      const allOption = page.getByRole('option').first();
      if (await allOption.isVisible().catch(() => false)) {
        await moveAndClick(page, allOption, 600);
      }
    }

    // PASO 5: Tabla de Saldos y Costos Promedio
    await narrate(page, c.modTitle, c.sStockTableTitle, c.sStockTableDesc, 2800);
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await highlightElement(page, firstRow, 1100);
    }

    // PASO 6: Abrir Formulario de Entrada / Ajuste
    await narrate(page, c.modTitle, c.sNewMovementTitle, c.sNewMovementDesc, 2600);
    const newMovementBtn = page.locator('button:has(svg.lucide-plus)').first();
    await highlightElement(page, newMovementBtn, 700);
    await moveAndClick(page, newMovementBtn, 900);

    // PASO 7: Completar Formulario en Sheet
    const sheet = page.locator('[role="dialog"]').first();
    await sheet.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sFillMovementTitle, c.sFillMovementDesc, 2800);

    // Seleccionar Almacén en el Formulario
    const formWhSelect = sheet.locator('button[role="combobox"]').first();
    if (await formWhSelect.isVisible().catch(() => false)) {
      await moveAndClick(page, formWhSelect, 500);
      const whItem = page.getByRole('option').first();
      if (await whItem.isVisible().catch(() => false)) {
        await moveAndClick(page, whItem, 600);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Seleccionar Repuesto en el Formulario
    const formItemSelect = sheet.locator('button[role="combobox"]').nth(1);
    if (await formItemSelect.isVisible().catch(() => false)) {
      await moveAndClick(page, formItemSelect, 500);
      const partOption = page.getByRole('option').first();
      if (await partOption.isVisible().catch(() => false)) {
        await moveAndClick(page, partOption, 600);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Cantidad
    const qtyInput = sheet.locator('input#adj-qty');
    if (await qtyInput.isVisible().catch(() => false)) {
      await highlightElement(page, qtyInput, 600);
      await moveAndType(page, qtyInput, pack.qty, 40);
    }

    // Costo unitario
    const costInput = sheet.locator('input#adj-cost');
    if (await costInput.isVisible().catch(() => false)) {
      await highlightElement(page, costInput, 600);
      await moveAndType(page, costInput, pack.unitCost, 40);
    }

    // Motivo
    const reasonInput = sheet.locator('input#adj-reason');
    if (await reasonInput.isVisible().catch(() => false)) {
      await highlightElement(page, reasonInput, 600);
      await moveAndType(page, reasonInput, pack.reason, 25);
    }

    // Debug: imprimir botones en sheet
    const buttons = await sheet.locator('button').allInnerTexts().catch(() => []);
    console.log('BOTONES EN SHEET:', JSON.stringify(buttons));

    // PASO 8: Confirmar y Guardar Recepción
    await narrate(page, c.modTitle, c.sSubmitMovementTitle, c.sSubmitMovementDesc, 2600);
    const submitBtn = sheet.locator('button').filter({ hasText: /Registrar|Register|Guardar|Save/i }).first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
      await highlightElement(page, submitBtn, 700);
      await moveAndClick(page, submitBtn, 1200);
    } else {
      const anySubmit = sheet.locator('button[type="submit"]').first();
      if (await anySubmit.isVisible().catch(() => false)) {
        await anySubmit.scrollIntoViewIfNeeded().catch(() => {});
        await highlightElement(page, anySubmit, 700);
        await moveAndClick(page, anySubmit, 1200);
      } else {
        const cancelBtn = sheet.locator('button').filter({ hasText: /Cancelar|Cancel/i }).first();
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.scrollIntoViewIfNeeded().catch(() => {});
          await highlightElement(page, cancelBtn, 700);
          await moveAndClick(page, cancelBtn, 1000);
        }
      }
    }

    await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await waitForPageReady(page, 1000);

    // PASO 9: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `saldos-stock-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 05B — Saldos de Stock y Ajustes de Inventario (ES / EN)', () => {
  test.setTimeout(300_000);

  test('saldos-stock-es', async ({ browser }) => {
    await runStockTutorial(browser, 'es');
  });

  test('saldos-stock-en', async ({ browser }) => {
    await runStockTutorial(browser, 'en');
  });
});

