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

interface StateConfigPlan {
  name: string;
  isInitial?: boolean;
  isTerminal?: boolean;
  colorSwatchIndex: number;
  autoAction?: string;
  associatedModule?: string;
  requireFieldKey?: string;
}

interface TutorialData {
  template: {
    code: string;
    name: string;
    description: string;
    attrKey: string;
    attrLabel: string;
  };
  states: StateConfigPlan[];
  copy: {
    modTemplates: string;
    modLifecycle: string;
    sLangTitle: string;
    sLangDesc: string;
    sIntroTitle: string;
    sIntroDesc: string;
    sCreateTplTitle: string;
    sCreateTplDesc: string;
    sAttrTitle: string;
    sAttrDesc: string;
    sOpenLifecycleTitle: string;
    sOpenLifecycleDesc: string;
    sAddStatesTitle: string;
    sAddStatesDesc: string;
    sConfigInitialTitle: string;
    sConfigInitialDesc: string;
    sConfigMaintenanceTitle: string;
    sConfigMaintenanceDesc: string;
    sConfigDecommissionTitle: string;
    sConfigDecommissionDesc: string;
    sConnectTitle: string;
    sConnectDesc: string;
    sControlsTitle: string;
    sControlsDesc: string;
    sSaveTitle: string;
    sSaveDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    template: {
      code: 'PRENSA_HIDR',
      name: 'Prensa Hidráulica 200T',
      description: 'Prensa para estampado en frío con ciclo de vida industrial completo.',
      attrKey: 'horas_operacion',
      attrLabel: 'Horómetro de Operación',
    },
    states: [
      {
        name: 'Operativo',
        isInitial: true,
        colorSwatchIndex: 2, // Green #10b981
      },
      {
        name: 'En Mantenimiento',
        colorSwatchIndex: 4, // Yellow/Amber #f59e0b
        autoAction: 'CREATE_WORK_ORDER',
        associatedModule: 'work_orders',
        requireFieldKey: 'horas_operacion',
      },
      {
        name: 'Baja Definitiva',
        isTerminal: true,
        colorSwatchIndex: 3, // Red #ef4444
      },
    ],
    copy: {
      modTemplates: 'Plantillas de Activos',
      modLifecycle: 'Máquina de Estados & Ciclo de Vida',
      sLangTitle: 'Configuración Multilenguaje',
      sLangDesc: 'Demostración paso a paso en Español: modelado visual del ciclo de vida industrial.',
      sIntroTitle: 'Gestión de Plantillas de Activos',
      sIntroDesc: 'Cada plantilla define los estados válidos, transiciones y automatizaciones de sus activos.',
      sCreateTplTitle: 'Creación de Plantilla',
      sCreateTplDesc: 'Definimos el código y datos generales de la prensa hidráulica industrial.',
      sAttrTitle: 'Definición de Atributos Clave',
      sAttrDesc: 'Agregamos el atributo numérico "Horómetro de Operación" para requerirlo en transiciones.',
      sOpenLifecycleTitle: 'Editor Visual de Ciclo de Vida',
      sOpenLifecycleDesc: 'Canvas interactivo basado en nodos para modelar la máquina de estados finitos.',
      sAddStatesTitle: 'Creación de Estados de Operación',
      sAddStatesDesc: 'Agregamos "Operativo", "En Mantenimiento" y "Baja Definitiva" al canvas.',
      sConfigInitialTitle: 'Estado Inicial y Color Semántico',
      sConfigInitialDesc: 'Marcamos "Operativo" como estado inicial y asignamos color verde esmeralda.',
      sConfigMaintenanceTitle: 'Automatización & Reglas de Mantenimiento',
      sConfigMaintenanceDesc: 'Al entrar en mantenimiento se crea automáticamente una Orden de Trabajo y se exige el Horómetro.',
      sConfigDecommissionTitle: 'Estado Terminal de Baja',
      sConfigDecommissionDesc: 'Marcamos "Baja Definitiva" como terminal en rojo para cerrar el ciclo sin transiciones salientes.',
      sConnectTitle: 'Interconexión de Flujos y Transiciones',
      sConnectDesc: 'Conectamos Operativo ➔ En Mantenimiento, Mantenimiento ➔ Operativo y En Mantenimiento ➔ Baja Definitiva.',
      sControlsTitle: 'Herramientas del Canvas',
      sControlsDesc: 'Centrado automático y controles de navegación para flujos de alta complejidad.',
      sSaveTitle: 'Guardado y Persistencia',
      sSaveDesc: 'La máquina de estados queda registrada y lista para gobernar los activos de planta.',
    },
  },
  en: {
    template: {
      code: 'HYDR_PRESS',
      name: '200T Hydraulic Press',
      description: 'Cold stamping heavy press with enterprise lifecycle governance.',
      attrKey: 'operating_hours',
      attrLabel: 'Operating Hours Counter',
    },
    states: [
      {
        name: 'Operative',
        isInitial: true,
        colorSwatchIndex: 2, // Green #10b981
      },
      {
        name: 'Under Maintenance',
        colorSwatchIndex: 4, // Yellow/Amber #f59e0b
        autoAction: 'CREATE_WORK_ORDER',
        associatedModule: 'work_orders',
        requireFieldKey: 'operating_hours',
      },
      {
        name: 'Decommissioned',
        isTerminal: true,
        colorSwatchIndex: 3, // Red #ef4444
      },
    ],
    copy: {
      modTemplates: 'Asset Templates',
      modLifecycle: 'State Machine & Lifecycle',
      sLangTitle: 'Multilanguage Setup',
      sLangDesc: 'Step-by-step walkthrough in English: visual modeling of enterprise asset states.',
      sIntroTitle: 'Asset Templates Management',
      sIntroDesc: 'Each template defines state diagrams, transitions and automated event triggers.',
      sCreateTplTitle: 'Template Definition',
      sCreateTplDesc: 'Setting up code, title and industrial equipment specifications.',
      sAttrTitle: 'Key Lifecycle Attributes',
      sAttrDesc: 'Adding "Operating Hours Counter" to enforce data capture upon maintenance entry.',
      sOpenLifecycleTitle: 'Visual Lifecycle Editor',
      sOpenLifecycleDesc: 'Interactive node-based canvas for state machine modeling.',
      sAddStatesTitle: 'Adding State Nodes',
      sAddStatesDesc: 'Creating "Operative", "Under Maintenance" and "Decommissioned" states.',
      sConfigInitialTitle: 'Initial State & Semantic Palette',
      sConfigInitialDesc: 'Confirming "Operative" as initial entry point with emerald green badge.',
      sConfigMaintenanceTitle: 'Automations & Transition Rules',
      sConfigMaintenanceDesc: 'Configuring auto Work Order creation and requiring operating hours input.',
      sConfigDecommissionTitle: 'Terminal Decommission State',
      sConfigDecommissionDesc: 'Setting red terminal badge to ensure no outgoing transitions once retired.',
      sConnectTitle: 'State Flow Interconnections',
      sConnectDesc: 'Connecting Operative ➔ Under Maintenance, Maintenance ➔ Operative and Under Maintenance ➔ Decommissioned.',
      sControlsTitle: 'Canvas Navigation Controls',
      sControlsDesc: 'Centering and zoom tools designed for complex industrial state diagrams.',
      sSaveTitle: 'Persisting State Machine',
      sSaveDesc: 'State machine is persisted and immediately ready for industrial operations.',
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
    body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000002' }),
  });
}

async function runStateMachineTutorial(browser: Browser, lang: Lang): Promise<void> {
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

    await narrate(page, c.modTemplates, c.sLangTitle, c.sLangDesc, 2000);
    await selectLanguageInUI(page, lang);

    await narrate(page, c.modTemplates, c.sIntroTitle, c.sIntroDesc, 2200);

    // 2. Abrir formulario de Nueva Plantilla
    const createTemplateBtn = page
      .locator('button[title*="plantilla" i], button[title*="template" i]')
      .first();
    await highlightElement(page, createTemplateBtn, 700);
    await moveAndClick(page, createTemplateBtn, 850);

    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ state: 'visible', timeout: 10_000 });
    const tabs = sheet.locator('[role="tab"]');

    // --- Tab 1: General ---
    await narrate(page, c.modTemplates, c.sCreateTplTitle, c.sCreateTplDesc, 2000);
    await moveAndType(page, sheet.locator('input[name="code"]'), pack.template.code, 45);
    await moveAndType(page, sheet.locator('input[name="name"]'), pack.template.name, 35);
    await moveAndType(
      page,
      sheet.locator('textarea[name="description"]'),
      pack.template.description,
      22,
    );

    // --- Tab 2: Atributos ---
    await moveAndClick(page, tabs.nth(1), 750);
    await narrate(page, c.modTemplates, c.sAttrTitle, c.sAttrDesc, 2000);

    const addAttrBtn = sheet.getByRole('button', {
      name: /Agregar Atributo|Add Attribute/i,
    });
    await moveAndClick(page, addAttrBtn, 450);

    const attrCard = sheet.locator('div.bg-card.border.rounded-md.mb-2.shadow-sm').last();
    await moveAndType(page, attrCard.locator('input.font-mono').first(), pack.template.attrKey, 40);
    await moveAndType(
      page,
      attrCard.locator('input:not(.font-mono)').first(),
      pack.template.attrLabel,
      32,
    );
    await moveAndClick(page, attrCard.locator('button[role="combobox"]').first(), 450);
    await moveAndClick(
      page,
      page
        .getByRole('option')
        .filter({ has: page.locator('span.font-medium', { hasText: /^Número$|^Number$/i }) })
        .first(),
      450,
    );
    await page.waitForTimeout(400);

    // --- Tab 3: Ciclo de Vida ---
    await moveAndClick(page, tabs.nth(2), 850);
    await narrate(page, c.modLifecycle, c.sOpenLifecycleTitle, c.sOpenLifecycleDesc, 2400);

    // Resaltar panel de ayuda de estados
    const helpBadges = sheet.locator('div.flex.flex-wrap.gap-2.text-xs');
    if (await helpBadges.isVisible().catch(() => false)) {
      await highlightElement(page, helpBadges, 1200);
    }

    // Agregar Estados al Canvas
    await narrate(page, c.modLifecycle, c.sAddStatesTitle, c.sAddStatesDesc, 2200);
    const newStateInput = sheet.getByPlaceholder(/Nombre del nuevo estado|Name of the new state/i);
    const addStateBtn = sheet.getByRole('button', { name: /Agregar Estado|Add State/i });

    for (const st of pack.states) {
      await moveAndType(page, newStateInput, st.name, 45);
      await moveAndClick(page, addStateBtn, 700);
      await page.waitForTimeout(300);
    }

    // Configurar Nodo 1: Operativo (Inicial + Color)
    await narrate(page, c.modLifecycle, c.sConfigInitialTitle, c.sConfigInitialDesc, 2400);
    const nodeOperative = sheet.locator('.react-flow__node', { hasText: pack.states[0].name }).first();
    await highlightElement(page, nodeOperative, 700);
    await moveAndClick(page, nodeOperative, 900);

    const stateDialog = page.getByRole('dialog', { name: /Configurar Estado|Configure State/i });
    await stateDialog.waitFor({ state: 'visible', timeout: 8000 });

    // Seleccionar color Verde
    const swatches = stateDialog.locator('button.w-8.h-8.rounded-full');
    await highlightElement(page, swatches.nth(pack.states[0].colorSwatchIndex), 600);
    await moveAndClick(page, swatches.nth(pack.states[0].colorSwatchIndex), 700);
    await page.keyboard.press('Escape');
    await stateDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(500);

    // Configurar Nodo 2: En Mantenimiento (Color Ámbar + OnEnter Action + Requerir Horómetro)
    await narrate(page, c.modLifecycle, c.sConfigMaintenanceTitle, c.sConfigMaintenanceDesc, 2600);
    const nodeMaint = sheet.locator('.react-flow__node', { hasText: pack.states[1].name }).first();
    await highlightElement(page, nodeMaint, 700);
    await moveAndClick(page, nodeMaint, 900);
    await stateDialog.waitFor({ state: 'visible', timeout: 8000 });

    // Color Ámbar
    await moveAndClick(page, swatches.nth(pack.states[1].colorSwatchIndex), 650);

    // Acción Automática OnEnter: Crear Orden de Trabajo
    const actionSelect = stateDialog.locator('button[role="combobox"]').first();
    await moveAndClick(page, actionSelect, 500);
    const actionOption = page.getByRole('option', {
      name: /Crear Orden de Trabajo|Create Work Order/i,
    });
    await moveAndClick(page, actionOption, 650);

    // Módulo Asociado: Órdenes de Trabajo
    const moduleSelect = stateDialog.locator('button[role="combobox"]').nth(1);
    await moveAndClick(page, moduleSelect, 500);
    const moduleOption = page.getByRole('option', {
      name: /Módulo de Órdenes de Trabajo|Work Orders Module/i,
    });
    await moveAndClick(page, moduleOption, 650);

    // Requerir Campo: Horómetro
    const requireSwitch = stateDialog.locator(`button[id*="${pack.template.attrKey}"]`).first();
    if (await requireSwitch.isVisible().catch(() => false)) {
      await highlightElement(page, requireSwitch, 600);
      await moveAndClick(page, requireSwitch, 700);
    }

    await page.keyboard.press('Escape');
    await stateDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(500);

    // Configurar Nodo 3: Baja Definitiva (Terminal + Color Rojo)
    await narrate(page, c.modLifecycle, c.sConfigDecommissionTitle, c.sConfigDecommissionDesc, 2500);
    const nodeDecomm = sheet.locator('.react-flow__node', { hasText: pack.states[2].name }).first();
    await highlightElement(page, nodeDecomm, 700);
    await moveAndClick(page, nodeDecomm, 900);
    await stateDialog.waitFor({ state: 'visible', timeout: 8000 });

    // Switch Terminal
    const terminalSwitch = stateDialog.locator('button#isTerminal').first();
    await highlightElement(page, terminalSwitch, 600);
    await moveAndClick(page, terminalSwitch, 700);

    // Color Rojo
    await moveAndClick(page, swatches.nth(pack.states[2].colorSwatchIndex), 650);

    await page.keyboard.press('Escape');
    await stateDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(500);

    // Interconexión de Nodos y Flujos Permitidos
    await narrate(page, c.modLifecycle, c.sConnectTitle, c.sConnectDesc, 2800);

    const connectSection = sheet.locator('div.flex.flex-wrap.items-center.gap-2.p-2\\.5').first();
    if (await connectSection.isVisible().catch(() => false)) {
      await highlightElement(page, connectSection, 800);

      const srcCombobox = connectSection.locator('button[role="combobox"]').first();
      const dstCombobox = connectSection.locator('button[role="combobox"]').nth(1);
      const addTransBtn = connectSection.getByRole('button', { name: /Crear Transición|Create Transition/i });

      // Transición 1: Operativo -> En Mantenimiento
      await moveAndClick(page, srcCombobox, 450);
      await moveAndClick(page, page.getByRole('option', { name: pack.states[0].name }).first(), 500);

      await moveAndClick(page, dstCombobox, 450);
      await moveAndClick(page, page.getByRole('option', { name: pack.states[1].name }).first(), 500);

      await highlightElement(page, addTransBtn, 600);
      await moveAndClick(page, addTransBtn, 850);
      await page.waitForTimeout(400);

      // Transición 2: En Mantenimiento -> Operativo (Retorno de Mantenimiento a Operativo)
      await moveAndClick(page, srcCombobox, 450);
      await moveAndClick(page, page.getByRole('option', { name: pack.states[1].name }).first(), 500);

      await moveAndClick(page, dstCombobox, 450);
      await moveAndClick(page, page.getByRole('option', { name: pack.states[0].name }).first(), 500);

      await moveAndClick(page, addTransBtn, 850);
      await page.waitForTimeout(400);

      // Transición 3: En Mantenimiento -> Baja Definitiva
      await moveAndClick(page, srcCombobox, 450);
      await moveAndClick(page, page.getByRole('option', { name: pack.states[1].name }).first(), 500);

      await moveAndClick(page, dstCombobox, 450);
      await moveAndClick(page, page.getByRole('option', { name: pack.states[2].name }).first(), 500);

      await moveAndClick(page, addTransBtn, 850);
      await page.waitForTimeout(500);
    }

    // Controles de Vista del Canvas
    await narrate(page, c.modLifecycle, c.sControlsTitle, c.sControlsDesc, 2200);
    const fitViewBtn = sheet.locator('button[aria-label*="Vista" i], button[aria-label*="View" i]').first();
    if (await fitViewBtn.isVisible().catch(() => false)) {
      await highlightElement(page, fitViewBtn, 700);
      await moveAndClick(page, fitViewBtn, 800);
    }

    // --- Tab 5: Vista Previa y Guardar ---
    await moveAndClick(page, tabs.nth(4), 850);
    await page.waitForTimeout(800);

    await narrate(page, c.modTemplates, c.sSaveTitle, c.sSaveDesc, 2500);
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
      `03-maquina-estados/maquina-estados-ciclo-vida-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 03 — Máquina de Estados y Ciclo de Vida (ES / EN)', () => {
  test('maquina-estados-ciclo-vida-es', async ({ browser }) => {
    await runStateMachineTutorial(browser, 'es');
  });

  test('maquina-estados-ciclo-vida-en', async ({ browser }) => {
    await runStateMachineTutorial(browser, 'en');
  });
});

