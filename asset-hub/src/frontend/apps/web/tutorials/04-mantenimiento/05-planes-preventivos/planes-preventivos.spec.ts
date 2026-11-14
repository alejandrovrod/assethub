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
  '../../../../learning-hub/public/videos/04-mantenimiento/05-planes-preventivos',
);
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-04f');

interface CopyPack {
  modTitle: string;
  sLangTitle: string;
  sLangDesc: string;
  sIntroTitle: string;
  sIntroDesc: string;
  sNewPlanTitle: string;
  sNewPlanDesc: string;
  sFillPlanTitle: string;
  sFillPlanDesc: string;
  sSelectPlanTitle: string;
  sSelectPlanDesc: string;
  sCalendarTabTitle: string;
  sCalendarTabDesc: string;
  sLogsTabTitle: string;
  sLogsTabDesc: string;
  sGeneratedTabTitle: string;
  sGeneratedTabDesc: string;
  sRunManualTitle: string;
  sRunManualDesc: string;
}

const DATA_BY_LANG: Record<
  Lang,
  {
    planId: string;
    planName: string;
    planDesc: string;
    copy: CopyPack;
  }
> = {
  es: {
    planId: 'prev-plan-001',
    planName: 'Plan Semanal de Lubricación y Chequeo de Husillo',
    planDesc: 'Inspección de nivel de fluido, chequeo de vibraciones y engrase de guías lineales en Torno CNC.',
    copy: {
      modTitle: 'Mantenimiento — Planes Preventivos y Recurrencia Cíclica',
      sLangTitle: 'Demostración Multilingüe de la Plataforma',
      sLangDesc: 'Configuración de planes preventivos automatizados, calendarios y generación de OTs recurrentes.',
      sIntroTitle: 'Bandeja de Planes Preventivos (/maintenance/preventive-plans)',
      sIntroDesc: 'Consola de gestión para programas de mantenimiento periódico por calendario y horómetro.',
      sNewPlanTitle: 'Creación de Nuevo Plan Preventivo',
      sNewPlanDesc: 'Configuramos un plan recurrente para activos individuales o por plantilla de maquinaria.',
      sFillPlanTitle: 'Parámetros del Plan y Frecuencia Cron',
      sFillPlanDesc: 'Definimos nombre, entidad generada (Orden de Trabajo o Tarea) y periodicidad semanal.',
      sSelectPlanTitle: 'Selección del Plan en la Matriz Operativa',
      sSelectPlanDesc: 'Abrimos el panel lateral de supervisión para consultar la planificación y bitácora del plan.',
      sCalendarTabTitle: 'Pestaña Calendario: Proyecciones Futuras',
      sCalendarTabDesc: 'El motor calcula automáticamente las próximas fechas de ejecución y paradas de planta.',
      sLogsTabTitle: 'Pestaña Bitácora: Historial de Disparos',
      sLogsTabDesc: 'Registro auditable de cada ejecución cíclica indicando éxito, timestamp y disparador.',
      sGeneratedTabTitle: 'Pestaña Generados: Órdenes y Tareas Emitidas',
      sGeneratedTabDesc: 'Trazabilidad directa con las Órdenes de Trabajo y Tareas Técnicas generadas por el plan.',
      sRunManualTitle: 'Ejecución Forzada / Disparo Manual',
      sRunManualDesc: 'Demostramos cómo un supervisor puede adelantar o forzar el ciclo de mantenimiento sin alterar el cron.',
    },
  },
  en: {
    planId: 'prev-plan-001',
    planName: 'Weekly Spindle Lubrication & Inspection Routine',
    planDesc: 'Weekly fluid check, bearing vibration baseline, and linear guideway greasing on CNC Lathe.',
    copy: {
      modTitle: 'Maintenance — Preventive Plans & Cyclic Scheduling',
      sLangTitle: 'Multilingual Platform Walkthrough',
      sLangDesc: 'Automated recurring maintenance routines, calendar projections, and triggered work orders.',
      sIntroTitle: 'Preventive Maintenance Console (/maintenance/preventive-plans)',
      sIntroDesc: 'Central command for recurring schedules, calendar cron frequencies, and batch plan dispatch.',
      sNewPlanTitle: 'Setting Up a Preventive Plan',
      sNewPlanDesc: 'Creating recurring preventive plans targeting specific assets or entire machine classes.',
      sFillPlanTitle: 'Plan Parameters & Cron Recurrence',
      sFillPlanDesc: 'Specifying schedule title, generated target entity (Work Order or Task), and weekly recurrence.',
      sSelectPlanTitle: 'Selecting the Active Plan',
      sSelectPlanDesc: 'Opening the right-hand inspection drawer to examine projections, logs, and linked outputs.',
      sCalendarTabTitle: 'Calendar Tab: Projected Scheduled Downtimes',
      sCalendarTabDesc: 'The system computes recurring maintenance windows across future shifts.',
      sLogsTabTitle: 'Execution Logs Tab: Trigger Provenance',
      sLogsTabDesc: 'Immutable chronological trace recording schedule runs, execution statuses, and timestamps.',
      sGeneratedTabTitle: 'Generated Items Tab: Work Orders & Tasks',
      sGeneratedTabDesc: 'Direct navigation links to work orders and technician tasks generated automatically.',
      sRunManualTitle: 'Manual Trigger & Cycle Execution',
      sRunManualDesc: 'Demonstrating supervisor override to immediately trigger a preventive run ahead of schedule.',
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

async function runPreventivePlanTutorial(browser: Browser, lang: Lang): Promise<void> {
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

  try {
    // 1. Mock listado de planes preventivos y detalle
    await page.route('**/api/v1/preventive-plans*', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'POST' && !url.includes('/evaluate') && !url.includes('/toggle')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: pack.planId, nextRunAt: '2026-02-16T08:00:00Z' }),
        });
      }
      if (url.includes('/logs')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'log-01',
              executedAt: '2026-02-09T08:00:00Z',
              status: 'Success',
              generatedCount: 1,
              notes: lang === 'es' ? 'OT-2026-0041 generada exitosamente' : 'WO-2026-0041 generated successfully',
            },
          ]),
        });
      }
      if (url.includes(`/${pack.planId}`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: pack.planId,
            name: pack.planName,
            description: pack.planDesc,
            targetType: 'Asset',
            assetId: 'ast-cnc-001',
            assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
            generatedEntityType: 'MaintenanceOrder',
            cronExpression: '0 0 * * 1',
            dueDateOffsetDays: 2,
            autoAssign: true,
            isActive: true,
            lastRunAt: '2026-02-09T08:00:00Z',
            nextRunAt: '2026-02-16T08:00:00Z',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: pack.planId,
              name: pack.planName,
              description: pack.planDesc,
              targetType: 'Asset',
              assetId: 'ast-cnc-001',
              assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
              generatedEntityType: 'MaintenanceOrder',
              cronExpression: '0 0 * * 1',
              dueDateOffsetDays: 2,
              autoAssign: true,
              isActive: true,
              lastRunAt: '2026-02-09T08:00:00Z',
              nextRunAt: '2026-02-16T08:00:00Z',
            },
          ],
        }),
      });
    });

    // 4. Mock elementos generados
    await page.route(`**/maintenance-orders*preventivePlanId=${pack.planId}*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'ord-prev-01',
              code: 'OT-2026-0041',
              title: lang === 'es' ? 'Mantenimiento Preventivo Semanal CNC-01' : 'Weekly CNC-01 Preventive Routine',
              state: 'scheduled',
              kind: 'preventive',
            },
          ],
          totalCount: 1,
        }),
      });
    });

    // PASO 1: Navegar a /maintenance/preventive-plans
    await page.goto(`${ATLAS_BASE_URL}/maintenance/preventive-plans`, { waitUntil: 'load' });
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

    // PASO 2: Intro de Planes Preventivos
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2600);

    // PASO 3: Abrir Formulario de Nuevo Plan
    await narrate(page, c.modTitle, c.sNewPlanTitle, c.sNewPlanDesc, 2500);
    const newPlanBtn = page.locator('button:has(svg.lucide-plus)').first();
    if (await newPlanBtn.isVisible().catch(() => false)) {
      await highlightElement(page, newPlanBtn, 700);
      await moveAndClick(page, newPlanBtn, 800);
    } else {
      const altBtn = page.getByRole('button', { name: /Nuevo|New|Crear|Create/i }).first();
      if (await altBtn.isVisible().catch(() => false)) {
        await highlightElement(page, altBtn, 700);
        await moveAndClick(page, altBtn, 800);
      }
    }

    // PASO 4: Completar formulario lateral de Plan Preventivo (si se abrió el Sheet)
    const sheet = page.locator('[role="dialog"], [data-slot="sheet-content"]').first();
    const isSheetOpen = await sheet.isVisible().catch(() => false);

    if (isSheetOpen) {
      await narrate(page, c.modTitle, c.sFillPlanTitle, c.sFillPlanDesc, 2600);
      const nameInput = sheet.locator('input[name="name"]');
      if (await nameInput.isVisible().catch(() => false)) {
        await highlightElement(page, nameInput, 600);
        await moveAndType(page, nameInput, pack.planName, 35);
      }

      const descInput = sheet.locator('textarea[name="description"]');
      if (await descInput.isVisible().catch(() => false)) {
        await moveAndType(page, descInput, pack.planDesc, 25);
      }

      const closeBtn = sheet.getByRole('button', { name: /Cancelar|Cancel/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await highlightElement(page, closeBtn, 500);
        await moveAndClick(page, closeBtn, 800);
      } else {
        await page.keyboard.press('Escape');
      }
      await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await waitForPageReady(page, 900);
    }

    // PASO 5: Seleccionar el Plan Preventivo de la lista
    await narrate(page, c.modTitle, c.sSelectPlanTitle, c.sSelectPlanDesc, 2600);
    const planRow = page.locator('table tbody tr').first();
    const isRowVisible = await planRow.isVisible({ timeout: 4000 }).catch(() => false);
    if (isRowVisible) {
      await highlightElement(page, planRow, 800);
      await moveAndClick(page, planRow, 1000);
      await waitForPageReady(page, 900);
    }

    // PASO 6: Pestaña Calendario
    await narrate(page, c.modTitle, c.sCalendarTabTitle, c.sCalendarTabDesc, 2800);
    const tabCalendar = page.locator('button[role="tab"]').filter({ hasText: /Calendario|Calendar/i }).first();
    if (await tabCalendar.isVisible().catch(() => false)) {
      await highlightElement(page, tabCalendar, 700);
      await moveAndClick(page, tabCalendar, 800);
      await waitForPageReady(page, 800);
    }

    // PASO 7: Pestaña Bitácora de Ejecución
    await narrate(page, c.modTitle, c.sLogsTabTitle, c.sLogsTabDesc, 2800);
    const tabLogs = page.locator('button[role="tab"]').filter({ hasText: /Bitácora|Timeline|Logs|Historial/i }).first();
    if (await tabLogs.isVisible().catch(() => false)) {
      await highlightElement(page, tabLogs, 700);
      await moveAndClick(page, tabLogs, 800);
      await waitForPageReady(page, 800);
    }

    // PASO 8: Pestaña Elementos Generados
    await narrate(page, c.modTitle, c.sGeneratedTabTitle, c.sGeneratedTabDesc, 2800);
    const tabGenerated = page.locator('button[role="tab"]').filter({ hasText: /Generad|Generated/i }).first();
    if (await tabGenerated.isVisible().catch(() => false)) {
      await highlightElement(page, tabGenerated, 700);
      await moveAndClick(page, tabGenerated, 800);
      await waitForPageReady(page, 800);
    }

    // PASO 9: Ejecución / Disparo Manual
    await narrate(page, c.modTitle, c.sRunManualTitle, c.sRunManualDesc, 2800);
    const executeBtn = page.locator('button:has(svg.lucide-play), button:has(svg.lucide-rotate-cw)').first();
    if (await executeBtn.isVisible().catch(() => false)) {
      await highlightElement(page, executeBtn, 800);
      await moveAndClick(page, executeBtn, 1000);
      await waitForPageReady(page, 800);
    }

    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `planes-preventivos-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 04F — Planes Preventivos y Recurrencia Cíclica (ES / EN)', () => {
  test.setTimeout(300_000);

  test('planes-preventivos-es', async ({ browser }) => {
    await runPreventivePlanTutorial(browser, 'es');
  });

  test('planes-preventivos-en', async ({ browser }) => {
    await runPreventivePlanTutorial(browser, 'en');
  });
});

