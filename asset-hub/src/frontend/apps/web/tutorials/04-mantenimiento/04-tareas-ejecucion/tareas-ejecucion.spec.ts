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
  '../../../../learning-hub/public/videos/04-mantenimiento/04-tareas-ejecucion',
);
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-04e');

interface CopyPack {
  modTitle: string;
  sLangTitle: string;
  sLangDesc: string;
  sIntroTitle: string;
  sIntroDesc: string;
  sViewToggleTitle: string;
  sViewToggleDesc: string;
  sKanbanColumnsTitle: string;
  sKanbanColumnsDesc: string;
  sTaskCardTitle: string;
  sTaskCardDesc: string;
  sTaskDetailTitle: string;
  sTaskDetailDesc: string;
  sTaskStateAdvanceTitle: string;
  sTaskStateAdvanceDesc: string;
  sCommentsAuditTitle: string;
  sCommentsAuditDesc: string;
}

const DATA_BY_LANG: Record<
  Lang,
  {
    taskId: string;
    taskTitle: string;
    taskComment: string;
    copy: CopyPack;
  }
> = {
  es: {
    taskId: 'tsk-001',
    taskTitle: 'Desmontaje de Carcasa y Extracción de Husillo',
    taskComment: 'Rodamientos desmontados. Se observan marcas de picadura térmica en la pista interna.',
    copy: {
      modTitle: 'Mantenimiento — Tareas Técnicas y Ejecución en Planta',
      sLangTitle: 'Demostración Multilingüe de la Plataforma',
      sLangDesc: 'Tablero operativo de tareas técnicas, control de ejecución y trazabilidad de cuadrillas.',
      sIntroTitle: 'Bandeja de Tareas Técnicas (/maintenance/tasks)',
      sIntroDesc: 'Espacio de trabajo para los electromecánicos y líderes de cuadrilla con vistas Lista y Kanban.',
      sViewToggleTitle: 'Alternancia de Visualización: Lista y Kanban',
      sViewToggleDesc: 'Cambiamos a la vista Kanban para supervisar el flujo de trabajo ágil por columnas de estado.',
      sKanbanColumnsTitle: 'Columnas de Estado y Flujo Operativo',
      sKanbanColumnsDesc: 'Flujo visual: Por Hacer (Todo) → En Progreso → Pausada → Hecha (Done) → Retrabajo.',
      sTaskCardTitle: 'Inspección de la Tarjeta de Tarea Técnica',
      sTaskCardDesc: 'Visualizamos la tarea vinculada a la OT del Torno CNC con prioridad alta y responsable asignado.',
      sTaskDetailTitle: 'Ficha y Panel de Ejecución de la Tarea',
      sTaskDetailDesc: 'Revisamos descripción, checklists, orden de trabajo padre y activo origen de la contingencia.',
      sTaskStateAdvanceTitle: 'Avance de Estado Operativo de la Tarea',
      sTaskStateAdvanceDesc: 'Avanzamos la tarea de "Por Hacer" a "En Progreso" registrando el inicio de los trabajos.',
      sCommentsAuditTitle: 'Bitácora de Campo y Comentarios Técnicos',
      sCommentsAuditDesc: 'El operario ingresa observaciones de desmontaje y hallazgos mecánicos directamente en la bitácora.',
    },
  },
  en: {
    taskId: 'tsk-001',
    taskTitle: 'Housing Disassembly & Spindle Pull',
    taskComment: 'Bearings removed. Thermal pitting observed along inner raceway.',
    copy: {
      modTitle: 'Maintenance — Work Tasks & Field Execution',
      sLangTitle: 'Multilingual Platform Walkthrough',
      sLangDesc: 'Hands-on task board covering technician dispatch, kanban progression, and field notes.',
      sIntroTitle: 'Work Tasks Operations Center (/maintenance/tasks)',
      sIntroDesc: 'Operational dispatch hub for maintenance squads with list and kanban workflow views.',
      sViewToggleTitle: 'View Switcher: Table List & Visual Kanban',
      sViewToggleDesc: 'Toggling to visual Kanban view to monitor live field workload across stage columns.',
      sKanbanColumnsTitle: 'Kanban Stages & Workflow Pipeline',
      sKanbanColumnsDesc: 'Pipeline stages: To Do → In Progress → Paused → Done → Rework.',
      sTaskCardTitle: 'Inspecting Technical Task Card',
      sTaskCardDesc: 'Reviewing CNC lathe corrective task with high priority flag and assigned technician.',
      sTaskDetailTitle: 'Task Technical Execution Drawer',
      sTaskDetailDesc: 'Examining failure checklists, parent work order linkage, and shop-floor asset context.',
      sTaskStateAdvanceTitle: 'Advancing Technical Progress State',
      sTaskStateAdvanceDesc: 'Moving task from "To Do" to "In Progress" to formally log shop floor labor start.',
      sCommentsAuditTitle: 'Field Audit Log & Shift Handover Notes',
      sCommentsAuditDesc: 'Technicians log disassembly findings and inspection remarks directly into the audit stream.',
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

async function runWorkTaskTutorial(browser: Browser, lang: Lang): Promise<void> {
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

  let currentTaskState = 'todo';

  try {
    // 1. Mock listado de tareas
    await page.route('**/api/v1/work-tasks*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: pack.taskId,
              code: 'TSK-001',
              title: pack.taskTitle,
              state: currentTaskState,
              priority: 'high',
              assignedEmployeeName: 'Carlos Vega (Electromecánico)',
              assetId: 'ast-cnc-001',
              assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
              maintenanceOrderId: 'ord-2026-0042',
              maintenanceOrderTitle: lang === 'es' ? 'Sustitución de Rodamientos de Husillo' : 'Spindle Bearing Replacement',
              dueDate: '2026-02-12T18:00:00Z',
            },
            {
              id: 'tsk-002',
              code: 'TSK-002',
              title: lang === 'es' ? 'Montaje y Calibración con Comparador' : 'Mounting & Dial Runout Balancing',
              state: 'todo',
              priority: 'high',
              assignedEmployeeName: 'Carlos Vega (Electromecánico)',
              assetId: 'ast-cnc-001',
              assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
              maintenanceOrderId: 'ord-2026-0042',
              maintenanceOrderTitle: lang === 'es' ? 'Sustitución de Rodamientos de Husillo' : 'Spindle Bearing Replacement',
              dueDate: '2026-02-12T20:00:00Z',
            },
          ],
          totalCount: 2,
          page: 1,
          pageSize: 20,
        }),
      });
    });

    // 2. Mock detalle de tarea
    await page.route(`**/api/v1/work-tasks/${pack.taskId}*`, async (route) => {
      if (route.request().method() === 'PATCH' || route.request().method() === 'PUT') {
        currentTaskState = 'in_progress';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: pack.taskId, state: currentTaskState }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: pack.taskId,
          code: 'TSK-001',
          title: pack.taskTitle,
          description: lang === 'es'
            ? 'Proceder con el desmontaje de la carcasa frontal del cabezal, retirar poleas y extraer conjunto de rodamientos dañados.'
            : 'Proceed with front spindle headstock housing disassembly, detach timing pulleys, and extract damaged bearing set.',
          state: currentTaskState,
          priority: 'high',
          assignedEmployeeName: 'Carlos Vega (Electromecánico)',
          assetId: 'ast-cnc-001',
          assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
          maintenanceOrderId: 'ord-2026-0042',
          maintenanceOrderTitle: lang === 'es' ? 'Sustitución de Rodamientos de Husillo' : 'Spindle Bearing Replacement',
          dueDate: '2026-02-12T18:00:00Z',
          allowedTransitions: ['in_progress', 'cancelled'],
        }),
      });
    });

    // 3. Mock comentarios de la tarea
    await page.route(`**/api/v1/work-tasks/${pack.taskId}/comments*`, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'cmt-01',
            text: pack.taskComment,
            authorName: 'Carlos Vega',
            createdAt: '2026-02-12T14:30:00Z',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'cmt-01',
            text: pack.taskComment,
            authorName: 'Carlos Vega',
            createdAt: '2026-02-12T14:30:00Z',
          },
        ]),
      });
    });

    // PASO 1: Navegar a /maintenance/tasks
    await page.goto(`${ATLAS_BASE_URL}/maintenance/tasks`, { waitUntil: 'load' });
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

    // PASO 2: Intro de la consola de tareas
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2600);

    // PASO 3: Alternar entre Lista y Kanban
    await narrate(page, c.modTitle, c.sViewToggleTitle, c.sViewToggleDesc, 2600);
    const kanbanTab = page.locator('button[role="tab"]').filter({ hasText: /Kanban/i }).first();
    if (await kanbanTab.isVisible().catch(() => false)) {
      await highlightElement(page, kanbanTab, 700);
      await moveAndClick(page, kanbanTab, 900);
      await waitForPageReady(page, 900);
    }

    // PASO 4: Columnas Kanban
    await narrate(page, c.modTitle, c.sKanbanColumnsTitle, c.sKanbanColumnsDesc, 2800);
    const kanbanBoard = page.locator('.grid, [class*="kanban"]').first();
    if (await kanbanBoard.isVisible().catch(() => false)) {
      await highlightElement(page, kanbanBoard, 1000);
    }

    // PASO 5: Tarjeta de Tarea
    await narrate(page, c.modTitle, c.sTaskCardTitle, c.sTaskCardDesc, 2600);
    const taskCard = page.locator('text=Desmontaje de Carcasa, text=Housing Disassembly').first();
    if (await taskCard.isVisible().catch(() => false)) {
      await highlightElement(page, taskCard, 800);
      await moveAndClick(page, taskCard, 1000);
    } else {
      const firstCard = page.locator('[class*="cursor-pointer"], .card').first();
      await moveAndClick(page, firstCard, 1000);
    }
    await waitForPageReady(page, 900);

    // PASO 6: Ficha y Panel de Ejecución de la Tarea
    await narrate(page, c.modTitle, c.sTaskDetailTitle, c.sTaskDetailDesc, 2800);
    const taskDetail = page.locator('.col-span-12, [class*="detail"]').first();
    if (await taskDetail.isVisible().catch(() => false)) {
      await highlightElement(page, taskDetail, 900);
    }

    // PASO 7: Avanzar Estado a "En Progreso"
    await narrate(page, c.modTitle, c.sTaskStateAdvanceTitle, c.sTaskStateAdvanceDesc, 2800);
    const startTaskBtn = page.getByRole('button', { name: /Iniciar|Start|En Progreso|In Progress/i }).first();
    if (await startTaskBtn.isVisible().catch(() => false)) {
      await highlightElement(page, startTaskBtn, 700);
      await moveAndClick(page, startTaskBtn, 900);
      currentTaskState = 'in_progress';
      await waitForPageReady(page, 900);
    }

    // PASO 8: Bitácora de Campo y Comentarios Técnicos
    await narrate(page, c.modTitle, c.sCommentsAuditTitle, c.sCommentsAuditDesc, 2800);
    const commentInput = page.locator('textarea[placeholder*="comentario"], textarea[placeholder*="comment"]').first();
    if (await commentInput.isVisible().catch(() => false)) {
      await highlightElement(page, commentInput, 600);
      await moveAndType(page, commentInput, pack.taskComment, 30);
      const postBtn = page.getByRole('button', { name: /Comentar|Comment|Enviar|Send/i }).first();
      if (await postBtn.isVisible().catch(() => false)) {
        await moveAndClick(page, postBtn, 800);
      }
    }

    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `tareas-ejecucion-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 04E — Tareas Técnicas y Ejecución en Planta (ES / EN)', () => {
  test.setTimeout(300_000);

  test('tareas-ejecucion-es', async ({ browser }) => {
    await runWorkTaskTutorial(browser, 'es');
  });

  test('tareas-ejecucion-en', async ({ browser }) => {
    await runWorkTaskTutorial(browser, 'en');
  });
});

