import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import {
  highlightElement,
  initTutorialOverlay,
  moveAndClick,
  narrate,
  saveNamedVideo,
  selectLanguageInUI,
  TEMP_VIDEOS_DIR,
  VIDEOS_OUTPUT_DIR,
  waitForPageReady,
} from '../../helpers/tutorial-recorder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ATLAS_BASE_URL = 'http://atlas-industrial.localhost:5173';
const ATLAS_ADMIN = {
  email: process.env.ATLAS_EMAIL ?? 'rmendez@atlas-industrial.com',
  password: process.env.ATLAS_PASSWORD ?? 'AtlasIndustrial2026!',
};

type Lang = 'es' | 'en';

interface TutorialData {
  copy: {
    modTitle: string;
    sLangTitle: string;
    sLangDesc: string;
    sIntroTitle: string;
    sIntroDesc: string;
    sOpenAssetTitle: string;
    sOpenAssetDesc: string;
    sTimelineTabTitle: string;
    sTimelineTabDesc: string;
    sLifecycleLogTitle: string;
    sLifecycleLogDesc: string;
    sDataTraceTitle: string;
    sDataTraceDesc: string;
    sAuditorTitle: string;
    sAuditorDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    copy: {
      modTitle: 'Gestión de Activos — Bitácora y Trazabilidad Histórica',
      sLangTitle: 'Demostración Multilenguaje',
      sLangDesc: 'Historial inmutable de auditoría, transiciones de estado, responsables y registros de datos.',
      sIntroTitle: 'Auditoría Continua y Trazabilidad',
      sIntroDesc: 'Cada intervención, cambio de estado y calibración sobre el equipo queda sellada criptográficamente.',
      sOpenAssetTitle: 'Acceso a la Ficha del Activo',
      sOpenAssetDesc: 'Abrimos la ficha técnica del Torno CNC para examinar su línea de tiempo operativa.',
      sTimelineTabTitle: 'Pestaña de Bitácora (Timeline)',
      sTimelineTabDesc: 'Cronología vertical con todas las transiciones del ciclo de vida y eventos relevantes del activo.',
      sLifecycleLogTitle: 'Registro de Transiciones de Ciclo de Vida',
      sLifecycleLogDesc: 'Inspeccionamos los saltos de estado: Alta > Calibración Inicial > Operativo > Mantenimiento.',
      sDataTraceTitle: 'Formularios y Parámetros Capturados',
      sDataTraceDesc: 'Al cambiar de estado, los datos obligatorios (técnico, horómetro, lecturas) quedan registrados.',
      sAuditorTitle: 'Cumplimiento Normativo ISO 55000',
      sAuditorDesc: 'La bitácora garantiza total trazabilidad para auditorías de calidad y confiabilidad operacional.',
    },
  },
  en: {
    copy: {
      modTitle: 'Asset Management — Audit Log & Historical Traceability',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Immutable audit trail, lifecycle transitions, responsible personnel, and telemetry captures.',
      sIntroTitle: 'Continuous Audit Trail & Traceability',
      sIntroDesc: 'Every technician intervention, lifecycle transition, and calibration event is timestamped.',
      sOpenAssetTitle: 'Accessing Equipment Record',
      sOpenAssetDesc: 'Opening the CNC Lathe technical sheet to review its complete operational lifecycle timeline.',
      sTimelineTabTitle: 'Activity Log & Timeline Tab',
      sTimelineTabDesc: 'Vertical chronogram tracking all lifecycle states, maintenance triggers, and historical events.',
      sLifecycleLogTitle: 'Lifecycle State Transitions Log',
      sLifecycleLogDesc: 'Inspecting chronological state changes: Created > Initial Calibration > Operative > In Maintenance.',
      sDataTraceTitle: 'Form Parameters & Telemetry Snapshots',
      sDataTraceDesc: 'During state handoffs, required transition fields (technician, hours meter, notes) are recorded.',
      sAuditorTitle: 'ISO 55000 Compliance & Regulatory Audit',
      sAuditorDesc: 'The timeline provides full provenance for plant safety audits and asset reliability reviews.',
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

async function runTimelineTutorial(browser: Browser, lang: Lang): Promise<void> {
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
    const assetId = '00000000-0000-0000-0000-000000000001';

    // Interceptar listado de búsqueda
    await page.route('**/api/v1/assets/search', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: assetId,
              code: 'CNC-01',
              name: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
              state: lang === 'es' ? 'Operativo' : 'Operative',
              stateColor: '#10b981',
              childrenCount: 3,
              pathNames: lang === 'es' ? 'Planta Monterrey > Nave 01' : 'Monterrey Plant > Bay 01',
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 10,
        }),
      });
    });

    // Interceptar detalle del activo
    await page.route(`**/api/v1/assets/${assetId}`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: assetId,
            code: 'CNC-01',
            name: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
            state: lang === 'es' ? 'Operativo' : 'Operative',
            stateColor: '#10b981',
            assetTemplateId: 'tpl-cnc-001',
            propertiesJson: '{}',
            installedAt: '2026-01-15T00:00:00Z',
          }),
        });
      }
      return route.continue();
    });

    // Interceptar eventos de bitácora
    await page.route(`**/api/v1/assets/${assetId}/events`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'evt-3',
            fromState: lang === 'es' ? 'En Mantenimiento' : 'In Maintenance',
            toState: lang === 'es' ? 'Operativo' : 'Operative',
            at: '2026-02-10T14:30:00Z',
            userId: 'Ing. Rodrigo Méndez',
            notes: JSON.stringify({
              tecnicoResponsable: 'Rodrigo Méndez',
              horometroFinal: '1,420 hrs',
              calibracionOptica: 'Verificada y Certificada',
            }),
          },
          {
            id: 'evt-2',
            fromState: lang === 'es' ? 'Operativo' : 'Operative',
            toState: lang === 'es' ? 'En Mantenimiento' : 'In Maintenance',
            at: '2026-02-09T08:15:00Z',
            userId: 'Operador Turno Mañana',
            notes: JSON.stringify({
              motivo: lang === 'es' ? 'Mantenimiento Preventivo Trimestral' : 'Quarterly Preventive Maintenance',
              cambioFiltros: lang === 'es' ? 'Filtro HF-6510 reemplazado' : 'HF-6510 Filter Replaced',
            }),
          },
          {
            id: 'evt-1',
            fromState: lang === 'es' ? 'Instalación' : 'Commissioning',
            toState: lang === 'es' ? 'Operativo' : 'Operative',
            at: '2026-01-15T10:00:00Z',
            userId: 'Admin Sistema',
            notes: JSON.stringify({
              altaInicial: lang === 'es' ? 'Equipo recibido y probado en vacío' : 'Equipment accepted and idle tested',
              voltajeAlimentacion: '480V Trifásico',
            }),
          },
        ]),
      });
    });

    // 1. Navegar al Listado de Activos (/assets)
    await page.goto(`${ATLAS_BASE_URL}/assets`, { waitUntil: 'load' });
    await waitForPageReady(page, 1200);

    await narrate(page, c.modTitle, c.sLangTitle, c.sLangDesc, 2000);
    await selectLanguageInUI(page, lang);

    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2400);

    // 2. Abrir ficha del Torno CNC
    await narrate(page, c.modTitle, c.sOpenAssetTitle, c.sOpenAssetDesc, 2400);
    const assetRow = page.locator('tbody tr, .cursor-pointer').first();
    await highlightElement(page, assetRow, 800);
    await moveAndClick(page, assetRow, 1100);
    await waitForPageReady(page, 1200);

    // 3. Cambiar a pestaña Bitácora (Timeline)
    await narrate(page, c.modTitle, c.sTimelineTabTitle, c.sTimelineTabDesc, 2500);
    const timelineTab = page.locator('[role="tab"][value="timeline"], button[role="tab"]:has-text("Bitácora"), button[role="tab"]:has-text("Activity"), button[role="tab"]:has-text("Log")').first();
    await highlightElement(page, timelineTab, 800);
    await moveAndClick(page, timelineTab, 900);
    await waitForPageReady(page, 1000);

    // 4. Resaltar primer evento de la línea de tiempo
    await narrate(page, c.modTitle, c.sLifecycleLogTitle, c.sLifecycleLogDesc, 2600);
    const firstEventCard = page.locator('.space-y-8 > div, .relative.flex').first();
    if (await firstEventCard.isVisible().catch(() => false)) {
      await highlightElement(page, firstEventCard, 1200);
    }

    // 5. Resaltar datos de auditoría capturados
    await narrate(page, c.modTitle, c.sDataTraceTitle, c.sDataTraceDesc, 2600);
    const notesBox = page.locator('.mt-3.p-2, .bg-muted').first();
    if (await notesBox.isVisible().catch(() => false)) {
      await highlightElement(page, notesBox, 1100);
    }

    // 6. Resaltar el contenedor general del timeline
    await narrate(page, c.modTitle, c.sAuditorTitle, c.sAuditorDesc, 2600);
    const fullTimeline = page.locator('.space-y-8, [role="tabpanel"]').first();
    if (await fullTimeline.isVisible().catch(() => false)) {
      await highlightElement(page, fullTimeline, 1200);
    }

    await page.waitForTimeout(1000);
  } finally {
    await saveNamedVideo(
      session,
      `03-activos/05-bitacora-trazabilidad/bitacora-trazabilidad-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 03E — Bitácora y Trazabilidad Histórica de Activos (ES / EN)', () => {
  test('bitacora-trazabilidad-es', async ({ browser }) => {
    await runTimelineTutorial(browser, 'es');
  });

  test('bitacora-trazabilidad-en', async ({ browser }) => {
    await runTimelineTutorial(browser, 'en');
  });
});