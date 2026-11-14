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
    sFinanceTabTitle: string;
    sFinanceTabDesc: string;
    sSummaryTitle: string;
    sSummaryDesc: string;
    sDepreciationTitle: string;
    sDepreciationDesc: string;
    sAdjustmentsTitle: string;
    sAdjustmentsDesc: string;
    sCustodyTitle: string;
    sCustodyDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    copy: {
      modTitle: 'GestiÃƒÂ³n de Activos Ã¢â‚¬â€ Finanzas, DepreciaciÃƒÂ³n y Custodia',
      sLangTitle: 'DemostraciÃƒÂ³n Multilenguaje',
      sLangDesc: 'Libro contable del activo, depreciaciÃƒÂ³n periÃƒÂ³dica, revalÃƒÂºos y control de resguardos.',
      sIntroTitle: 'GestiÃƒÂ³n Financiera del Ciclo de Vida',
      sIntroDesc: 'Control de costo de adquisiciÃƒÂ³n, valor residual, depreciaciÃƒÂ³n acumulada y valor en libros.',
      sOpenAssetTitle: 'Ficha TÃƒÂ©cnica del Torno CNC',
      sOpenAssetDesc: 'Accedemos a los datos del equipo para auditar su libro de activos fijos e historial contable.',
      sFinanceTabTitle: 'PestaÃƒÂ±a de Finanzas del Activo',
      sFinanceTabDesc: 'Panel financiero integral con resumen patrimonial, cronogramas de amortizaciÃƒÂ³n y resguardos.',
      sSummaryTitle: 'KPIs y Resumen Financiero',
      sSummaryDesc: 'Visualizamos costo inicial ($120,000 USD), valor de rescate y valor contable actual.',
      sDepreciationTitle: 'Tabla de DepreciaciÃƒÂ³n y AmortizaciÃƒÂ³n',
      sDepreciationDesc: 'Cronograma proyectado por lÃƒÂ­nea recta mensual para cierres contables y deducibilidad fiscal.',
      sAdjustmentsTitle: 'Ajustes de Valor y RevalÃƒÂºos',
      sAdjustmentsDesc: 'Registro de mejoras mayores, revalÃƒÂºos periciales o deterioro patrimonial del equipo.',
      sCustodyTitle: 'Control de Custodia y Resguardos',
      sCustodyDesc: 'Trazabilidad de asignaciÃƒÂ³n a tÃƒÂ©cnicos o cuadrillas con actas de entrega-recepciÃƒÂ³n digitales.',
    },
  },
  en: {
    copy: {
      modTitle: 'Asset Management Ã¢â‚¬â€ Fixed Assets Finance & Depreciation',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Asset accounting ledger, scheduled depreciation, asset revaluation, and custody transfers.',
      sIntroTitle: 'Lifecycle Financial Management',
      sIntroDesc: 'Tracking historical acquisition cost, salvage value, accumulated depreciation, and net book value.',
      sOpenAssetTitle: 'CNC Lathe Technical Sheet',
      sOpenAssetDesc: 'Opening equipment record to audit its fixed asset financial book and balance sheet items.',
      sFinanceTabTitle: 'Asset Finance & Accounting Tab',
      sFinanceTabDesc: 'Comprehensive financial dashboard featuring net worth cards, amortization schedules, and custody.',
      sSummaryTitle: 'Financial KPIs & Net Book Value',
      sSummaryDesc: 'Inspecting purchase cost ($120,000 USD), salvage reserve, and current balance sheet value.',
      sDepreciationTitle: 'Depreciation & Amortization Schedule',
      sDepreciationDesc: 'Projected straight-line monthly depreciation ledger for corporate accounting and tax reporting.',
      sAdjustmentsTitle: 'Value Adjustments & Revaluations',
      sAdjustmentsDesc: 'Auditing capital expenditure retrofits, technical appraisals, and asset impairment entries.',
      sCustodyTitle: 'Custody Transfers & Responsibility Logs',
      sCustodyDesc: 'Full chain of custody tracking assignments to engineers, shift leads, and work centers.',
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

async function runFinanceTutorial(browser: Browser, lang: Lang): Promise<void> {
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
              state: lang === 'es' ? 'Operativo' : 'Operative',
              stateColor: '#10b981',
              childrenCount: 3,
              pathNames: lang === 'es' ? 'Planta Monterrey > Celda Mecanizado' : 'Monterrey Plant > Machining Cell',
            },
          ],
          totalCount: 1,
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
            propertiesJson: '{}',
            installedAt: '2026-01-15T00:00:00Z',
          }),
        });
      }
      return route.continue();
    });

    // 3. Interceptar perfil financiero
    await page.route(`**/api/v1/assets/${assetId}/finance-profile`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'fb-001',
          assetId,
          acquisitionCost: 120000,
          residualValue: 12000,
          usefulLifeMonths: 120,
          depreciationMethod: 'StraightLine',
          frequencyMonths: 1,
          startDate: '2026-01-01',
          currency: 'USD',
          isActive: true,
          currentBookValue: 109200,
          accumulatedDepreciation: 10800,
        }),
      });
    });

    // 4. Interceptar cronograma de depreciaciÃƒÂ³n
    await page.route(`**/api/v1/assets/${assetId}/depreciation-schedule*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'sch-1', periodNumber: 1, periodDate: '2026-01-31', depreciationAmount: 900, accumulatedDepreciation: 900, bookValue: 119100, isPosted: true },
          { id: 'sch-2', periodNumber: 2, periodDate: '2026-02-28', depreciationAmount: 900, accumulatedDepreciation: 1800, bookValue: 118200, isPosted: true },
          { id: 'sch-3', periodNumber: 3, periodDate: '2026-03-31', depreciationAmount: 900, accumulatedDepreciation: 2700, bookValue: 117300, isPosted: false },
          { id: 'sch-4', periodNumber: 4, periodDate: '2026-04-30', depreciationAmount: 900, accumulatedDepreciation: 3600, bookValue: 116400, isPosted: false },
        ]),
      });
    });

    // 5. Interceptar ajustes de valor
    await page.route(`**/api/v1/assets/${assetId}/value-adjustments*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'adj-1',
            adjustmentType: 'Revaluation',
            adjustmentAmount: 5000,
            effectiveDate: '2026-02-01',
            reason: lang === 'es' ? 'InstalaciÃƒÂ³n de Sistema de RefrigeraciÃƒÂ³n Alta PresiÃƒÂ³n' : 'High-Pressure Coolant System Retrofit',
            performedBy: 'Ing. Rodrigo MÃƒÂ©ndez',
          },
        ]),
      });
    });

    // 6. Interceptar transferencias de custodia
    await page.route(`**/api/v1/assets/${assetId}/custody-transfers*`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'cust-1',
            transferType: 'Assignment',
            assignedToName: 'LÃƒÂ­der Celda Torneado CNC',
            locationName: 'Nave Industrial Norte',
            transferredAt: '2026-01-16T09:00:00Z',
            notes: lang === 'es' ? 'Entrega inicial de resguardo de activo' : 'Initial equipment custody sign-off',
          },
        ]),
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

    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2400);

    // 2. Abrir ficha del Torno CNC
    await narrate(page, c.modTitle, c.sOpenAssetTitle, c.sOpenAssetDesc, 2400);
    const assetRow = page.locator('tbody tr, .cursor-pointer').first();
    await highlightElement(page, assetRow, 800);
    await moveAndClick(page, assetRow, 1100);
    await waitForPageReady(page, 1200);

    // 3. Cambiar a pestaÃƒÂ±a Finanzas
    await narrate(page, c.modTitle, c.sFinanceTabTitle, c.sFinanceTabDesc, 2500);
    const financeTab = page.locator('[role="tab"][value="finanzas"], button[role="tab"]:has-text("Finanzas"), button[role="tab"]:has-text("Finance")').first();
    await highlightElement(page, financeTab, 800);
    await moveAndClick(page, financeTab, 900);
    await waitForPageReady(page, 1000);

    // 4. Resaltar Tarjeta de Resumen y KPIs Financieros
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2600);
    const summaryCard = page.locator('.grid.gap-4, .bg-card').first();
    if (await summaryCard.isVisible().catch(() => false)) {
      await highlightElement(page, summaryCard, 1200);
    }

    // 5. Resaltar Tabla de DepreciaciÃƒÂ³n
    await narrate(page, c.modTitle, c.sDepreciationTitle, c.sDepreciationDesc, 2600);
    const subTabSchedule = page.locator('button[role="tab"]:has-text("DepreciaciÃƒÂ³n"), button[role="tab"]:has-text("Schedule")').first();
    if (await subTabSchedule.isVisible().catch(() => false)) {
      await moveAndClick(page, subTabSchedule, 700);
    }
    const scheduleTable = page.locator('table').first();
    if (await scheduleTable.isVisible().catch(() => false)) {
      await highlightElement(page, scheduleTable, 1200);
    }

    // 6. Sub-tab de Ajustes de Valor
    await narrate(page, c.modTitle, c.sAdjustmentsTitle, c.sAdjustmentsDesc, 2600);
    const subTabAdjustments = page.locator('button[role="tab"]:has-text("Ajustes"), button[role="tab"]:has-text("Adjustments")').first();
    if (await subTabAdjustments.isVisible().catch(() => false)) {
      await highlightElement(page, subTabAdjustments, 600);
      await moveAndClick(page, subTabAdjustments, 800);
    }

    // 7. Sub-tab de Custodia / Resguardos
    await narrate(page, c.modTitle, c.sCustodyTitle, c.sCustodyDesc, 2600);
    const subTabCustody = page.locator('button[role="tab"]:has-text("Custodia"), button[role="tab"]:has-text("Custody")').first();
    if (await subTabCustody.isVisible().catch(() => false)) {
      await highlightElement(page, subTabCustody, 600);
      await moveAndClick(page, subTabCustody, 800);
    }

    await page.waitForTimeout(1000);
  } finally {
    await saveNamedVideo(
      session,
      `03-activos/06-finanzas-depreciacion/finanzas-activos-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 03F Ã¢â‚¬â€ Finanzas, DepreciaciÃƒÂ³n y Custodia de Activos (ES / EN)', () => {
  test('finanzas-activos-es', async ({ browser }) => {
    await runFinanceTutorial(browser, 'es');
  });

  test('finanzas-activos-en', async ({ browser }) => {
    await runFinanceTutorial(browser, 'en');
  });
});
