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
  '../../../../learning-hub/public/videos/04-mantenimiento/02-gestion-incidencias',
);
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-04c');

interface CopyPack {
  modTitle: string;
  sLangTitle: string;
  sLangDesc: string;
  sIntroTitle: string;
  sIntroDesc: string;
  sFilterSearchTitle: string;
  sFilterSearchDesc: string;
  sSelectIncidentTitle: string;
  sSelectIncidentDesc: string;
  sIncidentHeaderTitle: string;
  sIncidentHeaderDesc: string;
  sDynamicSchemaTitle: string;
  sDynamicSchemaDesc: string;
  sTimelineAuditTitle: string;
  sTimelineAuditDesc: string;
  sTransitionTriajeTitle: string;
  sTransitionTriajeDesc: string;
  sLinkedTasksTitle: string;
  sLinkedTasksDesc: string;
}

const DATA_BY_LANG: Record<
  Lang,
  {
    searchTerm: string;
    incidentId: string;
    incidentCode: string;
    incidentTitle: string;
    copy: CopyPack;
  }
> = {
  es: {
    searchTerm: 'Husillo',
    incidentId: 'inc-2026-0099',
    incidentCode: 'INC-2026-0099',
    incidentTitle: 'Alarma de Sobrecalentamiento en Husillo Principal',
    copy: {
      modTitle: 'Mantenimiento — Gestión y Triaje de Incidencias',
      sLangTitle: 'Demostración Multilingüe de la Plataforma',
      sLangDesc: 'Navegación completa del centro de gestión y ciclo de vida de contingencias operativas.',
      sIntroTitle: 'Bandeja Principal de Incidencias (/maintenance/incidents)',
      sIntroDesc: 'Consola unificada para supervisión, filtrado por criticidad y diagnóstico de fallas activas.',
      sFilterSearchTitle: 'Búsqueda Inteligente y Filtros por Atributo',
      sFilterSearchDesc: 'Localizamos incidencias asociadas a componentes mecánicos y anomalías térmicas en planta.',
      sSelectIncidentTitle: 'Selección de la Incidencia Generada por el Activo',
      sSelectIncidentDesc: 'Abrimos la ficha técnica de la contingencia para iniciar la fase de diagnóstico y triaje.',
      sIncidentHeaderTitle: 'Encabezado Operativo y Severidad',
      sIncidentHeaderDesc: 'Visualizamos el activo afectado (Torno CNC Mazak), el estado actual y el código de trazabilidad.',
      sDynamicSchemaTitle: 'Atributos Dinámicos de la Avería',
      sDynamicSchemaDesc: 'Revisamos la telemetría capturada según el esquema de la plantilla (vibración, temperatura y síntomas).',
      sTimelineAuditTitle: 'Bitácora y Línea de Tiempo de Eventos',
      sTimelineAuditDesc: 'Cada transición, cambio de estado y nota técnica queda registrada cronológicamente con firma digital.',
      sTransitionTriajeTitle: 'Transición de Estado: Diagnóstico / En Análisis',
      sTransitionTriajeDesc: 'Avanzamos el ciclo de vida de la incidencia para formalizar el triaje del equipo de electromecánica.',
      sLinkedTasksTitle: 'Tareas de Intervención Vinculadas',
      sLinkedTasksDesc: 'El widget integrado permite crear y coordinar tareas de inspección directa previas a la orden mayor.',
    },
  },
  en: {
    searchTerm: 'Spindle',
    incidentId: 'inc-2026-0099',
    incidentCode: 'INC-2026-0099',
    incidentTitle: 'Overheating Alarm on Primary Spindle',
    copy: {
      modTitle: 'Maintenance — Incident Triage & Resolution',
      sLangTitle: 'Multilingual Platform Walkthrough',
      sLangDesc: 'Comprehensive tour of the plant incident triage console and contingency workflows.',
      sIntroTitle: 'Incident Management Center (/maintenance/incidents)',
      sIntroDesc: 'Centralized workspace for real-time monitoring, priority filtering, and diagnosis.',
      sFilterSearchTitle: 'Smart Search & Attribute Facets',
      sFilterSearchDesc: 'Filtering machinery tickets by failure mode, asset class, and vibration diagnostics.',
      sSelectIncidentTitle: 'Opening Asset-Originated Incident',
      sSelectIncidentDesc: 'Entering the technical contingency sheet to start diagnosis and squad triage.',
      sIncidentHeaderTitle: 'Operational Overview & Severity',
      sIncidentHeaderDesc: 'Inspect the parent asset (Mazak CNC Lathe), current lifecycle state, and tracking badge.',
      sDynamicSchemaTitle: 'Dynamic Schema Diagnostic Inputs',
      sDynamicSchemaDesc: 'Telemetry and operational parameters gathered via template schema (RMS vibration, thermal logs).',
      sTimelineAuditTitle: 'Event Log & State Audit Trail',
      sTimelineAuditDesc: 'Chronological event record documenting transitions, technical remarks, and user sign-offs.',
      sTransitionTriajeTitle: 'Lifecycle Transition: In Triage / Under Diagnosis',
      sTransitionTriajeDesc: 'Advancing incident lifecycle to lock the ticket into active electromechanical troubleshooting.',
      sLinkedTasksTitle: 'Direct Diagnostic Tasks',
      sLinkedTasksDesc: 'Embedded widget to delegate immediate diagnostic checklists prior to comprehensive work orders.',
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

async function runIncidentManagementTutorial(browser: Browser, lang: Lang): Promise<void> {
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

  let currentIncidentState = lang === 'es' ? 'Reportada' : 'Reported';
  const inDiagnosisState = lang === 'es' ? 'En Diagnóstico' : 'In Diagnosis';

  try {
    // 1. Mock de búsqueda de incidencias
    await page.route('**/api/v1/incidents/search*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: pack.incidentId,
              code: pack.incidentCode,
              title: pack.incidentTitle,
              assetId: 'ast-cnc-001',
              assetCode: 'CNC-01',
              assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
              workflowTemplateId: 'wf-001',
              workflowTemplateName: lang === 'es' ? 'Falla Mecánica de Husillo' : 'Spindle Mechanical Breakdown',
              state: currentIncidentState,
              severity: 'High',
              reportedAt: '2026-02-12T09:30:00Z',
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 10,
        }),
      });
    });

    // 2. Mock de detalle de la incidencia
    await page.route(`**/api/v1/incidents/${pack.incidentId}`, async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'POST') {
        currentIncidentState = inDiagnosisState;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: pack.incidentId,
            state: currentIncidentState,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: pack.incidentId,
          code: pack.incidentCode,
          title: pack.incidentTitle,
          description: lang === 'es'
            ? 'Sensor térmico superó 85°C durante desbaste en husillo principal. Requiere análisis de rodamiento y vibración.'
            : 'Thermal sensor exceeded 85°C threshold during heavy roughing pass. Requires bearing and vibration analysis.',
          assetId: 'ast-cnc-001',
          assetCode: 'CNC-01',
          assetName: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
          workflowTemplateId: 'wf-001',
          state: currentIncidentState,
          reportedAt: '2026-02-12T09:30:00Z',
          etag: 'W/"etag-incident-1"',
          propertiesJson: JSON.stringify({
            vibrationLevel: '4.8 mm/s RMS',
            oilTemperature: '88°C',
            operatingRpm: '3500 RPM',
          }),
        }),
      });
    });

    // 3. Mock de plantilla con máquina de estados de la incidencia
    await page.route('**/api/v1/workflow-templates/wf-001*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'wf-001',
          code: 'INC-TPL-SPINDLE',
          name: lang === 'es' ? 'Falla Mecánica de Husillo' : 'Spindle Mechanical Breakdown',
          schemaJson: JSON.stringify({
            type: 'object',
            properties: {
              vibrationLevel: {
                type: 'string',
                title: lang === 'es' ? 'Nivel de Vibración (RMS)' : 'Vibration Level (RMS)',
              },
              oilTemperature: {
                type: 'string',
                title: lang === 'es' ? 'Temperatura de Aceite' : 'Oil Temperature',
              },
              operatingRpm: {
                type: 'string',
                title: lang === 'es' ? 'RPM de Operación' : 'Operating RPM',
              },
            },
          }),
          lifecycleStates: JSON.stringify({
            states: {
              [currentIncidentState]: { color: '#ef4444' },
              [inDiagnosisState]: { color: '#f59e0b' },
              [lang === 'es' ? 'Resuelta' : 'Resolved']: { color: '#10b981', isTerminal: true },
            },
            transitions: {
              [currentIncidentState]: [inDiagnosisState],
              [inDiagnosisState]: [lang === 'es' ? 'Resuelta' : 'Resolved'],
            },
          }),
        }),
      });
    });

    // 4. Mock timeline de la incidencia
    await page.route(`**/api/v1/incidents/${pack.incidentId}/timeline*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'ev-1',
            eventType: lang === 'es' ? 'Reporte Inicial de Incidencia' : 'Initial Incident Report',
            at: '2026-02-12T09:30:00Z',
            notes: lang === 'es' ? 'Incidencia disparada automáticamente por transición de estado del Torno CNC-01.' : 'Incident automatically triggered by CNC-01 asset state machine transition.',
            fromState: null,
            toState: currentIncidentState,
            userId: '00000000-0000-0000-0000-000000000000',
          },
          {
            id: 'ev-2',
            eventType: lang === 'es' ? 'Triaje Electromecánico' : 'Electromechanical Triage',
            at: '2026-02-12T09:45:00Z',
            notes: lang === 'es' ? 'Cuadrilla de turno asignada para termografía y medición de juego axial.' : 'Shift squad assigned for thermography and axial play testing.',
            fromState: currentIncidentState,
            toState: inDiagnosisState,
            userId: 'rmendez@atlas-industrial.com',
          },
        ]),
      });
    });

    // 5. Mock de tareas vinculadas
    await page.route(`**/api/v1/incidents/${pack.incidentId}/tasks*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'tsk-001',
              title: lang === 'es' ? 'Inspección de Baleros y Holgura' : 'Bearing & Clearance Inspection',
              state: 'in_progress',
              priority: 'high',
            },
          ],
        }),
      });
    });

    // PASO 1: Navegar a /maintenance/incidents
    await page.goto(`${ATLAS_BASE_URL}/maintenance/incidents`, { waitUntil: 'load' });
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

    // PASO 2: Intro de la consola de incidencias
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2600);

    // PASO 3: Búsqueda y filtrado
    await narrate(page, c.modTitle, c.sFilterSearchTitle, c.sFilterSearchDesc, 2400);
    const searchInput = page.locator('input[placeholder*="Buscar"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await highlightElement(page, searchInput, 700);
      await moveAndType(page, searchInput, pack.searchTerm, 40);
      await waitForPageReady(page, 800);
    }

    // PASO 4: Selección de la fila de incidencia
    await narrate(page, c.modTitle, c.sSelectIncidentTitle, c.sSelectIncidentDesc, 2600);
    const incidentRow = page.locator('table tbody tr').first();
    await highlightElement(page, incidentRow, 800);

    const viewBtn = incidentRow.locator('button:has(svg.lucide-eye), button').last();
    if (await viewBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, viewBtn, 1000);
    } else {
      await moveAndClick(page, incidentRow, 1000);
    }

    // PASO 5: Ficha técnica / Encabezado de la Incidencia
    await waitForPageReady(page, 1200);
    await narrate(page, c.modTitle, c.sIncidentHeaderTitle, c.sIncidentHeaderDesc, 2800);
    const headerTitle = page.locator('h1, h2, [class*="font-bold"]').filter({ hasText: /INC-2026|Husillo|Spindle/i }).first();
    if (await headerTitle.isVisible().catch(() => false)) {
      await highlightElement(page, headerTitle, 900);
    }

    // PASO 6: Atributos Dinámicos
    await narrate(page, c.modTitle, c.sDynamicSchemaTitle, c.sDynamicSchemaDesc, 2800);
    const dynamicCard = page.locator('text=Atributos, text=Attributes, text=Información Específica, text=Specific Attributes').first();
    if (await dynamicCard.isVisible().catch(() => false)) {
      await highlightElement(page, dynamicCard, 1000);
    }

    // PASO 7: Pestaña Timeline / Bitácora
    await narrate(page, c.modTitle, c.sTimelineAuditTitle, c.sTimelineAuditDesc, 2800);
    const tabTimeline = page.locator('button[role="tab"]').filter({ hasText: /Bitácora|Timeline|Historial/i }).first();
    if (await tabTimeline.isVisible().catch(() => false)) {
      await highlightElement(page, tabTimeline, 700);
      await moveAndClick(page, tabTimeline, 900);
      await waitForPageReady(page, 800);
    }

    // PASO 8: Transición de Estado de la Incidencia (Triaje)
    await narrate(page, c.modTitle, c.sTransitionTriajeTitle, c.sTransitionTriajeDesc, 2800);
    const transitionBtn = page.locator('button').filter({ hasText: new RegExp(inDiagnosisState, 'i') }).first();
    if (await transitionBtn.isVisible().catch(() => false)) {
      await highlightElement(page, transitionBtn, 800);
      await moveAndClick(page, transitionBtn, 1000);
      await waitForPageReady(page, 900);
    }

    // PASO 9: Tareas Técnicas Vinculadas
    await narrate(page, c.modTitle, c.sLinkedTasksTitle, c.sLinkedTasksDesc, 2800);
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
      const finalFileName = `gestion-incidencias-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 04C — Gestión, Diagnóstico y Triaje de Incidencias (ES / EN)', () => {
  test.setTimeout(300_000);

  test('gestion-incidencias-es', async ({ browser }) => {
    await runIncidentManagementTutorial(browser, 'es');
  });

  test('gestion-incidencias-en', async ({ browser }) => {
    await runIncidentManagementTutorial(browser, 'en');
  });
});
