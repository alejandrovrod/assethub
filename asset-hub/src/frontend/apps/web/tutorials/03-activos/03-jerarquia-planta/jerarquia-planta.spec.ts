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
    sHierarchyTabTitle: string;
    sHierarchyTabDesc: string;
    sStructureTitle: string;
    sStructureDesc: string;
    sChangeParentTitle: string;
    sChangeParentDesc: string;
    sSelectParentTitle: string;
    sSelectParentDesc: string;
    sConfirmTitle: string;
    sConfirmDesc: string;
    sResultTitle: string;
    sResultDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    copy: {
      modTitle: 'Gestión de Activos — Jerarquía y Relación Padre-Hijo',
      sLangTitle: 'Demostración Multilenguaje',
      sLangDesc: 'Configuración de la estructura organizacional y ubicación técnica en planta.',
      sIntroTitle: 'Inventario y Árbol de Planta',
      sIntroDesc: 'La estructura de activos modela la jerarquía física: Plantas > Celdas de Trabajo > Maquinaria > Componentes.',
      sOpenAssetTitle: 'Acceso a la Ficha Técnica',
      sOpenAssetDesc: 'Abrimos el equipo industrial para gestionar sus dependencias estructurales y componentes hijos.',
      sHierarchyTabTitle: 'Pestaña de Jerarquía Organizacional',
      sHierarchyTabDesc: 'Muestra visualmente el activo superior inmediato y todos los subsistemas subordinados.',
      sStructureTitle: 'Análisis de Dependencias y Subsistemas',
      sStructureDesc: 'Verificamos los componentes acoplados al equipo: husillo principal, motor reductor y torreta CNC.',
      sChangeParentTitle: 'Reasignación de Activo Superior',
      sChangeParentDesc: 'Abrimos el asistente de movimiento para reubicar este equipo dentro de otra celda productiva.',
      sSelectParentTitle: 'Selección de la Nueva Celda o Línea',
      sSelectParentDesc: 'Elegimos la "Línea de Producción Automatizada 02" como nuevo contenedor padre.',
      sConfirmTitle: 'Confirmación y Propagación de Estados',
      sConfirmDesc: 'Guardamos la nueva relación. La trazabilidad y costos se consolidan automáticamente hacia el padre.',
      sResultTitle: 'Jerarquía Industrial Actualizada',
      sResultDesc: 'El activo queda reubicado en el organigrama operativo con navegación bidireccional entre niveles.',
    },
  },
  en: {
    copy: {
      modTitle: 'Asset Management — Plant Hierarchy & Parent-Child Model',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Configuring organizational equipment trees and plant locations step-by-step.',
      sIntroTitle: 'Asset Inventory & Plant Tree',
      sIntroDesc: 'The asset tree models physical topology: Plants > Production Cells > Machines > Components.',
      sOpenAssetTitle: 'Accessing Technical Equipment Sheet',
      sOpenAssetDesc: 'Opening the industrial equipment to inspect structural dependencies and child sub-assemblies.',
      sHierarchyTabTitle: 'Organizational Hierarchy Tab',
      sHierarchyTabDesc: 'Visually displays the immediate parent container and all subordinate sub-components.',
      sStructureTitle: 'Subsystems & Sub-assembly Inspection',
      sStructureDesc: 'Inspecting attached assemblies: primary electrospindle, servo drive, and motorized turret.',
      sChangeParentTitle: 'Reassigning Parent Container',
      sChangeParentDesc: 'Opening the transfer dialog to relocate this machinery into another automated production line.',
      sSelectParentTitle: 'Selecting New Production Line',
      sSelectParentDesc: 'Selecting "Automated Production Line 02" as the new topological parent container.',
      sConfirmTitle: 'Confirming Relocation & Cost Rollup',
      sConfirmDesc: 'Persisting new hierarchy. Maintenance tracking and MTBF roll up seamlessly to the new parent.',
      sResultTitle: 'Updated Operational Hierarchy',
      sResultDesc: 'The machine is repositioned in the plant topology with bidirectional tree navigation.',
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

async function runHierarchyTutorial(browser: Browser, lang: Lang): Promise<void> {
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
    const parentId1 = '00000000-0000-0000-0000-000000000010';
    const parentId2 = '00000000-0000-0000-0000-000000000020';

    let currentParentId: string | null = parentId1;

    // 1. Interceptar listado de búsqueda para asegurar que siempre haya activos en la tabla
    await page.route('**/api/v1/assets/search', async (route) => {
      const response = await route.fetch();
      if (response.ok()) {
        const json = await response.json();
        if (json.items && json.items.length > 0) {
          return route.fulfill({ response });
        }
      }
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
              parentId: currentParentId,
              pathNames: lang === 'es' ? 'Planta Norte > Celda Mecanizado 01' : 'North Plant > Machining Cell 01',
            },
            {
              id: parentId1,
              code: 'CELL-01',
              name: lang === 'es' ? 'Celda de Mecanizado 01' : 'Machining Cell 01',
              state: lang === 'es' ? 'Operativo' : 'Operative',
              stateColor: '#10b981',
              childrenCount: 4,
              parentId: null,
            },
            {
              id: parentId2,
              code: 'LINE-02',
              name: lang === 'es' ? 'Línea Automatizada 02' : 'Automated Line 02',
              state: lang === 'es' ? 'Operativo' : 'Operative',
              stateColor: '#10b981',
              childrenCount: 6,
              parentId: null,
            },
          ],
          totalCount: 3,
          page: 1,
          pageSize: 10,
        }),
      });
    });

    // 2. Interceptar detalle del activo
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
            assetTemplateName: lang === 'es' ? 'Torno CNC' : 'CNC Lathe',
            parentId: currentParentId,
            parentName: currentParentId === parentId2 
              ? (lang === 'es' ? 'Línea Automatizada 02' : 'Automated Line 02')
              : (lang === 'es' ? 'Celda de Mecanizado 01' : 'Machining Cell 01'),
            children: [
              { id: 'sub-01', code: 'SPIN-01', name: lang === 'es' ? 'Electromandril Principal 12000 RPM' : 'Main Electrospindle 12000 RPM' },
              { id: 'sub-02', code: 'TURR-01', name: lang === 'es' ? 'Torreta Motorizada BMT-65' : 'Motorized Turret BMT-65' },
              { id: 'sub-03', code: 'CHIP-01', name: lang === 'es' ? 'Extractor de Virutas Continuo' : 'Continuous Chip Conveyor' },
            ],
            propertiesJson: '{}',
            installedAt: '2026-01-15T00:00:00Z',
          }),
        });
      }
      return route.continue();
    });

    // 3. Interceptar lista completa de activos
    await page.route('**/api/v1/assets', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              { id: parentId1, code: 'CELL-01', name: lang === 'es' ? 'Celda de Mecanizado 01' : 'Machining Cell 01' },
              { id: parentId2, code: 'LINE-02', name: lang === 'es' ? 'Línea Automatizada 02' : 'Automated Line 02' },
            ],
          }),
        });
      }
      return route.continue();
    });

    // 4. Interceptar movimiento de padre
    await page.route(`**/api/v1/assets/${assetId}/move`, async (route) => {
      if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
        const postData = route.request().postDataJSON() || {};
        currentParentId = postData.newParentId ?? parentId2;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
      return route.continue();
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

    // 3. Cambiar a pestaña Jerarquía
    await narrate(page, c.modTitle, c.sHierarchyTabTitle, c.sHierarchyTabDesc, 2500);
    const hierarchyTab = page.locator('[role="tab"][value="hierarchy"], button[role="tab"]:has-text("Jerarquía"), button[role="tab"]:has-text("Hierarchy")').first();
    await highlightElement(page, hierarchyTab, 800);
    await moveAndClick(page, hierarchyTab, 900);
    await waitForPageReady(page, 800);

    // 4. Resaltar estructura de dependencias y subsistemas
    await narrate(page, c.modTitle, c.sStructureTitle, c.sStructureDesc, 2600);
    const hierarchyCard = page.locator('.space-y-4').first();
    if (await hierarchyCard.isVisible().catch(() => false)) {
      await highlightElement(page, hierarchyCard, 1100);
    }

    // 5. Click en "Cambiar Padre"
    await narrate(page, c.modTitle, c.sChangeParentTitle, c.sChangeParentDesc, 2500);
    const changeParentBtn = page.getByRole('button', { name: /Cambiar Padre|Change Parent/i }).first();
    const canClickChange = await changeParentBtn.isVisible().catch(() => false);
    if (canClickChange) {
      await highlightElement(page, changeParentBtn, 700);
      await moveAndClick(page, changeParentBtn, 800);

      const moveDialog = page.getByRole('dialog').first();
      if (await moveDialog.isVisible().catch(() => false)) {
        await narrate(page, c.modTitle, c.sSelectParentTitle, c.sSelectParentDesc, 2500);
        const selectTrigger = moveDialog.locator('button[role="combobox"]').first();
        if (await selectTrigger.isVisible().catch(() => false)) {
          await highlightElement(page, selectTrigger, 600);
          await moveAndClick(page, selectTrigger, 700);

          const targetOption = page.locator('[role="option"]').last();
          if (await targetOption.isVisible().catch(() => false)) {
            await highlightElement(page, targetOption, 600);
            await moveAndClick(page, targetOption, 700);
          }
        }

        // 7. Guardar asignación
        await narrate(page, c.modTitle, c.sConfirmTitle, c.sConfirmDesc, 2400);
        const saveMoveBtn = moveDialog.getByRole('button', { name: /Guardar|Save|Mover|Move/i }).first();
        if (await saveMoveBtn.isVisible().catch(() => false)) {
          await highlightElement(page, saveMoveBtn, 700);
          await moveAndClick(page, saveMoveBtn, 1000);
        }

        const cancelBtn = moveDialog.getByRole('button', { name: /Cancelar|Cancel/i }).first();
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.click();
        }
      }
    } else {
      await narrate(page, c.modTitle, c.sSelectParentTitle, c.sSelectParentDesc, 2500);
      const parentBadge = page.locator('text=Celda, text=Cell, .badge').first();
      if (await parentBadge.isVisible().catch(() => false)) {
        await highlightElement(page, parentBadge, 900);
      }
      await narrate(page, c.modTitle, c.sConfirmTitle, c.sConfirmDesc, 2400);
    }

    await waitForPageReady(page, 900);

    // 8. Resaltar estado final de la jerarquía
    await narrate(page, c.modTitle, c.sResultTitle, c.sResultDesc, 2600);
    const updatedCard = page.locator('.space-y-4').first();
    if (await updatedCard.isVisible().catch(() => false)) {
      await highlightElement(page, updatedCard, 1100);
    }

    await page.waitForTimeout(1000);
  } finally {
    await saveNamedVideo(
      session,
      `03-activos/03-jerarquia-planta/jerarquia-activos-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 03C — Jerarquía de Planta y Relación Padre-Hijo (ES / EN)', () => {
  test('jerarquia-activos-es', async ({ browser }) => {
    await runHierarchyTutorial(browser, 'es');
  });

  test('jerarquia-activos-en', async ({ browser }) => {
    await runHierarchyTutorial(browser, 'en');
  });
});