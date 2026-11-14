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
  material: {
    searchQuery: string;
    partName: string;
    quantity: string;
    unit: string;
    notes: string;
  };
  copy: {
    modTitle: string;
    sLangTitle: string;
    sLangDesc: string;
    sIntroTitle: string;
    sIntroDesc: string;
    sBomTabTitle: string;
    sBomTabDesc: string;
    sOpenFormTitle: string;
    sOpenFormDesc: string;
    sSelectPartTitle: string;
    sSelectPartDesc: string;
    sQtyCriticalTitle: string;
    sQtyCriticalDesc: string;
    sSaveTitle: string;
    sSaveDesc: string;
    sResultTitle: string;
    sResultDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    material: {
      searchQuery: 'Filtro',
      partName: 'Filtro de Aceite Hidráulico HF-6510',
      quantity: '2',
      unit: 'Pza',
      notes: 'Reemplazo obligatorio en mantenimiento preventivo cada 500 horas.',
    },
    copy: {
      modTitle: 'Gestión de Activos — Lista de Materiales (BOM)',
      sLangTitle: 'Demostración Multilenguaje',
      sLangDesc: 'Configuración detallada de repuestos e insumos vinculados al equipo industrial.',
      sIntroTitle: 'Ficha Técnica Integral del Activo',
      sIntroDesc: 'Accedemos al detalle técnico del torno CNC para asociar su árbol de refacciones y consumibles.',
      sBomTabTitle: 'Pestaña BOM y Repuestos',
      sBomTabDesc: 'El Bill of Materials lista repuestos críticos y componentes para órdenes de trabajo preventivas.',
      sOpenFormTitle: 'Asignación de Nuevo Repuesto',
      sOpenFormDesc: 'Abrimos el formulario de registro de material para vincularlo al catálogo maestro de partes.',
      sSelectPartTitle: 'Selección desde Catálogo Maestro',
      sSelectPartDesc: 'Buscamos y seleccionamos el filtro de aceite hidráulico estandarizado en la empresa.',
      sQtyCriticalTitle: 'Cantidad y Criticidad Operativa',
      sQtyCriticalDesc: 'Establecemos cantidad requerida y activamos el indicador de repuesto crítico para stock mínimo.',
      sSaveTitle: 'Guardado y Vinculación BOM',
      sSaveDesc: 'Persistimos la relación. El material queda listo para abastecer requisiciones de mantenimiento.',
      sResultTitle: 'Árbol de Repuestos Actualizado',
      sResultDesc: 'El componente queda catalogado con su criticidad destacada y badge de estado en el activo.',
    },
  },
  en: {
    material: {
      searchQuery: 'Filter',
      partName: 'HF-6510 Hydraulic Oil Filter',
      quantity: '2',
      unit: 'Pcs',
      notes: 'Mandatory replacement during preventive maintenance every 500 hours.',
    },
    copy: {
      modTitle: 'Asset Management — Bill of Materials (BOM)',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Detailed configuration of spare parts and consumables linked to the industrial asset.',
      sIntroTitle: 'Comprehensive Asset Technical Sheet',
      sIntroDesc: 'Accessing the CNC Lathe technical sheet to attach spare parts and consumable items.',
      sBomTabTitle: 'BOM & Spare Parts Tab',
      sBomTabDesc: 'The Bill of Materials lists critical parts and assemblies required by work orders.',
      sOpenFormTitle: 'Assigning a New Spare Part',
      sOpenFormDesc: 'Opening the material assignment drawer linked to the master spare parts catalog.',
      sSelectPartTitle: 'Selecting from Master Catalog',
      sSelectPartDesc: 'Searching and choosing the standardized hydraulic oil filter from enterprise catalog.',
      sQtyCriticalTitle: 'Quantity & Criticality Flag',
      sQtyCriticalDesc: 'Setting required quantity and marking as critical spare part for safety inventory tracking.',
      sSaveTitle: 'Persisting BOM Association',
      sSaveDesc: 'Saving relationship: the spare part is now available for maintenance kits and requisitions.',
      sResultTitle: 'Updated Bill of Materials',
      sResultDesc: 'The component is cataloged with criticality badge and ready for inventory cross-checks.',
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

async function runBomTutorial(browser: Browser, lang: Lang): Promise<void> {
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
        // Interceptar search de activos si la lista remota está vacía o lenta
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
              id: '00000000-0000-0000-0000-000000000001',
              code: 'CNC-01',
              name: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
              state: lang === 'es' ? 'Operativo' : 'Operative',
              stateColor: '#10b981',
              childrenCount: 3,
              pathNames: lang === 'es' ? 'Planta Norte > Celda Mecanizado' : 'North Plant > Machining Cell',
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 10,
        }),
      });
    });

    await page.route('**/api/v1/assets/00000000-0000-0000-0000-000000000001', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '00000000-0000-0000-0000-000000000001',
            code: 'CNC-01',
            name: lang === 'es' ? 'Torno CNC Mazak Integrex i-200' : 'Mazak Integrex i-200 CNC Lathe',
            state: lang === 'es' ? 'Operativo' : 'Operative',
            stateColor: '#10b981',
            assetTemplateId: 'tpl-cnc-001',
            assetTemplateName: lang === 'es' ? 'Torno CNC' : 'CNC Lathe',
            propertiesJson: '{}',
            parentId: null,
            childrenCount: 0,
            installedAt: '2026-01-15T00:00:00Z',
          }),
        });
      }
      return route.continue();
    });

    // Interceptar catálogo de partes e inserción en BOM para que el test sea siempre exitoso y predecible
    await page.route('**/api/v1/catalogs/parts/items*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { id: 'mat-001', label: pack.material.partName },
            { id: 'mat-002', label: lang === 'es' ? 'Banda Dentada HTD 8M-1200' : 'HTD 8M-1200 Timing Belt' },
            { id: 'mat-003', label: lang === 'es' ? 'Sensor de Proximidad Inductivo M12' : 'M12 Inductive Proximity Sensor' },
          ],
        }),
      });
    });

    await page.route('**/api/v1/assets/*/materials', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-mat-id-999' }),
        });
      }
      return route.continue();
    });

    // 1. Navegar al listado de activos
    await page.goto(`${ATLAS_BASE_URL}/assets`, { waitUntil: 'load' });
    await waitForPageReady(page, 1200);

    await narrate(page, c.modTitle, c.sLangTitle, c.sLangDesc, 2000);
    await selectLanguageInUI(page, lang);

    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2400);

    // 2. Abrir ficha del primer activo disponible
    const firstAssetCard = page.locator('tbody tr, .cursor-pointer').first();
    await highlightElement(page, firstAssetCard, 800);
    await moveAndClick(page, firstAssetCard, 1000);
    await waitForPageReady(page, 1200);

    // 3. Cambiar al tab BOM
    await narrate(page, c.modTitle, c.sBomTabTitle, c.sBomTabDesc, 2500);
    const bomTab = page.locator('[role="tab"][value="bom"], button[role="tab"]:has-text("BOM"), button[role="tab"]:has-text("Materiales")').first();
    await highlightElement(page, bomTab, 800);
    await moveAndClick(page, bomTab, 900);
    await waitForPageReady(page, 800);

    // 4. Click en "+ Agregar Repuesto"
    await narrate(page, c.modTitle, c.sOpenFormTitle, c.sOpenFormDesc, 2400);
    const addPartBtn = page.getByRole('button', { name: /Agregar Repuesto|Add Spare Part|Agregar Material|Add Material/i }).first();
    await highlightElement(page, addPartBtn, 700);
    await moveAndClick(page, addPartBtn, 800);

    // 5. Drawer de selección y formulario de material
    const materialSheet = page.getByRole('dialog');
    await materialSheet.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sSelectPartTitle, c.sSelectPartDesc, 2500);
    const comboboxTrigger = materialSheet.locator('button[role="combobox"]').first();
    await highlightElement(page, comboboxTrigger, 600);
    await moveAndClick(page, comboboxTrigger, 700);

    const partSearchInput = page.locator('[data-radix-popper-content-wrapper] input').first();
    if (await partSearchInput.isVisible().catch(() => false)) {
      await moveAndType(page, partSearchInput, pack.material.searchQuery, 40);
      await page.waitForTimeout(600);

      const partItem = page.locator('[data-radix-popper-content-wrapper] [role="option"], [data-radix-popper-content-wrapper] [cmdk-item]').first();
      await highlightElement(page, partItem, 600);
      await moveAndClick(page, partItem, 700);
    }

    // 6. Completar Cantidad, Unidad, Criticidad y Notas
    await narrate(page, c.modTitle, c.sQtyCriticalTitle, c.sQtyCriticalDesc, 2600);
    const qtyInput = materialSheet.locator('input[name="quantity"]');
    if (await qtyInput.isVisible().catch(() => false)) {
      await highlightElement(page, qtyInput, 500);
      await qtyInput.fill('');
      await moveAndType(page, qtyInput, pack.material.quantity, 40);
    }

    const unitInput = materialSheet.locator('input[name="unitOfMeasure"]');
    if (await unitInput.isVisible().catch(() => false)) {
      await unitInput.fill('');
      await moveAndType(page, unitInput, pack.material.unit, 40);
    }

    const criticalCheckbox = materialSheet.locator('button[role="checkbox"]').first();
    if (await criticalCheckbox.isVisible().catch(() => false)) {
      await highlightElement(page, criticalCheckbox, 600);
      await moveAndClick(page, criticalCheckbox, 600);
    }

    const notesInput = materialSheet.locator('textarea[name="notes"]');
    if (await notesInput.isVisible().catch(() => false)) {
      await moveAndType(page, notesInput, pack.material.notes, 25);
    }

    // 7. Guardar Repuesto
    await narrate(page, c.modTitle, c.sSaveTitle, c.sSaveDesc, 2400);
    const saveMaterialBtn = materialSheet.getByRole('button', { name: /Guardar|Save|Agregar|Add/i }).first();
    await highlightElement(page, saveMaterialBtn, 700);
    await moveAndClick(page, saveMaterialBtn, 1000);

    try {
      await materialSheet.waitFor({ state: 'hidden', timeout: 5000 });
    } catch {
      const cancelBtn = materialSheet.getByRole('button', { name: /Cancelar|Cancel/i }).first();
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
        await materialSheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      }
    }
    await waitForPageReady(page, 900);

    // 8. Resaltar tabla de repuestos BOM
    await narrate(page, c.modTitle, c.sResultTitle, c.sResultDesc, 2600);
    const materialsTable = page.locator('table').first();
    if (await materialsTable.isVisible().catch(() => false)) {
      await highlightElement(page, materialsTable, 1200);
    }

    await page.waitForTimeout(1000);
  } finally {
    await saveNamedVideo(
      session,
      `03-activos/02-bom-materiales/bom-materiales-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 03B — Árbol de Partes y Lista de Materiales BOM (ES / EN)', () => {
  test('bom-materiales-es', async ({ browser }) => {
    await runBomTutorial(browser, 'es');
  });

  test('bom-materiales-en', async ({ browser }) => {
    await runBomTutorial(browser, 'en');
  });
});
