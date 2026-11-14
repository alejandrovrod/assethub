import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import {
  highlightElement,
  initTutorialOverlay,
  moveAndClick,
  moveAndType,
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
  tpl: {
    code: string;
    name: string;
    description: string;
  };
  copy: {
    modTitle: string;
    sLangTitle: string;
    sLangDesc: string;
    sIntroTitle: string;
    sIntroDesc: string;
    sOpenFormTitle: string;
    sOpenFormDesc: string;
    sGeneralFieldsTitle: string;
    sGeneralFieldsDesc: string;
    sAttributesTabTitle: string;
    sAttributesTabDesc: string;
    sLifecycleTabTitle: string;
    sLifecycleTabDesc: string;
    sPreviewTabTitle: string;
    sPreviewTabDesc: string;
    sSaveTitle: string;
    sSaveDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    tpl: {
      code: 'INC-MEC-01',
      name: 'Reporte EstÃƒÂ¡ndar de AverÃƒÂ­a MecÃƒÂ¡nica',
      description: 'Protocolo de diagnÃƒÂ³stico tÃƒÂ©cnico para fallas mecÃƒÂ¡nicas en husillos, reductores y transmisiones.',
    },
    copy: {
      modTitle: 'Mantenimiento Ã¢â‚¬â€ Plantillas de Incidencia y Flujos',
      sLangTitle: 'DemostraciÃƒÂ³n Multilenguaje',
      sLangDesc: 'ConfiguraciÃƒÂ³n previa de la plantilla de incidencia con atributos dinÃƒÂ¡micos y ciclo de vida.',
      sIntroTitle: 'CatÃƒÂ¡logo Maestro de Plantillas de Flujo',
      sIntroDesc: 'Las plantillas estandarizan quÃƒÂ© datos se capturan cuando un activo entra en contingencia.',
      sOpenFormTitle: 'CreaciÃƒÂ³n de Nueva Plantilla de Incidencia',
      sOpenFormDesc: 'Iniciamos el formulario de configuraciÃƒÂ³n para definir el cÃƒÂ³digo y el tipo de flujo de trabajo.',
      sGeneralFieldsTitle: 'Datos Generales y Tipo de Flujo',
      sGeneralFieldsDesc: 'Definimos el cÃƒÂ³digo INC-MEC-01, nombre corporativo y seleccionamos tipo "Incidencia".',
      sAttributesTabTitle: 'Esquema de Atributos DinÃƒÂ¡micos',
      sAttributesTabDesc: 'DiseÃƒÂ±amos los campos tÃƒÂ©cnicos obligatorios: nivel de vibraciÃƒÂ³n, temperatura y fotos de la falla.',
      sLifecycleTabTitle: 'MÃƒÂ¡quina de Estados de la Incidencia',
      sLifecycleTabDesc: 'Configuramos el ciclo de resoluciÃƒÂ³n: Reportada > En DiagnÃƒÂ³stico > En ReparaciÃƒÂ³n > Resuelta.',
      sPreviewTabTitle: 'PrevisualizaciÃƒÂ³n del Formulario TÃƒÂ©cnico',
      sPreviewTabDesc: 'Validamos cÃƒÂ³mo verÃƒÂ¡ el tÃƒÂ©cnico de planta el formulario dinÃƒÂ¡mico al momento de la falla.',
      sSaveTitle: 'PublicaciÃƒÂ³n y Disponibilidad Corporativa',
      sSaveDesc: 'Guardamos la plantilla. Ahora estÃƒÂ¡ lista para ser consumida por la mÃƒÂ¡quina de estados de los activos.',
    },
  },
  en: {
    tpl: {
      code: 'INC-MEC-01',
      name: 'Standard Mechanical Failure Report',
      description: 'Technical diagnostic protocol for mechanical breakdowns on spindles, gearboxes, and drives.',
    },
    copy: {
      modTitle: 'Maintenance Ã¢â‚¬â€ Incident Workflow Templates',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Preconditioning setup of incident templates featuring dynamic schemas and lifecycle states.',
      sIntroTitle: 'Master Workflow Templates Catalog',
      sIntroDesc: 'Templates standardize data requirements captured whenever machinery suffers an unplanned stoppage.',
      sOpenFormTitle: 'Creating New Incident Template',
      sOpenFormDesc: 'Opening the configuration drawer to define protocol code, title, and maintenance workflow type.',
      sGeneralFieldsTitle: 'General Metadata & Incident Type',
      sGeneralFieldsDesc: 'Assigning code INC-MEC-01, enterprise title, and selecting "Incident" workflow category.',
      sAttributesTabTitle: 'Dynamic Schema Attributes',
      sAttributesTabDesc: 'Configuring required technical inputs: spindle vibration RMS, thermal reading, and failure photos.',
      sLifecycleTabTitle: 'Incident State Machine Canvas',
      sLifecycleTabDesc: 'Defining ticket lifecycle: Reported > In Triage > Under Repair > Closed / Resolved.',
      sPreviewTabTitle: 'Live Dynamic Form Preview',
      sPreviewTabDesc: 'Inspecting the technician form layout as rendered on mobile and shop-floor terminals.',
      sSaveTitle: 'Publishing Enterprise Template',
      sSaveDesc: 'Persisting template: now fully available to be linked into asset lifecycle state machines.',
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

async function runWorkflowTemplateTutorial(browser: Browser, lang: Lang): Promise<void> {
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
    // Interceptar listado y creaciÃƒÂ³n de plantillas de workflow
    await page.route('**/api/v1/workflow-templates*', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'wf-001' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'wf-000',
              code: 'INC-GEN-01',
              name: lang === 'es' ? 'Incidencia General de Planta' : 'General Plant Incident',
              type: 'incident',
              description: lang === 'es' ? 'Flujo estÃƒÂ¡ndar' : 'Standard workflow',
            },
          ],
        }),
      });
    });

    // 1. Navegar a /maintenance/workflow-templates
    await page.goto(`${ATLAS_BASE_URL}/maintenance/workflow-templates`, { waitUntil: 'load' });
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

    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2600);

    // 2. Click en botÃƒÂ³n Nueva Plantilla
    await narrate(page, c.modTitle, c.sOpenFormTitle, c.sOpenFormDesc, 2500);
    const addBtn = page.locator('button:has(svg.lucide-plus)').first();
    await highlightElement(page, addBtn, 700);
    await moveAndClick(page, addBtn, 800);

    // 3. Formulario Lateral de Plantilla (WorkflowTemplateFormSheet)
    const sheet = page.getByRole('dialog').first();
    await sheet.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sGeneralFieldsTitle, c.sGeneralFieldsDesc, 2600);
    const codeInput = sheet.locator('input[name="code"]');
    const nameInput = sheet.locator('input[name="name"]');
    const descInput = sheet.locator('textarea[name="description"]');

    await highlightElement(page, codeInput, 600);
    await moveAndType(page, codeInput, pack.tpl.code, 40);

    await highlightElement(page, nameInput, 600);
    await moveAndType(page, nameInput, pack.tpl.name, 35);

    if (await descInput.isVisible().catch(() => false)) {
      await moveAndType(page, descInput, pack.tpl.description, 25);
    }

    // 4. PestaÃƒÂ±a Atributos DinÃƒÂ¡micos
    await narrate(page, c.modTitle, c.sAttributesTabTitle, c.sAttributesTabDesc, 2600);
    const tabAttrs = sheet.locator('button[role="tab"][value="attributes"], button[role="tab"]:has-text("Atributos"), button[role="tab"]:has-text("Attributes")').first();
    await highlightElement(page, tabAttrs, 700);
    await moveAndClick(page, tabAttrs, 800);
    await waitForPageReady(page, 800);

    // Resaltar Schema Builder
    const schemaBuilder = sheet.locator('.border.rounded-lg, [class*="schema-builder"]').first();
    if (await schemaBuilder.isVisible().catch(() => false)) {
      await highlightElement(page, schemaBuilder, 1200);
    }

    // 5. PestaÃƒÂ±a Ciclo de Vida (MÃƒÂ¡quina de Estados de la Incidencia)
    await narrate(page, c.modTitle, c.sLifecycleTabTitle, c.sLifecycleTabDesc, 2600);
    const tabLifecycle = sheet.locator('button[role="tab"][value="lifecycle"], button[role="tab"]:has-text("Ciclo"), button[role="tab"]:has-text("Lifecycle")').first();
    await highlightElement(page, tabLifecycle, 700);
    await moveAndClick(page, tabLifecycle, 800);
    await waitForPageReady(page, 900);

    const canvas = sheet.locator('.react-flow, [class*="lifecycle-canvas"]').first();
    if (await canvas.isVisible().catch(() => false)) {
      await highlightElement(page, canvas, 1200);
    }

    // 6. Pestaña Previsualización
    await narrate(page, c.modTitle, c.sPreviewTabTitle, c.sPreviewTabDesc, 2500);
    const tabPreview = sheet.locator('button[role="tab"]').filter({ hasText: /Previs|Preview|Vista/i }).first();
    if (await tabPreview.isVisible().catch(() => false)) {
      await highlightElement(page, tabPreview, 700);
      await moveAndClick(page, tabPreview, 800);
      await waitForPageReady(page, 900);
    }

    // 7. Guardar Plantilla de Incidencia
    await narrate(page, c.modTitle, c.sSaveTitle, c.sSaveDesc, 2600);
    const saveBtn = sheet.getByRole('button', { name: /Guardar|Save|Crear|Create/i }).first();
    await highlightElement(page, saveBtn, 700);
    await moveAndClick(page, saveBtn, 1100);

    try {
      await sheet.waitFor({ state: 'hidden', timeout: 5000 });
    } catch {
      const cancelBtn = sheet.getByRole('button', { name: /Cancelar|Cancel/i }).first();
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
      }
    }
    await waitForPageReady(page, 1000);

    await page.waitForTimeout(1000);
  } finally {
    await saveNamedVideo(
      session,
      `04-mantenimiento/00-plantillas-incidencias/plantillas-incidencias-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 04A Ã¢â‚¬â€ Plantillas de Incidencia y Flujos de Trabajo (ES / EN)', () => {
  test('plantillas-incidencias-es', async ({ browser }) => {
    await runWorkflowTemplateTutorial(browser, 'es');
  });

  test('plantillas-incidencias-en', async ({ browser }) => {
    await runWorkflowTemplateTutorial(browser, 'en');
  });
});