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
  tryMoveAndClick,
  VIDEOS_OUTPUT_DIR,
  waitForPageReady,
} from '../helpers/tutorial-recorder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ATLAS_BASE_URL = 'http://atlas-industrial.localhost:5173';
const ATLAS_ADMIN = {
  email: process.env.ATLAS_EMAIL ?? 'rmendez@atlas-industrial.com',
  password: process.env.ATLAS_PASSWORD ?? 'AtlasIndustrial2026!',
};

type Lang = 'es' | 'en';

interface TutorialLocalePack {
  catalog: {
    code: string;
    label: string;
    items: Array<{ code: string; label: string; order: string }>;
  };
  template: {
    code: string;
    name: string;
    description: string;
    sectionName: string;
    attr1Key: string;
    attr1Label: string;
    attr2Key: string;
    attr2Label: string;
    attr3Key: string;
    attr3Label: string;
    newState: string;
    tasks: Array<{ title: string; frequency: string; description: string }>;
  };
  copy: {
    modCatalogs: string;
    modTemplates: string;
    modGeneral: string;
    modAttributes: string;
    modLifecycle: string;
    modChecklist: string;
    modPreview: string;
    sLangTitle: string;
    sLangDesc: string;
    s1Title: string;
    s1Desc: string;
    s2Title: string;
    s2Desc: string;
    s3Title: string;
    s3Desc: string;
    sCatalogReadyTitle: string;
    sCatalogReadyDesc: string;
    s4Title: string;
    s4Desc: string;
    sImportedTitle: string;
    sImportedDesc: string;
    s5Title: string;
    s5Desc: string;
    s6Title: string;
    s6Desc: string;
    s7Title: string;
    s7Desc: string;
    sCatAttrTitle: string;
    sCatAttrDesc: string;
    sPropTitle: string;
    sPropDesc: string;
    s8Title: string;
    s8Desc: string;
    s9Title: string;
    s9Desc: string;
    s10Title: string;
    s10Desc: string;
    sDoneTitle: string;
    sDoneDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialLocalePack> = {
  es: {
    catalog: {
      code: 'MARCA_MAQUINARIA',
      label: 'Marca de Maquinaria Industrial',
      items: [
        { code: 'MAZAK', label: 'Mazak Corporation', order: '1' },
        { code: 'HAAS', label: 'Haas Automation', order: '2' },
      ],
    },
    template: {
      code: 'TORNO_CNC',
      name: 'Torno CNC de Precisión',
      description:
        'Plantilla técnica para tornos de control numérico computarizado de planta metalúrgica.',
      sectionName: 'Especificaciones de Planta',
      attr1Key: 'marca_equipo',
      attr1Label: 'Marca del Fabricante',
      attr2Key: 'potencia_kw',
      attr2Label: 'Potencia del Husillo (kW)',
      attr3Key: 'numero_serie',
      attr3Label: 'Número de Serie',
      newState: 'En Calibración',
      tasks: [
        {
          title: 'Verificar presión de lubricación de guías lineales',
          frequency: 'Diario (inicio de turno)',
          description: 'Confirmar presión entre 1.5 y 2.2 bar en manómetro principal.',
        },
        {
          title: 'Control de concentricidad de mordazas',
          frequency: 'Cada 250 horas de operación',
          description: 'Medir desviación con reloj comparador (máx. 0.01 mm).',
        },
      ],
    },
    copy: {
      modCatalogs: 'Módulo Catálogos',
      modTemplates: 'Plantillas de Activos',
      modGeneral: 'Constructor — General',
      modAttributes: 'Constructor — Atributos',
      modLifecycle: 'Constructor — Ciclo de Vida',
      modChecklist: 'Constructor — Checklist',
      modPreview: 'Constructor — Vista Previa',
      sLangTitle: 'Soporte Multilenguaje',
      sLangDesc: 'Elegimos Español en el selector superior antes de configurar los catálogos maestros.',
      s1Title: '1. Creación de Catálogos Maestros',
      s1Desc: 'Definimos listas maestras reutilizables. Crearemos el catálogo "Marca de Maquinaria Industrial".',
      s2Title: '2. Guardar Nuevo Catálogo',
      s2Desc: 'Ingresamos el código único, su etiqueta visible y lo vinculamos al módulo de Activos.',
      s3Title: '3. Agregar Elementos al Catálogo',
      s3Desc: 'Cargamos las opciones reales que podrá elegir el operador (Mazak Corporation y Haas Automation).',
      sCatalogReadyTitle: 'Catálogo Maestro Listo',
      sCatalogReadyDesc: 'Las marcas quedaron registradas y listas para usarse en cualquier plantilla de activos.',
      s4Title: '4. Importar desde la Biblioteca Global',
      s4Desc: 'Podés importar plantillas estándar preconfiguradas desde la Biblioteca Global con un clic.',
      sImportedTitle: 'Plantilla Global Importada',
      sImportedDesc: 'Se clona toda la estructura en tu organización para usarla o adaptarla a tu operación.',
      s5Title: '5. Crear Plantilla Técnica desde Cero',
      s5Desc: 'Ahora crearemos la plantilla "Torno CNC de Precisión" (TORNO_CNC) paso a paso.',
      s6Title: '6. Identificación de la Plantilla',
      s6Desc: 'Ingresamos el código interno, nombre comercial y descripción operativa del tipo de maquinaria.',
      s7Title: '7. Sección y Campos Técnicos Dinámicos',
      s7Desc: 'Organizamos los campos en una sección y agregamos atributos de tipo Catálogo, Número y Texto.',
      sCatAttrTitle: 'Atributo Vinculado a Catálogo',
      sCatAttrDesc: 'Vinculamos "Marca del Fabricante" al catálogo maestro recién creado y lo marcamos obligatorio.',
      sPropTitle: 'Propagación a Órdenes de Trabajo',
      sPropDesc: 'Activamos "Propagar a Órdenes" en Número de Serie para que sea visible automáticamente en campo.',
      s8Title: '8. Estados Operativos del Activo',
      s8Desc: 'Además de Active e Inactive por defecto, agregamos "En Calibración" para paradas metrológicas.',
      s9Title: '9. Checklist Técnico de Mantenimiento',
      s9Desc: 'Definimos las tareas de inspección preventiva que heredará cada torno creado con esta plantilla.',
      s10Title: '10. Vista Previa Antes de Guardar',
      s10Desc: 'Validamos la estructura completa del formulario, los estados del ciclo de vida y el checklist.',
      sDoneTitle: '¡Plantilla Lista para Operar!',
      sDoneDesc: '"Torno CNC de Precisión" quedó guardada y lista para registrar los equipos de planta.',
    },
  },
  en: {
    catalog: {
      code: 'MACHINERY_BRAND',
      label: 'Industrial Machinery Brands',
      items: [
        { code: 'MAZAK', label: 'Mazak Corporation', order: '1' },
        { code: 'HAAS', label: 'Haas Automation', order: '2' },
      ],
    },
    template: {
      code: 'CNC_LATHE',
      name: 'Precision CNC Lathe',
      description:
        'Technical template for computer numerical control lathes across the manufacturing plant.',
      sectionName: 'Plant Specifications',
      attr1Key: 'manufacturer_brand',
      attr1Label: 'Manufacturer Brand',
      attr2Key: 'spindle_power_kw',
      attr2Label: 'Spindle Power (kW)',
      attr3Key: 'serial_number',
      attr3Label: 'Serial Number',
      newState: 'Under Calibration',
      tasks: [
        {
          title: 'Verify linear guide lubrication pressure',
          frequency: 'Daily (shift start)',
          description: 'Confirm pressure stays between 1.5 and 2.2 bar on the main gauge.',
        },
        {
          title: 'Check chuck jaw concentricity',
          frequency: 'Every 250 operating hours',
          description: 'Measure runout using a dial indicator (max 0.01 mm).',
        },
      ],
    },
    copy: {
      modCatalogs: 'Catalogs Module',
      modTemplates: 'Asset Templates',
      modGeneral: 'Builder — General',
      modAttributes: 'Builder — Attributes',
      modLifecycle: 'Builder — Lifecycle',
      modChecklist: 'Builder — Checklist',
      modPreview: 'Builder — Preview',
      sLangTitle: 'Multi-Language Switcher',
      sLangDesc: 'We switch the interface to English from the top bar before configuring master catalogs.',
      s1Title: '1. Creating Master Catalogs',
      s1Desc: 'Define reusable dropdown lists. We will create the "Industrial Machinery Brands" catalog.',
      s2Title: '2. Save New Catalog',
      s2Desc: 'Enter a unique code, display label, and link the catalog to the Assets module.',
      s3Title: '3. Add Catalog Items',
      s3Desc: 'Add the real options operators will select in forms (Mazak Corporation & Haas Automation).',
      sCatalogReadyTitle: 'Master Catalog Ready',
      sCatalogReadyDesc: 'Equipment brands are saved and ready to be linked to any asset template.',
      s4Title: '4. Import from Global Library',
      s4Desc: 'Jump-start setup by cloning pre-built industry templates directly from the Global Library.',
      sImportedTitle: 'Global Template Imported',
      sImportedDesc: 'The complete schema and checklist are cloned into your tenant for immediate use.',
      s5Title: '5. Create Custom Template from Scratch',
      s5Desc: 'Now we build the "Precision CNC Lathe" (CNC_LATHE) template with custom fields and rules.',
      s6Title: '6. Template Identification',
      s6Desc: 'Enter the internal code, display name, and operational description for this machinery type.',
      s7Title: '7. Section & Dynamic Technical Fields',
      s7Desc: 'Group attributes under a section and add Catalog, Number, and Text fields.',
      sCatAttrTitle: 'Catalog-Linked Attribute',
      sCatAttrDesc: 'Link "Manufacturer Brand" to our master catalog and mark it as a required field.',
      sPropTitle: 'Propagate to Work Orders',
      sPropDesc: 'Enable "Propagate to Orders" on Serial Number so field technicians see it on every task.',
      s8Title: '8. Asset Lifecycle States',
      s8Desc: 'Beyond default Active/Inactive states, we add "Under Calibration" for metrology holds.',
      s9Title: '9. Preventive Maintenance Checklist',
      s9Desc: 'Define inspection tasks inherited automatically by every lathe created from this template.',
      s10Title: '10. Live Preview Before Saving',
      s10Desc: 'Verify the rendered form sections, lifecycle badges, and checklist items before saving.',
      sDoneTitle: 'Template Ready for Production!',
      sDoneDesc: '"Precision CNC Lathe" is saved and ready to register plant assets.',
    },
  },
};

async function ensureAtlasAuthState(browser: Browser, lang: Lang): Promise<string> {
  const authPath = path.resolve(__dirname, `../.auth/atlas-admin-${lang}.json`);
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
    body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001' }),
  });
}

async function addChecklistTask(
  page: Page,
  dialog: ReturnType<Page['getByRole']>,
  task: { title: string; frequency: string; description: string },
): Promise<void> {
  await moveAndClick(page, dialog.getByRole('button', { name: /Agregar Tarea|Add Task/i }), 500);
  const taskCard = dialog.locator('div.flex.flex-col.gap-2.p-3.bg-card.border.rounded-md.shadow-sm').last();
  await moveAndType(page, taskCard.locator('input').nth(0), task.title, 28);
  await moveAndType(page, taskCard.locator('input').nth(1), task.frequency, 32);
  await moveAndType(page, taskCard.locator('textarea').first(), task.description, 22);
}

async function runCatalogsAndTemplatesTutorial(browser: Browser, lang: Lang): Promise<void> {
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
    await page.route('**/api/v1/catalogs', async (route) => {
      if (route.request().method() === 'POST') return idempotentCreateHandler(route);
      return route.continue();
    });
    await page.route('**/api/v1/catalogs/*/items', async (route) => {
      if (route.request().method() === 'POST') return idempotentCreateHandler(route);
      return route.continue();
    });
    await page.route('**/api/v1/asset-templates/*/clone-system', async (route) => {
      if (route.request().method() === 'POST') return idempotentCreateHandler(route);
      return route.continue();
    });
    await page.route('**/api/v1/asset-templates', async (route) => {
      if (route.request().method() === 'POST') return idempotentCreateHandler(route);
      return route.continue();
    });

    // =========================================================================
    // PARTE 1: CATÁLOGOS MAESTROS (/catalogs)
    // =========================================================================
    await page.goto(`${ATLAS_BASE_URL}/catalogs`, { waitUntil: 'load' });
    await waitForPageReady(page, 1200);

    await narrate(page, c.modCatalogs, c.sLangTitle, c.sLangDesc, 1800);
    await selectLanguageInUI(page, lang);

    await narrate(page, c.modCatalogs, c.s1Title, c.s1Desc, 2400);

    const newCatalogBtn = page.locator('.w-1\\/3 > div:first-child button').first();
    await highlightElement(page, newCatalogBtn, 750);
    await moveAndClick(page, newCatalogBtn, 750);

    const catalogDialog = page.getByRole('dialog');
    await catalogDialog.waitFor({ state: 'visible', timeout: 10_000 });

    await moveAndType(page, catalogDialog.locator('input[name="code"]'), pack.catalog.code, 42);
    await moveAndType(page, catalogDialog.locator('input[name="label"]'), pack.catalog.label, 38);

    const assetsCheckbox = catalogDialog.locator('button[role="checkbox"]').first();
    await tryMoveAndClick(page, assetsCheckbox, 450, 2000);

    await narrate(page, c.modCatalogs, c.s2Title, c.s2Desc, 1500);

    const saveCatalogBtn = catalogDialog.locator('button[type="submit"]').first();
    await moveAndClick(page, saveCatalogBtn, 700);
    await catalogDialog.waitFor({ state: 'hidden', timeout: 8000 });
    await waitForPageReady(page, 700);

    // Seleccionar el catálogo en la columna izquierda
    const createdCatalogBtn = page.locator('button', { hasText: pack.catalog.label }).first();
    await highlightElement(page, createdCatalogBtn, 750);
    await moveAndClick(page, createdCatalogBtn, 850);

    await narrate(page, c.modCatalogs, c.s3Title, c.s3Desc, 2200);

    for (const item of pack.catalog.items) {
      const newItemBtn = page.getByRole('button', { name: /Nuevo Elemento|New Item/i });
      await moveAndClick(page, newItemBtn, 600);

      const itemDialog = page.getByRole('dialog');
      await itemDialog.waitFor({ state: 'visible', timeout: 8000 });

      await moveAndType(page, itemDialog.locator('input[name="code"]'), item.code, 50);
      await moveAndType(page, itemDialog.locator('input[name="defaultLabel"]'), item.label, 38);
      await moveAndType(page, itemDialog.locator('input[name="order"]'), item.order, 55);

      await moveAndClick(page, itemDialog.locator('button[type="submit"]').first(), 650);
      await itemDialog.waitFor({ state: 'hidden', timeout: 8000 });
      await waitForPageReady(page, 500);
    }

    await narrate(page, c.modCatalogs, c.sCatalogReadyTitle, c.sCatalogReadyDesc, 1900);

    // =========================================================================
    // PARTE 2: PLANTILLAS DE ACTIVOS — BIBLIOTECA GLOBAL (/assets/templates)
    // =========================================================================
    await page.goto(`${ATLAS_BASE_URL}/assets/templates`, { waitUntil: 'load' });
    await waitForPageReady(page, 1200);

    await narrate(page, c.modTemplates, c.s4Title, c.s4Desc, 2200);

    const libraryBtn = page.getByRole('button', {
      name: /Importar de Biblioteca|Import from Library/i,
    });
    await highlightElement(page, libraryBtn, 750);
    await moveAndClick(page, libraryBtn, 950);

    const libDialog = page.getByRole('dialog');
    await libDialog.waitFor({ state: 'visible', timeout: 8000 });

    const useTemplateBtn = libDialog
      .getByRole('button', { name: /Usar esta plantilla|Use this template/i })
      .first();
    if (await tryMoveAndClick(page, useTemplateBtn, 1200, 3000)) {
      await narrate(page, c.modTemplates, c.sImportedTitle, c.sImportedDesc, 1900);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // =========================================================================
    // PARTE 3: CREAR PLANTILLA DE ACTIVO DESDE CERO
    // =========================================================================
    await narrate(page, c.modTemplates, c.s5Title, c.s5Desc, 2300);

    const createTemplateBtn = page
      .locator('button[title*="plantilla" i], button[title*="template" i]')
      .first();
    await highlightElement(page, createTemplateBtn, 750);
    await moveAndClick(page, createTemplateBtn, 850);

    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ state: 'visible', timeout: 10_000 });
    const tabs = sheet.locator('[role="tab"]');

    // --- Tab 1: General ---
    await narrate(page, c.modGeneral, c.s6Title, c.s6Desc, 1800);
    await moveAndType(page, sheet.locator('input[name="code"]'), pack.template.code, 50);
    await moveAndType(page, sheet.locator('input[name="name"]'), pack.template.name, 38);
    await moveAndType(
      page,
      sheet.locator('textarea[name="description"]'),
      pack.template.description,
      24,
    );

    // --- Tab 2: Atributos ---
    await moveAndClick(page, tabs.nth(1), 750);
    await narrate(page, c.modAttributes, c.s7Title, c.s7Desc, 2100);

    await moveAndClick(
      page,
      sheet.getByRole('button', { name: /Agregar Sección|Add Section/i }),
      500,
    );
    const sectionInput = sheet.locator('div.border-dashed input').last();
    await moveAndType(page, sectionInput, pack.template.sectionName, 38);

    const addAttrBtn = sheet.getByRole('button', {
      name: /Agregar Atributo|Add Attribute/i,
    });
    const attrCards = sheet.locator('div.bg-card.border.rounded-md.mb-2.shadow-sm');

    // Atributo 1: Catálogo
    await moveAndClick(page, addAttrBtn, 450);
    const card1 = attrCards.last();
    await moveAndType(page, card1.locator('input.font-mono').first(), pack.template.attr1Key, 42);
    await moveAndType(
      page,
      card1.locator('input:not(.font-mono)').first(),
      pack.template.attr1Label,
      36,
    );
    await moveAndClick(page, card1.locator('button[role="combobox"]').first(), 450);
    await moveAndClick(
      page,
      page
        .getByRole('option')
        .filter({ has: page.locator('span.font-medium', { hasText: /^Catálogo$|^Catalog$/i }) })
        .first(),
      550,
    );

    await moveAndClick(
      page,
      card1.getByRole('combobox').filter({ hasText: /Seleccionar catálogo|Select catalog/i }).first(),
      450,
    );
    await moveAndClick(
      page,
      page.getByRole('option', { name: new RegExp(pack.catalog.label, 'i') }).first(),
      500,
    );
    await moveAndClick(page, card1.locator('button[role="switch"]').last(), 450);

    await narrate(page, c.modAttributes, c.sCatAttrTitle, c.sCatAttrDesc, 1800);

    // Atributo 2: Número
    await moveAndClick(page, addAttrBtn, 450);
    const card2 = attrCards.last();
    await moveAndType(page, card2.locator('input.font-mono').first(), pack.template.attr2Key, 42);
    await moveAndType(
      page,
      card2.locator('input:not(.font-mono)').first(),
      pack.template.attr2Label,
      34,
    );
    await moveAndClick(page, card2.locator('button[role="combobox"]').first(), 450);
    await moveAndClick(
      page,
      page
        .getByRole('option')
        .filter({ has: page.locator('span.font-medium', { hasText: /^Número$|^Number$/i }) })
        .first(),
      450,
    );

    // Atributo 3: Texto con Propagar a Órdenes + Obligatorio
    await moveAndClick(page, addAttrBtn, 450);
    const card3 = attrCards.last();
    await moveAndType(page, card3.locator('input.font-mono').first(), pack.template.attr3Key, 42);
    await moveAndType(
      page,
      card3.locator('input:not(.font-mono)').first(),
      pack.template.attr3Label,
      36,
    );
    await moveAndClick(page, card3.locator('button[role="switch"]').first(), 400);
    await moveAndClick(page, card3.locator('button[role="switch"]').last(), 450);

    await narrate(page, c.modAttributes, c.sPropTitle, c.sPropDesc, 2000);
    await page.waitForTimeout(500);

    // --- Tab 3: Ciclo de Vida ---
    await moveAndClick(page, tabs.nth(2), 850);
    await narrate(page, c.modLifecycle, c.s8Title, c.s8Desc, 2100);

    const newStateInput = sheet.getByPlaceholder(/Nombre del nuevo estado|Name of the new state/i);
    await moveAndType(page, newStateInput, pack.template.newState, 45);
    await moveAndClick(
      page,
      sheet.getByRole('button', { name: /Agregar Estado|Add State/i }),
      900,
    );
    await page.waitForTimeout(500);

    // --- Tab 4: Checklist ---
    await moveAndClick(page, tabs.nth(3), 750);
    await narrate(page, c.modChecklist, c.s9Title, c.s9Desc, 2000);

    for (const task of pack.template.tasks) {
      await addChecklistTask(page, sheet, task);
    }

    // --- Tab 5: Vista Previa ---
    await moveAndClick(page, tabs.nth(4), 900);
    await narrate(page, c.modPreview, c.s10Title, c.s10Desc, 2400);

    // Guardar Plantilla
    const saveTemplateBtn = sheet.getByRole('button', { name: /Guardar Plantilla|Save Template/i }).first();
    await highlightElement(page, saveTemplateBtn, 750);
    await moveAndClick(page, saveTemplateBtn, 1200);
    await sheet.waitFor({ state: 'hidden', timeout: 8000 });
    await waitForPageReady(page, 900);

    const templateRow = page.locator('tbody tr', { hasText: pack.template.name }).first();
    if (await templateRow.isVisible().catch(() => false)) {
      await highlightElement(page, templateRow, 1300);
    }

    await narrate(page, c.modTemplates, c.sDoneTitle, c.sDoneDesc, 2400);
    await expect(page).toHaveURL(/\/assets\/templates/);
  } finally {
    await saveNamedVideo(
      session,
      `02-catalogos-y-plantillas/catalogos-y-plantillas-activos-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 02 — Catálogos Maestros y Plantillas de Activos (ES / EN)', () => {
  test('catalogos-y-plantillas-activos-es', async ({ browser }) => {
    await runCatalogsAndTemplatesTutorial(browser, 'es');
  });

  test('catalogos-y-plantillas-activos-en', async ({ browser }) => {
    await runCatalogsAndTemplatesTutorial(browser, 'en');
  });
});
