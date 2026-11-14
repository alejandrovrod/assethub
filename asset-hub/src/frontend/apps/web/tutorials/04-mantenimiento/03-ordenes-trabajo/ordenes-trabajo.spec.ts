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
  '../../../../learning-hub/public/videos/04-mantenimiento/03-ordenes-trabajo',
);
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-04d');

interface CopyPack {
  modTitle: string;
  sLangTitle: string;
  sLangDesc: string;
  sIntroTitle: string;
  sIntroDesc: string;
  sNewOrderTitle: string;
  sNewOrderDesc: string;
  sFillOrderTitle: string;
  sFillOrderDesc: string;
  sSelectOrderTitle: string;
  sSelectOrderDesc: string;
  sOrderDetailTitle: string;
  sOrderDetailDesc: string;
  sLifecycleActionsTitle: string;
  sLifecycleActionsDesc: string;
  sMaterialsEditorTitle: string;
  sMaterialsEditorDesc: string;
  sOrderTasksTitle: string;
  sOrderTasksDesc: string;
}

const DATA_BY_LANG: Record<
  Lang,
  {
    orderId: string;
    orderCode: string;
    orderTitle: string;
    orderDesc: string;
    copy: CopyPack;
  }
> = {
  es: {
    orderId: 'ord-2026-0042',
    orderCode: 'OT-2026-0042',
    orderTitle: 'Sustitución de Rodamientos y Calibración de Husillo',
    orderDesc: 'Orden de trabajo correctiva originada por la alarma de sobrecalentamiento y holgura en el Torno CNC Mazak.',
    copy: {
      modTitle: 'Mantenimiento — Órdenes de Trabajo (OT Correctiva)',
      sLangTitle: 'Demostración Multilingüe de la Plataforma',
      sLangDesc: 'Flujo completo de emisión, gestión de repuestos y ciclo de vida de Órdenes de Trabajo.',
      sIntroTitle: 'Bandeja de Órdenes de Trabajo (/maintenance/orders)',
      sIntroDesc: 'Supervisión de órdenes preventivas y correctivas, estados operativos y prioridades de planta.',
      sNewOrderTitle: 'Creación de Nueva Orden de Trabajo',
      sNewOrderDesc: 'Abrimos el formulario de registro para vincular el activo afectado y la incidencia reportada.',
      sFillOrderTitle: 'Captura de Parámetros de la OT',
      sFillOrderDesc: 'Definimos título, criticidad, tipo correctivo y generación automática del checklist de tareas.',
      sSelectOrderTitle: 'Selección de la Orden en el Listado',
      sSelectOrderDesc: 'Elegimos la orden recién creada para acceder a su panel de gestión detallado.',
      sOrderDetailTitle: 'Panel de Control de la Orden de Trabajo',
      sOrderDetailDesc: 'Revisamos la vinculación con el activo CNC, fechas programadas y trazabilidad con la incidencia.',
      sLifecycleActionsTitle: 'Transiciones de Estado de la Orden',
      sLifecycleActionsDesc: 'El flujo permite avanzar ordenadamente: Borrador → Aprobada → Programada → En Progreso → Verificada.',
      sMaterialsEditorTitle: 'Gestión y Reserva de Materiales / BOM',
      sMaterialsEditorDesc: 'Asignamos repuestos necesarios desde el almacén (juego de rodamientos de precisión SKF y lubricante sintético).',
      sOrderTasksTitle: 'Tareas Hijas y Validación de Cuadrilla',
      sOrderTasksDesc: 'Desglose de tareas técnicas asignadas a los electromecánicos y control de cumplimiento para el cierre de la OT.',
    },
  },
  en: {
    orderId: 'ord-2026-0042',
    orderCode: 'WO-2026-0042',
    orderTitle: 'Spindle Bearing Replacement & Dynamic Balancing',
    orderDesc: 'Corrective work order triggered by overheating and vibration alarms on the Mazak CNC Lathe.',
    copy: {
      modTitle: 'Maintenance — Corrective Work Orders',
      sLangTitle: 'Multilingual Platform Walkthrough',
      sLangDesc: 'End-to-end workflow covering work order generation, materials planning, and lifecycle stages.',
      sIntroTitle: 'Work Orders Dashboard (/maintenance/orders)',
      sIntroDesc: 'Plant overview tracking corrective and preventive orders, execution statuses, and schedules.',
      sNewOrderTitle: 'Creating a New Work Order',
      sNewOrderDesc: 'Opening the work order sheet to link the parent machine asset and its open incident ticket.',
      sFillOrderTitle: 'Entering Work Order Parameters',
      sFillOrderDesc: 'Specifying work order scope, corrective category, priority squad, and automated task checklists.',
      sSelectOrderTitle: 'Selecting the Order from the Roster',
      sSelectOrderDesc: 'Opening the newly issued work order into the split-pane management console.',
      sOrderDetailTitle: 'Work Order Operations Console',
      sOrderDetailDesc: 'Inspecting CNC asset linkage, scheduled downtime windows, and source incident provenance.',
      sLifecycleActionsTitle: 'Work Order Lifecycle State Transitions',
      sLifecycleActionsDesc: 'Controlled phase gating: Draft → Approved → Scheduled → In Progress → Done → Verified.',
      sMaterialsEditorTitle: 'BOM Parts Reservation & Allocation',
      sMaterialsEditorDesc: 'Reserving warehouse spare parts (SKF precision angular bearing kit and synthetic grease cartridge).',
      sOrderTasksTitle: 'Child Tasks & Squad Completion Checklist',
      sOrderTasksDesc: 'Granular electromechanical task checklist tracking individual execution before formal work sign-off.',
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

async function runMaintenanceOrderTutorial(browser: Browser, lang: Lang): Promise<void> {
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

  let currentOrderState = 'draft';

  try {
    // 1. Mock listado de órdenes de trabajo
    await page.route('**/api/v1/maintenance-orders*', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: pack.orderId }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: pack.orderId,
              code: pack.orderCode,
              title: pack.orderTitle,
              kind: 'corrective',
              state: currentOrderState,
              assetId: 'ast-cnc-001',
              assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
              scheduledStart: '2026-02-12T14:00:00Z',
              scheduledEnd: '2026-02-12T18:00:00Z',
              completedTasksCount: 0,
              totalTasksCount: 2,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 10,
        }),
      });
    });

    // 2. Mock detalle de orden
    await page.route(`**/api/v1/maintenance-orders/${pack.orderId}*`, async (route) => {
      if (route.request().method() === 'PATCH' || route.request().method() === 'PUT') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: pack.orderId, state: currentOrderState }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: pack.orderId,
          code: pack.orderCode,
          title: pack.orderTitle,
          description: pack.orderDesc,
          kind: 'corrective',
          state: currentOrderState,
          assetId: 'ast-cnc-001',
          assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
          incidentId: 'inc-2026-0099',
          incidentTitle: lang === 'es' ? 'Alarma de Sobrecalentamiento en Husillo Principal' : 'Overheating Alarm on Primary Spindle',
          scheduledStart: '2026-02-12T14:00:00Z',
          scheduledEnd: '2026-02-12T18:00:00Z',
          allowedTransitions: ['approved', 'cancelled'],
          parts: [
            {
              id: 'prt-01',
              partName: lang === 'es' ? 'Kit Rodamientos de Contacto Angular SKF 7014' : 'SKF 7014 Angular Contact Bearing Kit',
              quantityRequired: 2,
              quantityUsed: 0,
              unitCost: 450.0,
            },
          ],
        }),
      });
    });

    // 3. Mock repuestos de la orden
    await page.route(`**/api/v1/maintenance-orders/${pack.orderId}/parts*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'prt-01',
            partName: lang === 'es' ? 'Kit Rodamientos SKF 7014' : 'SKF 7014 Bearing Kit',
            quantityRequired: 2,
            quantityUsed: 0,
            unitCost: 450.0,
          },
        ]),
      });
    });

    // 4. Mock tareas de la orden
    await page.route(`**/api/v1/work-tasks*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'tsk-01',
              title: lang === 'es' ? 'Desmontaje de Carcasa y Extracción de Husillo' : 'Housing Disassembly & Spindle Pull',
              state: 'todo',
              priority: 'high',
            },
            {
              id: 'tsk-02',
              title: lang === 'es' ? 'Montaje de Rodamientos Nuevos y Verificación con Comparador' : 'New Bearing Mount & Dial Indicator Runout Test',
              state: 'todo',
              priority: 'high',
            },
          ],
          totalCount: 2,
        }),
      });
    });

    // PASO 1: Navegar a /maintenance/orders
    await page.goto(`${ATLAS_BASE_URL}/maintenance/orders`, { waitUntil: 'load' });
    await waitForPageReady(page, 1200);

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

    // PASO 2: Intro de la consola de Órdenes de Trabajo
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2600);

    // PASO 3: Abrir Formulario de Nueva Orden
    await narrate(page, c.modTitle, c.sNewOrderTitle, c.sNewOrderDesc, 2500);
    const newOrderBtn = page.locator('button:has(svg.lucide-plus)').first();
    await highlightElement(page, newOrderBtn, 700);
    await moveAndClick(page, newOrderBtn, 800);

    // PASO 4: Completar formulario lateral de OT
    const sheet = page.getByRole('dialog').first();
    await sheet.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sFillOrderTitle, c.sFillOrderDesc, 2600);
    const titleInput = sheet.locator('input[name="title"]');
    await titleInput.waitFor({ state: 'visible', timeout: 8000 });
    await highlightElement(page, titleInput, 600);
    await moveAndType(page, titleInput, pack.orderTitle, 35);

    const descInput = sheet.locator('textarea[name="description"]');
    if (await descInput.isVisible().catch(() => false)) {
      await moveAndType(page, descInput, pack.orderDesc, 25);
    }

    const saveOrderBtn = sheet.getByRole('button', { name: /Crear|Create|Guardar|Save/i }).first();
    if (await saveOrderBtn.isVisible().catch(() => false)) {
      await highlightElement(page, saveOrderBtn, 700);
      await moveAndClick(page, saveOrderBtn, 1000);
    }

    try {
      await sheet.waitFor({ state: 'hidden', timeout: 4000 });
    } catch {
      const closeBtn = sheet.getByRole('button', { name: /Cancelar|Cancel/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    }
    await waitForPageReady(page, 900);

    // PASO 5: Seleccionar la fila de la Orden de Trabajo
    await narrate(page, c.modTitle, c.sSelectOrderTitle, c.sSelectOrderDesc, 2600);
    const orderRow = page.locator('table tbody tr').first();
    await highlightElement(page, orderRow, 800);
    await moveAndClick(page, orderRow, 1000);
    await waitForPageReady(page, 900);

    // PASO 6: Detalle de la Orden de Trabajo
    await narrate(page, c.modTitle, c.sOrderDetailTitle, c.sOrderDetailDesc, 2800);
    const detailCard = page.locator('.col-span-12, [class*="detail"]').first();
    if (await detailCard.isVisible().catch(() => false)) {
      await highlightElement(page, detailCard, 900);
    }

    // PASO 7: Acciones del Ciclo de Vida (Aprobar Orden)
    await narrate(page, c.modTitle, c.sLifecycleActionsTitle, c.sLifecycleActionsDesc, 2800);
    const approveBtn = page.getByRole('button', { name: /Aprobar|Approve/i }).first();
    if (await approveBtn.isVisible().catch(() => false)) {
      await highlightElement(page, approveBtn, 700);
      await moveAndClick(page, approveBtn, 900);
      currentOrderState = 'approved';
      await waitForPageReady(page, 900);
    }

    // PASO 8: Sección de Materiales y Repuestos
    await narrate(page, c.modTitle, c.sMaterialsEditorTitle, c.sMaterialsEditorDesc, 2800);
    const partsSection = page.locator('text=Materiales, text=Parts, text=Repuestos').first();
    if (await partsSection.isVisible().catch(() => false)) {
      await highlightElement(page, partsSection, 1000);
    }

    // PASO 9: Tareas de la Orden de Trabajo
    await narrate(page, c.modTitle, c.sOrderTasksTitle, c.sOrderTasksDesc, 2800);
    const tasksWidget = page.locator('text=Tareas, text=Tasks').first();
    if (await tasksWidget.isVisible().catch(() => false)) {
      await highlightElement(page, tasksWidget, 1000);
    }

    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `ordenes-trabajo-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 04D — Órdenes de Trabajo (OT Correctiva) (ES / EN)', () => {
  test.setTimeout(300_000);

  test('ordenes-trabajo-es', async ({ browser }) => {
    await runMaintenanceOrderTutorial(browser, 'es');
  });

  test('ordenes-trabajo-en', async ({ browser }) => {
    await runMaintenanceOrderTutorial(browser, 'en');
  });
});

