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
  '../../../tutorials-videos/05-inventario/01-almacenes-bodegas',
);
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-05a');

interface CopyPack {
  modTitle: string;
  sLangTitle: string;
  sLangDesc: string;
  sIntroTitle: string;
  sIntroDesc: string;
  sNewWhTitle: string;
  sNewWhDesc: string;
  sFillCodeTitle: string;
  sFillCodeDesc: string;
  sFillNameTitle: string;
  sFillNameDesc: string;
  sFillDescTitle: string;
  sFillDescDesc: string;
  sSubmitWhTitle: string;
  sSubmitWhDesc: string;
  sWhListTitle: string;
  sWhListDesc: string;
  sSummaryTitle: string;
  sSummaryDesc: string;
}

const DATA_BY_LANG: Record<
  Lang,
  {
    whCode: string;
    whName: string;
    whDesc: string;
    copy: CopyPack;
  }
> = {
  es: {
    whCode: 'ALM-REP-01',
    whName: 'Almacén Central de Repuestos y Mecatrónica',
    whDesc: 'Bodega de repuestos críticos, rodamientos, servomotores y consumibles para líneas de mecanizado CNC.',
    copy: {
      modTitle: 'Inventario — Almacenes y Bodegas Operativas',
      sLangTitle: 'Demostración Multilingüe de la Plataforma',
      sLangDesc: 'Gestión de centros de almacenamiento, bodegas satélite y control de ubicaciones operativas.',
      sIntroTitle: 'Módulo de Almacenes (/inventory/warehouses)',
      sIntroDesc: 'Consola centralizada para registrar bodegas, talleres de mantenimiento y pañoles de herramientas.',
      sNewWhTitle: 'Creación de Nuevo Almacén',
      sNewWhDesc: 'Iniciamos el registro de una nueva instalación logística mediante el panel lateral.',
      sFillCodeTitle: 'Código Identificador de Almacén',
      sFillCodeDesc: 'Ingresamos la nomenclatura estandarizada para trazabilidad en órdenes de compra y consumo.',
      sFillNameTitle: 'Nombre Descriptivo del Almacén',
      sFillNameDesc: 'Definimos el nombre operativo que verán los técnicos al solicitar piezas o registrar entradas.',
      sFillDescTitle: 'Descripción y Alcance Operativo',
      sFillDescDesc: 'Detallamos el propósito de la bodega y los tipos de componentes que resguarda.',
      sSubmitWhTitle: 'Confirmación y Guardado del Almacén',
      sSubmitWhDesc: 'Registramos el almacén en el sistema validando código único y estado activo.',
      sWhListTitle: 'Matriz de Almacenes Registrados',
      sWhListDesc: 'Exploramos los almacenes operativos, sus códigos de identificación y fechas de alta.',
      sSummaryTitle: 'Base Lista para Control de Stock',
      sSummaryDesc: 'Con los almacenes configurados, el sistema está listo para recibir existencias y transferencias.',
    },
  },
  en: {
    whCode: 'ALM-REP-01',
    whName: 'Central Spares & Mechatronics Warehouse',
    whDesc: 'Main facility for critical spare parts, spindle bearings, servo motors, and CNC machining consumables.',
    copy: {
      modTitle: 'Inventory — Warehouses & Storage Facilities',
      sLangTitle: 'Multilingual Platform Walkthrough',
      sLangDesc: 'Managing storage facilities, satellite parts rooms, and maintenance tool cribs.',
      sIntroTitle: 'Warehouse Management (/inventory/warehouses)',
      sIntroDesc: 'Central console for setting up supply depots, shop-floor staging areas, and inventory locations.',
      sNewWhTitle: 'Creating a New Warehouse',
      sNewWhDesc: 'Launching the registration drawer to add a physical storage location.',
      sFillCodeTitle: 'Warehouse Identifier Code',
      sFillCodeDesc: 'Entering standardized facility code used across procurement and work order bill of materials.',
      sFillNameTitle: 'Warehouse Name',
      sFillNameDesc: 'Setting the recognizable name displayed to maintenance technicians during stock reservation.',
      sFillDescTitle: 'Description & Scope',
      sFillDescDesc: 'Documenting facility scope and the categories of mechanical/electrical spares handled.',
      sSubmitWhTitle: 'Submitting Warehouse Record',
      sSubmitWhDesc: 'Persisting the warehouse record into the tenant inventory master catalog.',
      sWhListTitle: 'Active Warehouses Grid',
      sWhListDesc: 'Reviewing operational warehouses, tracking status badges, and registration timestamps.',
      sSummaryTitle: 'Stock Management Foundation Complete',
      sSummaryDesc: 'With warehouses established, the facility is primed for stock balances and inventory transactions.',
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

async function runWarehouseTutorial(browser: Browser, lang: Lang): Promise<void> {
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

  const existingWarehouses = [
    {
      id: 'wh-001',
      code: 'ALM-CENTRAL',
      name: lang === 'es' ? 'Almacén Principal Planta Norte' : 'Main Warehouse North Plant',
      description: lang === 'es' ? 'Almacén general de suministros industriales y consumibles.' : 'General industrial supplies and consumables facility.',
      isActive: true,
      createdAt: '2026-01-15T08:00:00Z',
    },
    {
      id: 'wh-002',
      code: 'PAN-HERR',
      name: lang === 'es' ? 'Pañol de Herramientas Especiales' : 'Specialized Tooling Crib',
      description: lang === 'es' ? 'Calibres, dinamométricas y utillajes para centros de mecanizado.' : 'Gauges, torque wrenches, and specialized CNC machining jigs.',
      isActive: true,
      createdAt: '2026-01-20T10:30:00Z',
    },
  ];

  try {
    // 1. Mock endpoints de almacenes
    await page.route('**/api/v1/inventory/warehouses*', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const payload = req.postDataJSON() || {};
        const created = {
          id: 'wh-new-01',
          code: payload.code || pack.whCode,
          name: payload.name || pack.whName,
          description: payload.description || pack.whDesc,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        existingWarehouses.push(created);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(existingWarehouses),
      });
    });

    // PASO 1: Navegar a /inventory/warehouses
    await page.goto(`${ATLAS_BASE_URL}/inventory/warehouses`, { waitUntil: 'load' });
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

    // PASO 2: Introducción a Almacenes
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2600);

    // PASO 3: Clic en Nuevo Almacén
    await narrate(page, c.modTitle, c.sNewWhTitle, c.sNewWhDesc, 2600);
    const newWhBtn = page.getByRole('button', { name: /Nuevo Almacén|New Warehouse|Almacén|Warehouse/i }).first();
    await newWhBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await highlightElement(page, newWhBtn, 800);
    await moveAndClick(page, newWhBtn, 1000);

    // PASO 4: Completar formulario en Sheet
    const sheet = page.locator('[role="dialog"]').first();
    await sheet.waitFor({ state: 'visible', timeout: 8000 });

    // Código
    await narrate(page, c.modTitle, c.sFillCodeTitle, c.sFillCodeDesc, 2600);
    const codeInput = sheet.locator('input#wh-code, input[name="code"]');
    await highlightElement(page, codeInput, 700);
    await moveAndType(page, codeInput, pack.whCode, 40);

    // Nombre
    await narrate(page, c.modTitle, c.sFillNameTitle, c.sFillNameDesc, 2600);
    const nameInput = sheet.locator('input#wh-name, input[name="name"]');
    await highlightElement(page, nameInput, 700);
    await moveAndType(page, nameInput, pack.whName, 35);

    // Descripción
    await narrate(page, c.modTitle, c.sFillDescTitle, c.sFillDescDesc, 2600);
    const descInput = sheet.locator('textarea#wh-desc, textarea[name="description"]');
    await highlightElement(page, descInput, 700);
    await moveAndType(page, descInput, pack.whDesc, 25);

    // PASO 5: Guardar Almacén
    await narrate(page, c.modTitle, c.sSubmitWhTitle, c.sSubmitWhDesc, 2600);
    const submitBtn = sheet.locator('button[type="submit"]');
    await highlightElement(page, submitBtn, 800);
    await moveAndClick(page, submitBtn, 1200);

    await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    await waitForPageReady(page, 1000);

    // PASO 6: Explorar Matriz de Almacenes
    await narrate(page, c.modTitle, c.sWhListTitle, c.sWhListDesc, 2800);
    const tableRow = page.locator('table tbody tr').first();
    if (await tableRow.isVisible().catch(() => false)) {
      await highlightElement(page, tableRow, 1000);
    }

    const lastRow = page.locator('table tbody tr').last();
    if (await lastRow.isVisible().catch(() => false)) {
      await highlightElement(page, lastRow, 1000);
    }

    // PASO 7: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `almacenes-bodegas-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 05A — Almacenes y Bodegas Operativas (ES / EN)', () => {
  test.setTimeout(300_000);

  test('almacenes-bodegas-es', async ({ browser }) => {
    await runWarehouseTutorial(browser, 'es');
  });

  test('almacenes-bodegas-en', async ({ browser }) => {
    await runWarehouseTutorial(browser, 'en');
  });
});
