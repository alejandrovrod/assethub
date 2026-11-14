import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  initTutorialOverlay,
  narrate,
  moveAndClick,
  highlightElement,
  waitForPageReady,
} from '../../helpers/tutorial-recorder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ATLAS_BASE_URL = 'http://atlas-industrial.localhost:5173';
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/05-inventario/03-configuracion-inventario');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-05c');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 05C: Configuración y Modos de Inventario',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Parámetros Operativos de Inventario',
    sIntroDesc: 'Configura las reglas de aprovisionamiento, consumo en órdenes de trabajo y control de stock.',
    sModesTitle: 'Modos de Operación (Interno, Externo, Híbrido)',
    sModesDesc: 'Define cómo interactúa el inventario con mantenimiento: compra externa directa, descuento de stock propio o modelo híbrido.',
    sSelectInternalTitle: 'Selección de Modo Interno',
    sSelectInternalDesc: 'Al activar Modo Interno, los repuestos utilizados en órdenes de trabajo descuentan existencias automáticamente.',
    sSelectHybridTitle: 'Flexibilidad con Modo Híbrido',
    sSelectHybridDesc: 'El Modo Híbrido permite decidir por cada línea de repuesto si proviene de bodega central o compra externa.',
    sNegativeTitle: 'Política de Stock Negativo',
    sNegativeDesc: 'Restringe transacciones si no hay existencias físicas reales, garantizando trazabilidad y auditoría estricta.',
    sSaveTitle: 'Persistencia de Parámetros',
    sSaveDesc: 'Guardando los cambios aplicados en las políticas operativas del tenant Atlas Industrial.',
    sSummaryTitle: 'Configuración Lista',
    sSummaryDesc: 'Los almacenes y las órdenes de trabajo ahora operan bajo las directivas de inventario configuradas.',
  },
  en: {
    modTitle: 'Module 05C: Inventory Configuration & Operating Modes',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Inventory Operating Parameters',
    sIntroDesc: 'Configure provisioning rules, consumption in work orders, and strict stock balance controls.',
    sModesTitle: 'Operating Modes (Internal, External, Hybrid)',
    sModesDesc: 'Define maintenance interaction: direct vendor purchase, automatic warehouse stock deduction, or a hybrid model.',
    sSelectInternalTitle: 'Selecting Internal Warehouse Mode',
    sSelectInternalDesc: 'With Internal Mode active, parts recorded in work orders automatically consume on-hand inventory.',
    sSelectHybridTitle: 'Hybrid Mode Flexibility',
    sSelectHybridDesc: 'Hybrid Mode lets engineers choose per work order item whether it is pulled from stock or procured externally.',
    sNegativeTitle: 'Negative Stock Policy',
    sNegativeDesc: 'Rejects transactions when physical stock is insufficient, enforcing auditable inventory balances.',
    sSaveTitle: 'Persisting Settings',
    sSaveDesc: 'Saving changes and applying operational warehouse policies for Atlas Industrial tenant.',
    sSummaryTitle: 'Configuration Complete',
    sSummaryDesc: 'Warehouses and maintenance work orders are now operating under the specified inventory directives.',
  },
};

async function runInventorySettingsTutorial(browser: any, lang: 'es' | 'en') {
  const c = COPY[lang];
  const authStatePath = path.resolve(__dirname, `../../.auth/atlas-admin-${lang}.json`);

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

  let currentSettings = {
    tenantId: 'tenant-atlas-001',
    operatingMode: 'external' as 'external' | 'internal' | 'hybrid',
    allowNegativeStock: false,
  };

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
          permissions: ['inventory:configure', 'stock:read', 'warehouses:read'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock settings GET
    await page.route(/\/api\/v1\/inventory\/settings(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentSettings),
        });
      }
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        currentSettings = { ...currentSettings, ...body };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentSettings),
        });
      }
      return route.fallback();
    });

    // PASO 1: Navegar a /inventory/settings
    await page.goto(`${ATLAS_BASE_URL}/inventory/settings`, { waitUntil: 'load' });
    await waitForPageReady(page, 1500);

    // Idioma
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

    // PASO 2: Introducción a Configuración de Inventario
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Modos de Operación
    await narrate(page, c.modTitle, c.sModesTitle, c.sModesDesc, 3000);
    const modeCards = page.locator('button.w-full.text-left');
    await modeCards.first().waitFor({ state: 'visible', timeout: 8000 });

    // PASO 4: Seleccionar Modo Interno
    await narrate(page, c.modTitle, c.sSelectInternalTitle, c.sSelectInternalDesc, 2800);
    const internalModeBtn = modeCards.nth(1); // 'internal'
    await highlightElement(page, internalModeBtn, 800);
    await moveAndClick(page, internalModeBtn, 1000);
    await page.waitForTimeout(600);

    // PASO 5: Seleccionar Modo Híbrido
    await narrate(page, c.modTitle, c.sSelectHybridTitle, c.sSelectHybridDesc, 2800);
    const hybridModeBtn = modeCards.nth(2); // 'hybrid'
    await highlightElement(page, hybridModeBtn, 800);
    await moveAndClick(page, hybridModeBtn, 1000);
    await page.waitForTimeout(600);

    // PASO 6: Política de Stock Negativo
    await narrate(page, c.modTitle, c.sNegativeTitle, c.sNegativeDesc, 2800);
    const switchControl = page.locator('button#allow-negative');
    if (await switchControl.isVisible().catch(() => false)) {
      await highlightElement(page, switchControl, 800);
      await moveAndClick(page, switchControl, 900);
      await page.waitForTimeout(600);
    }

    // PASO 7: Guardar Configuración
    await narrate(page, c.modTitle, c.sSaveTitle, c.sSaveDesc, 2600);
    const saveBtn = page.locator('button').filter({ hasText: /Guardar configuración|Save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await highlightElement(page, saveBtn, 700);
      await moveAndClick(page, saveBtn, 1200);
    }
    await waitForPageReady(page, 1500);

    // PASO 8: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `configuracion-inventario-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 05C — Configuración y Modos de Inventario (ES / EN)', () => {
  test.setTimeout(300_000);

  test('configuracion-inventario-es', async ({ browser }) => {
    await runInventorySettingsTutorial(browser, 'es');
  });

  test('configuracion-inventario-en', async ({ browser }) => {
    await runInventorySettingsTutorial(browser, 'en');
  });
});
