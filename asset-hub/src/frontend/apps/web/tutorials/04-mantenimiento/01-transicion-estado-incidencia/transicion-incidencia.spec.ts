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
  incident: {
    title: string;
    description: string;
    vibrationLevel: string;
  };
  copy: {
    modTitle: string;
    sLangTitle: string;
    sLangDesc: string;
    sIntroTitle: string;
    sIntroDesc: string;
    sAssetViewTitle: string;
    sAssetViewDesc: string;
    sStateMachineLinkTitle: string;
    sStateMachineLinkDesc: string;
    sTriggerTransitionTitle: string;
    sTriggerTransitionDesc: string;
    sDelegationSheetTitle: string;
    sDelegationSheetDesc: string;
    sSelectTplTitle: string;
    sSelectTplDesc: string;
    sFillIncidentTitle: string;
    sFillIncidentDesc: string;
    sDynamicAttrTitle: string;
    sDynamicAttrDesc: string;
    sSaveAndLockTitle: string;
    sSaveAndLockDesc: string;
    sAuditVerificationTitle: string;
    sAuditVerificationDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    incident: {
      title: 'Falla por Sobrecalentamiento en Husillo Principal',
      description: 'Alarma de temperatura superó los 85°C durante ciclo continuo de desbaste pesado.',
      vibrationLevel: '4.8 mm/s RMS',
    },
    copy: {
      modTitle: 'Mantenimiento — Máquina de Estados e Incidencias',
      sLangTitle: 'Demostración Multilenguaje',
      sLangDesc: 'Flujo completo donde el cambio de estado del activo genera automáticamente la orden de incidencia.',
      sIntroTitle: 'Integración Máquina de Estados y Mantenimiento',
      sIntroDesc: 'La incidencia no se crea aislada: nace de la regla de ciclo de vida configurada en la plantilla del equipo.',
      sAssetViewTitle: 'Activo Operativo en Planta',
      sAssetViewDesc: 'El Torno CNC se encuentra en estado "Operativo" con sus botones de transición de ciclo de vida disponibles.',
      sStateMachineLinkTitle: 'Vínculo con el Módulo Delegado',
      sStateMachineLinkDesc: 'La máquina de estados estipula que pasar a "En Falla" delega la acción directamente al módulo de incidencias.',
      sTriggerTransitionTitle: 'Disparo de la Transición de Estado',
      sTriggerTransitionDesc: 'Hacemos clic en el botón de transición "En Falla" para reportar la contingencia del activo.',
      sDelegationSheetTitle: 'Apertura Automática del Reporte de Incidencia',
      sDelegationSheetDesc: 'El sistema asocia el activo automáticamente, bloquea el selector y precarga el estado de destino.',
      sSelectTplTitle: 'Selección de la Plantilla de Incidencia',
      sSelectTplDesc: 'Seleccionamos la plantilla específica para averías mecánicas y térmicas de husillos.',
      sFillIncidentTitle: 'Captura de Datos de la Falla',
      sFillIncidentDesc: 'Ingresamos título, descripción técnica y severidad de la avería para la cuadrilla electromecánica.',
      sDynamicAttrTitle: 'Atributos Dinámicos del Diagnóstico',
      sDynamicAttrDesc: 'Completamos los campos del esquema de la plantilla: nivel de vibración y parámetros operativos.',
      sSaveAndLockTitle: 'Guardado y Bloqueo Operativo del Activo',
      sSaveAndLockDesc: 'La incidencia queda registrada, el activo cambia a "En Falla" y queda bajo control de Mantenimiento.',
      sAuditVerificationTitle: 'Trazabilidad en Bitácora e Incidencias Activas',
      sAuditVerificationDesc: 'El acordeón de incidencias y la bitácora reflejan la transición y el folio de mantenimiento generado.',
    },
  },
  en: {
    incident: {
      title: 'Overheating Alarm on Primary Spindle',
      description: 'Thermal sensor exceeded 85°C threshold during heavy roughing turning pass.',
      vibrationLevel: '4.8 mm/s RMS',
    },
    copy: {
      modTitle: 'Maintenance — State Machine & Incident Trigger',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Full lifecycle flow where asset state transitions automatically trigger incident records.',
      sIntroTitle: 'State Machine & Maintenance Integration',
      sIntroDesc: 'Incidents are not created in isolation: they originate from lifecycle delegation rules set on templates.',
      sAssetViewTitle: 'Operating Asset on Shop Floor',
      sAssetViewDesc: 'The CNC Lathe is currently in "Operative" status with available lifecycle transition triggers.',
      sStateMachineLinkTitle: 'Delegated Module Linking',
      sStateMachineLinkDesc: 'The template state machine defines that moving to "In Fault" hands off control to the incidents module.',
      sTriggerTransitionTitle: 'Triggering State Transition',
      sTriggerTransitionDesc: 'Clicking the transition action "In Fault" to flag an unplanned machine stoppage.',
      sDelegationSheetTitle: 'Automatic Incident Form Launch',
      sDelegationSheetDesc: 'The system binds the asset context, locks the target status, and loads required incident inputs.',
      sSelectTplTitle: 'Selecting Incident Workflow Template',
      sSelectTplDesc: 'Selecting the specialized breakdown template configured for spindle and thermal failures.',
      sFillIncidentTitle: 'Capturing Breakdown Details',
      sFillIncidentDesc: 'Entering failure title, root symptom description, and priority level for the repair squad.',
      sDynamicAttrTitle: 'Diagnostic Dynamic Schema Fields',
      sDynamicAttrDesc: 'Populating template schema inputs: vibration severity level and thermal telemetry snapshots.',
      sSaveAndLockTitle: 'Persisting Incident & Asset State Lock',
      sSaveAndLockDesc: 'Incident is created, asset status switches to "In Fault", and machinery is locked under maintenance.',
      sAuditVerificationTitle: 'Audit Trace & Active Incident Accordion',
      sAuditVerificationDesc: 'The asset timeline and incidents drawer verify immediate provenance and linked maintenance ticket.',
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

async function runIncidentTransitionTutorial(browser: Browser, lang: Lang): Promise<void> {
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
    let currentAssetState = lang === 'es' ? 'Operativo' : 'Operative';
    let currentAssetColor = '#10b981';

    // 1. Interceptar listado de activos
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
              state: currentAssetState,
              stateColor: currentAssetColor,
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

    // 2. Interceptar detalle del activo con máquina de estados que vincula a 'incidents'
    const targetFaultState = lang === 'es' ? 'En Falla' : 'In Fault';

    await page.route(`**/api/v1/assets/${assetId}`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: assetId,
            code: 'CNC-01',
            name: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
            state: currentAssetState,
            stateColor: currentAssetColor,
            assetTemplateId: 'tpl-cnc-001',
            assetTemplateName: lang === 'es' ? 'Torno CNC' : 'CNC Lathe',
            lifecycleStates: JSON.stringify({
              states: {
                [currentAssetState]: {
                  color: '#10b981',
                  isTerminal: false,
                },
                [targetFaultState]: {
                  color: '#ef4444',
                  associatedModule: 'incidents',
                  isTerminal: false,
                },
              },
              transitions: {
                [currentAssetState]: [targetFaultState],
              },
            }),
            propertiesJson: '{}',
            installedAt: '2026-01-15T00:00:00Z',
          }),
        });
      }
      return route.continue();
    });

    // 3. Interceptar templates de workflow / incidencias (con esquema de atributos dinámicos)
    const tplName = lang === 'es' ? 'Reporte Estándar de Avería Mecánica' : 'Standard Mechanical Failure Report';
    await page.route('**/api/v1/workflow-templates*', async (route) => {
      const url = route.request().url();
      if (url.includes('wf-001')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'wf-001',
            name: tplName,
            description: lang === 'es' ? 'Protocolo de diagnóstico de fallas en husillos' : 'Spindle failure diagnostic protocol',
            schemaJson: JSON.stringify({
              type: 'object',
              properties: {
                vibrationLevel: {
                  type: 'string',
                  title: lang === 'es' ? 'Nivel de Vibración Detectado' : 'Detected Vibration Level',
                },
              },
            }),
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'wf-001',
              name: tplName,
              schemaJson: '{}',
            },
            {
              id: 'wf-002',
              name: lang === 'es' ? 'Avería Eléctrica / Servomotor' : 'Electrical / Servo Breakdown',
              schemaJson: '{}',
            },
          ],
        }),
      });
    });

    // 4. Interceptar creación de incidencia
    await page.route('**/api/v1/incidents*', async (route) => {
      if (route.request().method() === 'POST') {
        currentAssetState = targetFaultState;
        currentAssetColor = '#ef4444';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'inc-2026-0099',
            code: 'INC-0099',
            title: pack.incident.title,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'inc-2026-0099',
              code: 'INC-0099',
              title: pack.incident.title,
              state: 'Reported',
              createdAt: '2026-02-12T10:00:00Z',
            },
          ],
        }),
      });
    });

    // 1. Navegar al Listado de Activos (/assets)
    await page.goto(`${ATLAS_BASE_URL}/assets`, { waitUntil: 'load' });
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

    // 2. Abrir ficha del Torno CNC
    await narrate(page, c.modTitle, c.sAssetViewTitle, c.sAssetViewDesc, 2400);
    const assetRow = page.locator('tbody tr, .cursor-pointer').first();
    await highlightElement(page, assetRow, 800);
    await moveAndClick(page, assetRow, 1100);
    await waitForPageReady(page, 1200);

    // 3. Explicar vínculo entre máquina de estados y botón de transición
    await narrate(page, c.modTitle, c.sStateMachineLinkTitle, c.sStateMachineLinkDesc, 2800);
    const transitionContainer = page.locator('text=Cambiar Estado a:, text=Change State to:').locator('..').first();
    if (await transitionContainer.isVisible().catch(() => false)) {
      await highlightElement(page, transitionContainer, 1100);
    }

    // 4. Disparar transición a "En Falla" / "In Fault"
    await narrate(page, c.modTitle, c.sTriggerTransitionTitle, c.sTriggerTransitionDesc, 2600);
    const faultBtn = page.getByRole('button', { name: new RegExp(targetFaultState, 'i') }).first();
    await highlightElement(page, faultBtn, 800);
    await moveAndClick(page, faultBtn, 1000);

    // 5. Drawer lateral automático de Incidencia (ReportIncidentSheet)
    await narrate(page, c.modTitle, c.sDelegationSheetTitle, c.sDelegationSheetDesc, 2800);
    const incidentSheet = page.getByRole('dialog').first();
    await incidentSheet.waitFor({ state: 'visible', timeout: 8000 });
    await highlightElement(page, incidentSheet, 1200);

    // 6. SELECCIÓN DE PLANTILLA DE LA INCIDENCIA (WorkflowTemplateId)
    await narrate(page, c.modTitle, c.sSelectTplTitle, c.sSelectTplDesc, 2800);
    const tplSelectTrigger = incidentSheet.locator('button[role="combobox"]').first();
    if (await tplSelectTrigger.isVisible().catch(() => false)) {
      await highlightElement(page, tplSelectTrigger, 700);
      await moveAndClick(page, tplSelectTrigger, 800);

      const tplOption = page.locator('[role="option"]').first();
      if (await tplOption.isVisible().catch(() => false)) {
        await highlightElement(page, tplOption, 700);
        await moveAndClick(page, tplOption, 800);
      }
    }
    await waitForPageReady(page, 800);

    // 7. Capturar Título y Descripción de la avería
    await narrate(page, c.modTitle, c.sFillIncidentTitle, c.sFillIncidentDesc, 2600);
    const titleInput = incidentSheet.locator('input[name="title"]');
    if (await titleInput.isVisible().catch(() => false)) {
      await highlightElement(page, titleInput, 600);
      await moveAndType(page, titleInput, pack.incident.title, 35);
    }

    const descInput = incidentSheet.locator('textarea[name="description"]');
    if (await descInput.isVisible().catch(() => false)) {
      await moveAndType(page, descInput, pack.incident.description, 25);
    }

    // 8. Completar atributos dinámicos heredados de la plantilla de incidencia
    await narrate(page, c.modTitle, c.sDynamicAttrTitle, c.sDynamicAttrDesc, 2600);
    const rjsfInput = incidentSheet.locator('.rjsf-tailwind input, form input[id*="root_"]').first();
    if (await rjsfInput.isVisible().catch(() => false)) {
      await highlightElement(page, rjsfInput, 700);
      await moveAndType(page, rjsfInput, pack.incident.vibrationLevel, 35);
    }

    // 9. Guardar Incidencia y Bloquear Activo
    await narrate(page, c.modTitle, c.sSaveAndLockTitle, c.sSaveAndLockDesc, 2600);
    const submitBtn = incidentSheet.getByRole('button', { name: /Reportar|Report|Guardar|Save/i }).first();
    await highlightElement(page, submitBtn, 700);
    await moveAndClick(page, submitBtn, 1100);

    try {
      await incidentSheet.waitFor({ state: 'hidden', timeout: 6000 });
    } catch {
      const closeBtn = incidentSheet.getByRole('button', { name: /Cancelar|Cancel/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    }
    await waitForPageReady(page, 1000);

    // 10. Verificar que el estado del activo ahora es "En Falla" y verificar acordeón
    await narrate(page, c.modTitle, c.sAuditVerificationTitle, c.sAuditVerificationDesc, 2800);
    const badgeFault = page.locator('.badge, [class*="bg-destructive"], [class*="text-destructive"]').first();
    if (await badgeFault.isVisible().catch(() => false)) {
      await highlightElement(page, badgeFault, 1000);
    }

    const incidentsAccordion = page.locator('text=Incidencias Activas, text=Active Incidents').first();
    if (await incidentsAccordion.isVisible().catch(() => false)) {
      await highlightElement(page, incidentsAccordion, 1100);
    }

    await page.waitForTimeout(1000);
  } finally {
    await saveNamedVideo(
      session,
      `04-mantenimiento/01-transicion-estado-incidencia/transicion-estado-incidencia-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 04 — Transición de Estado y Delegación a Incidencias (ES / EN)', () => {
  test('transicion-estado-incidencia-es', async ({ browser }) => {
    await runIncidentTransitionTutorial(browser, 'es');
  });

  test('transicion-estado-incidencia-en', async ({ browser }) => {
    await runIncidentTransitionTutorial(browser, 'en');
  });
});