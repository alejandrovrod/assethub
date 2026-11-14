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
  template: {
    code: string;
    name: string;
    description: string;
  };
  tab1Name: string;
  tab2Name: string;
  sec1Name: string;
  sec2Name: string;
  fields: {
    f1Key: string;
    f1Label: string;
    f2Key: string;
    f2Label: string;
    f3Key: string;
    f3Label: string;
    f4Key: string;
    f4Label: string;
  };
  copy: {
    modTitle: string;
    sLangTitle: string;
    sLangDesc: string;
    sIntroTitle: string;
    sIntroDesc: string;
    sOpenBuilderTitle: string;
    sOpenBuilderDesc: string;
    sRenameTabTitle: string;
    sRenameTabDesc: string;
    sAddSecTitle: string;
    sAddSecDesc: string;
    sAddFieldsTab1Title: string;
    sAddFieldsTab1Desc: string;
    sAddTab2Title: string;
    sAddTab2Desc: string;
    sCondVisTitle: string;
    sCondVisDesc: string;
    sPreviewTitle: string;
    sPreviewDesc: string;
    sSaveTitle: string;
    sSaveDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    template: {
      code: 'TURBO_COMP',
      name: 'Turbocompresor Industrial 500HP',
      description: 'Compresor centrífugo de aire para planta con esquema dinámico en múltiples pestañas.',
    },
    tab1Name: 'Especificaciones Mecánicas',
    tab2Name: 'Datos Eléctricos & Seguridad',
    sec1Name: 'Parámetros Principales',
    sec2Name: 'Alimentación Eléctrica',
    fields: {
      f1Key: 'presion_max_bar',
      f1Label: 'Presión Máxima (bar)',
      f2Key: 'caudal_m3h',
      f2Label: 'Caudal Nominal (m³/h)',
      f3Key: 'requiere_trifasica',
      f3Label: 'Requiere Conexión Trifásica (440V)',
      f4Key: 'amperaje_nominal',
      f4Label: 'Amperaje Nominal (A)',
    },
    copy: {
      modTitle: 'Constructor de Esquemas Dinámicos',
      sLangTitle: 'Demostración Multilenguaje',
      sLangDesc: 'Configuración paso a paso en Español: modelado avanzado de pestañas, secciones y visibilidad condicional.',
      sIntroTitle: 'Plantillas de Activos & Esquemas Dinámicos',
      sIntroDesc: 'El SchemaBuilder permite crear formularios estructurados para capturar datos complejos de ingeniería.',
      sOpenBuilderTitle: 'Pestaña de Atributos',
      sOpenBuilderDesc: 'Accedemos al constructor de esquemas donde gestionamos pestañas, secciones y campos.',
      sRenameTabTitle: 'Gestión y Renombrado de Pestañas',
      sRenameTabDesc: 'Renombramos la pestaña principal como "Especificaciones Mecánicas" para ordenar el formulario.',
      sAddSecTitle: 'Secciones Divisorias',
      sAddSecDesc: 'Insertamos un divisor de sección "Parámetros Principales" para agrupar las especificaciones clave.',
      sAddFieldsTab1Title: 'Atributos Numéricos en la Sección',
      sAddFieldsTab1Desc: 'Agregamos "Presión Máxima" y "Caudal Nominal" con propagación a órdenes de trabajo.',
      sAddTab2Title: 'Segunda Pestaña del Formulario',
      sAddTab2Desc: 'Creamos la pestaña "Datos Eléctricos & Seguridad" y agregamos el interruptor booleano de conexión.',
      sCondVisTitle: 'Lógica de Visibilidad Condicional',
      sCondVisDesc: 'El campo "Amperaje Nominal" solo se muestra cuando "Requiere Conexión Trifásica" es Sí (true).',
      sPreviewTitle: 'Vista Previa Interactiva',
      sPreviewDesc: 'Verificamos en la vista previa cómo se renderizan las pestañas y la visibilidad condicional.',
      sSaveTitle: 'Persistencia del Esquema Dinámico',
      sSaveDesc: 'Guardamos la plantilla con su esquema jerárquico listo para el alta de activos en planta.',
    },
  },
  en: {
    template: {
      code: 'TURBO_COMP',
      name: '500HP Industrial Turbocompressor',
      description: 'Centrifugal plant air compressor featuring dynamic multi-tab custom schema.',
    },
    tab1Name: 'Mechanical Specifications',
    tab2Name: 'Electrical & Safety Data',
    sec1Name: 'Core Parameters',
    sec2Name: 'Power Supply',
    fields: {
      f1Key: 'max_pressure_bar',
      f1Label: 'Max Pressure (bar)',
      f2Key: 'flow_rate_m3h',
      f2Label: 'Rated Flow (m³/h)',
      f3Key: 'requires_three_phase',
      f3Label: 'Requires Three-Phase (440V)',
      f4Key: 'rated_amperage',
      f4Label: 'Rated Amperage (A)',
    },
    copy: {
      modTitle: 'Dynamic Schema Builder',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Step-by-step walkthrough in English: advanced tabs, section dividers, and conditional visibility.',
      sIntroTitle: 'Asset Templates & Schema Architecture',
      sIntroDesc: 'The SchemaBuilder structures rich engineering forms with tabs, sections, and business logic.',
      sOpenBuilderTitle: 'Attributes Tab',
      sOpenBuilderDesc: 'Entering the visual schema designer to configure tabs, sections, and custom attributes.',
      sRenameTabTitle: 'Tab Customization & Renaming',
      sRenameTabDesc: 'Renaming default tab to "Mechanical Specifications" to organize equipment parameters.',
      sAddSecTitle: 'Section Dividers',
      sAddSecDesc: 'Adding a "Core Parameters" section divider to group operational specifications.',
      sAddFieldsTab1Title: 'Numeric Fields in Section',
      sAddFieldsTab1Desc: 'Defining "Max Pressure" and "Rated Flow" with order propagation enabled.',
      sAddTab2Title: 'Adding Secondary Tab',
      sAddTab2Desc: 'Creating "Electrical & Safety Data" tab and adding a boolean electrical switch attribute.',
      sCondVisTitle: 'Conditional Visibility Logic',
      sCondVisDesc: 'The "Rated Amperage" field only appears when "Requires Three-Phase" equals Yes (true).',
      sPreviewTitle: 'Interactive Preview Validation',
      sPreviewDesc: 'Testing the live form preview to confirm multi-tab rendering and conditional behavior.',
      sSaveTitle: 'Persisting Dynamic Schema',
      sSaveDesc: 'Saving the template with full multi-tab schema ready for industrial equipment onboarding.',
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

async function idempotentCreateHandler(route: Route): Promise<void> {
  const response = await route.fetch();
  if (response.ok()) {
    await route.fulfill({ response });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000003' }),
  });
}

async function runDynamicSchemaTutorial(browser: Browser, lang: Lang): Promise<void> {
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
    await page.route('**/api/v1/asset-templates', async (route) => {
      if (route.request().method() === 'POST') return idempotentCreateHandler(route);
      return route.continue();
    });

    // 1. Navegar a /assets/templates
    await page.goto(`${ATLAS_BASE_URL}/assets/templates`, { waitUntil: 'load' });
    await waitForPageReady(page, 1200);

    await narrate(page, c.modTitle, c.sLangTitle, c.sLangDesc, 2000);
    await selectLanguageInUI(page, lang);

    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2200);

    // 2. Abrir formulario de Nueva Plantilla
    const createTemplateBtn = page
      .locator('button[title*="plantilla" i], button[title*="template" i]')
      .first();
    await highlightElement(page, createTemplateBtn, 700);
    await moveAndClick(page, createTemplateBtn, 850);

    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ state: 'visible', timeout: 10_000 });
    const modalTabs = sheet.locator('[role="tab"]');

    // General: Completar datos de la plantilla
    await moveAndType(page, sheet.locator('input[name="code"]'), pack.template.code, 45);
    await moveAndType(page, sheet.locator('input[name="name"]'), pack.template.name, 35);
    await moveAndType(
      page,
      sheet.locator('textarea[name="description"]'),
      pack.template.description,
      22,
    );

    // --- Tab Atributos (SchemaBuilder) ---
    await moveAndClick(page, modalTabs.nth(1), 800);
    await narrate(page, c.modTitle, c.sOpenBuilderTitle, c.sOpenBuilderDesc, 2200);

    // 3. Renombrar la primera pestaña
    await narrate(page, c.modTitle, c.sRenameTabTitle, c.sRenameTabDesc, 2400);
    const tabItem = sheet.locator('div.border-b button:has(span.font-medium)').first();
    await highlightElement(page, tabItem, 600);
    await tabItem.dblclick();
    await page.waitForTimeout(300);

    const renameInput = sheet.locator('div.border-b input').first();
    if (await renameInput.isVisible().catch(() => false)) {
      await renameInput.fill('');
      await renameInput.pressSequentially(pack.tab1Name, { delay: 35 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    }

    // 4. Agregar Sección Divisoria en Pestaña 1
    await narrate(page, c.modTitle, c.sAddSecTitle, c.sAddSecDesc, 2300);
    const addSectionBtn = sheet.getByRole('button', { name: /Agregar Sección|Add Section/i });
    await highlightElement(page, addSectionBtn, 600);
    await moveAndClick(page, addSectionBtn, 700);

    const sectionTitleInput = sheet.locator('div.border-dashed input').last();
    await moveAndType(page, sectionTitleInput, pack.sec1Name, 38);

    // 5. Agregar Atributos en Pestaña 1
    await narrate(page, c.modTitle, c.sAddFieldsTab1Title, c.sAddFieldsTab1Desc, 2400);
    const addAttrBtn = sheet.getByRole('button', { name: /Agregar Atributo|Add Attribute/i });
    const attrCards = sheet.locator('div.bg-card.border.rounded-md.mb-2.shadow-sm');

    // Atributo 1: Presión Máxima (Número)
    await moveAndClick(page, addAttrBtn, 500);
    const card1 = attrCards.last();
    await moveAndType(page, card1.locator('input.font-mono').first(), pack.fields.f1Key, 40);
    await moveAndType(page, card1.locator('input:not(.font-mono)').first(), pack.fields.f1Label, 35);
    await moveAndClick(page, card1.locator('button[role="combobox"]').first(), 450);
    await moveAndClick(
      page,
      page.getByRole('option').filter({ has: page.locator('span.font-medium', { hasText: /^Número$|^Number$/i }) }).first(),
      500,
    );
    await moveAndClick(page, card1.locator('button[role="switch"]').first(), 400); // Propagar a OT

    // Atributo 2: Caudal Nominal (Número)
    await moveAndClick(page, addAttrBtn, 500);
    const card2 = attrCards.last();
    await moveAndType(page, card2.locator('input.font-mono').first(), pack.fields.f2Key, 40);
    await moveAndType(page, card2.locator('input:not(.font-mono)').first(), pack.fields.f2Label, 35);
    await moveAndClick(page, card2.locator('button[role="combobox"]').first(), 450);
    await moveAndClick(
      page,
      page.getByRole('option').filter({ has: page.locator('span.font-medium', { hasText: /^Número$|^Number$/i }) }).first(),
      500,
    );

    // 6. Crear Segunda Pestaña: Datos Eléctricos & Seguridad
    await narrate(page, c.modTitle, c.sAddTab2Title, c.sAddTab2Desc, 2500);
    const addTabBtn = sheet.getByRole('button', { name: /Agregar Pestaña|Add Tab/i });
    await highlightElement(page, addTabBtn, 600);
    await moveAndClick(page, addTabBtn, 700);

    // Renombrar la nueva pestaña
    const tab2Item = sheet.locator('div.border-b button:has(span.font-medium)').last();
    await highlightElement(page, tab2Item, 500);
    await tab2Item.dblclick();
    await page.waitForTimeout(300);

    const renameInput2 = sheet.locator('div.border-b input').first();
    if (await renameInput2.isVisible().catch(() => false)) {
      await renameInput2.fill('');
      await renameInput2.pressSequentially(pack.tab2Name, { delay: 35 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    }

    // Agregar Atributo Booleano en Pestaña 2: Requiere Trifásica (Sí / No)
    await moveAndClick(page, addAttrBtn, 500);
    const card3 = attrCards.last();
    await moveAndType(page, card3.locator('input.font-mono').first(), pack.fields.f3Key, 40);
    await moveAndType(page, card3.locator('input:not(.font-mono)').first(), pack.fields.f3Label, 35);
    await moveAndClick(page, card3.locator('button[role="combobox"]').first(), 450);
    await moveAndClick(
      page,
      page.getByRole('option').filter({ has: page.locator('span.font-medium', { hasText: /^Sí \/ No$|^Yes \/ No$/i }) }).first(),
      500,
    );

    // Agregar Atributo Condicional: Amperaje Nominal
    await narrate(page, c.modTitle, c.sCondVisTitle, c.sCondVisDesc, 2600);
    await moveAndClick(page, addAttrBtn, 500);
    const card4 = attrCards.last();
    await moveAndType(page, card4.locator('input.font-mono').first(), pack.fields.f4Key, 40);
    await moveAndType(page, card4.locator('input:not(.font-mono)').first(), pack.fields.f4Label, 35);
    await moveAndClick(page, card4.locator('button[role="combobox"]').first(), 450);
    await moveAndClick(
      page,
      page.getByRole('option').filter({ has: page.locator('span.font-medium', { hasText: /^Número$|^Number$/i }) }).first(),
      500,
    );

    // Configurar Visibilidad Condicional en Card 4
    const visibilityBtn = card4.locator('button:has(svg.lucide-eye)').first();
    await highlightElement(page, visibilityBtn, 650);
    await moveAndClick(page, visibilityBtn, 700);

    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await popover.waitFor({ state: 'visible', timeout: 5000 });

    const parentFieldSelect = popover.locator('button[role="combobox"]').first();
    await moveAndClick(page, parentFieldSelect, 450);

    // Seleccionar la segunda opción (el campo booleano Requiere Trifásica)
    const availableOptions = page.getByRole('option');
    if ((await availableOptions.count()) > 1) {
      await moveAndClick(page, availableOptions.nth(1), 500);

      const conditionValueSelect = popover.locator('button[role="combobox"]').nth(1);
      await moveAndClick(page, conditionValueSelect, 450);
      const trueOption = page.getByRole('option', { name: /Sí|Yes/i }).first();
      await moveAndClick(page, trueOption, 500);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // 7. Vista Previa Interactiva del Formulario
    await narrate(page, c.modTitle, c.sPreviewTitle, c.sPreviewDesc, 2400);
    await moveAndClick(page, modalTabs.nth(4), 850);
    await page.waitForTimeout(1000);

    // 8. Guardar Plantilla
    await narrate(page, c.modTitle, c.sSaveTitle, c.sSaveDesc, 2500);
    const saveTemplateBtn = sheet.getByRole('button', { name: /Guardar Plantilla|Save Template/i }).first();
    await highlightElement(page, saveTemplateBtn, 750);
    await moveAndClick(page, saveTemplateBtn, 1200);
    await sheet.waitFor({ state: 'hidden', timeout: 8000 });
    await waitForPageReady(page, 900);

    const templateRow = page.locator('tbody tr', { hasText: pack.template.name }).first();
    if (await templateRow.isVisible().catch(() => false)) {
      await highlightElement(page, templateRow, 1200);
    }

    await expect(page).toHaveURL(/\/assets\/templates/);
  } finally {
    await saveNamedVideo(
      session,
      `02-plantillas/esquemas-dinamicos-tabs-secciones-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 02B — Esquemas Dinámicos, Pestañas y Reglas Condicionales (ES / EN)', () => {
  test('esquemas-dinamicos-tabs-secciones-es', async ({ browser }) => {
    await runDynamicSchemaTutorial(browser, 'es');
  });

  test('esquemas-dinamicos-tabs-secciones-en', async ({ browser }) => {
    await runDynamicSchemaTutorial(browser, 'en');
  });
});

