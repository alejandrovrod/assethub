import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  initTutorialOverlay,
  narrate,
  moveAndClick,
  highlightElement,
  waitForPageReady,
} from '../../helpers/tutorial-recorder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ATLAS_BASE_URL = 'http://atlas-industrial.localhost:5173';
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/09-dashboard-analitico/01-kpis-confiabilidad-tco');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-09');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 09: Dashboard Analítico, Confiabilidad y TCO',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Centro de Inteligencia Operativa y Mantenimiento',
    sIntroDesc: 'Monitorea en tiempo real los indicadores clave de rendimiento (KPIs), confiabilidad de activos y costos acumulados de ciclo de vida.',
    sReliabilityCardTitle: 'Métricas de Confiabilidad (MTBF y MTTR)',
    sReliabilityCardDesc: 'Calcula el Tiempo Medio Entre Fallas (MTBF) y Tiempo Medio de Reparación (MTTR) a nivel global o por activo individual.',
    sTcoChartTitle: 'Desglose del Costo Total de Propiedad (TCO)',
    sTcoChartDesc: 'Analiza los costos acumulados distinguiendo entre mano de obra técnica, consumo de repuestos y servicios externos contratados.',
    sAssetTableTitle: 'Ranking de Confiabilidad por Activo',
    sAssetTableDesc: 'Identifica los equipos críticos con mayor tasa de intervención correctiva y horas de parada en planta.',
    sSummaryTitle: 'Panel Analítico Listo',
    sSummaryDesc: 'Toda la telemetría operativa y financiera del parque de activos se consolida para la toma de decisiones informadas.',
  },
  en: {
    modTitle: 'Module 09: Analytics Dashboard, Reliability & TCO',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Operational Intelligence & Maintenance Command Center',
    sIntroDesc: 'Monitor real-time maintenance KPIs, plant reliability benchmarks, and lifecycle cost accumulation.',
    sReliabilityCardTitle: 'Reliability Metrics (MTBF & MTTR)',
    sReliabilityCardDesc: 'Calculates Mean Time Between Failures (MTBF) and Mean Time to Repair (MTTR) globally or per asset unit.',
    sTcoChartTitle: 'Total Cost of Ownership (TCO) Breakdown',
    sTcoChartDesc: 'Analyzes lifecycle expenditures segregated across labor hours, spare parts consumption, and third-party contracts.',
    sAssetTableTitle: 'Asset Reliability Ranking',
    sAssetTableDesc: 'Spotlights high-criticality machinery with highest failure frequencies and cumulative downtime in the factory.',
    sSummaryTitle: 'Operational Dashboard Verified',
    sSummaryDesc: 'Asset operational telemetry and maintenance financials are synchronized for strategic decision-making.',
  },
};

async function runDashboardTutorial(browser: any, lang: 'es' | 'en') {
  const c = COPY[lang];
  const authStatePath = path.resolve(__dirname, `../../.auth/atlas-admin-${lang}.json`);

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

  const mockReliability = {
    scope: 'tenant',
    mtbfHours: 348.5,
    mttrRestoreHours: 3.2,
    mttrRepairHours: 2.4,
    correctiveOrderCount: 14,
    availabilityPercent: 99.1,
  };

  const mockTco = {
    currency: 'MXN',
    totalCost: 285400,
    laborCost: 98000,
    partsCost: 145400,
    externalServicesCost: 42000,
  };

  const mockRanking = [
    {
      assetId: 'ast-001',
      assetCode: 'CNC-MCH-001',
      assetName: lang === 'es' ? 'Centro de Mecanizado 5 Ejes DMG MORI' : 'DMG MORI 5-Axis Machining Center',
      mtbfHours: 420.0,
      mttrHours: 2.1,
      totalFailures: 3,
      totalDowntimeHours: 6.3,
    },
    {
      assetId: 'ast-002',
      assetCode: 'HYD-PRS-500',
      assetName: lang === 'es' ? 'Prensa Hidráulica de Estampado 500T' : '500T Stamping Hydraulic Press',
      mtbfHours: 215.4,
      mttrHours: 4.8,
      totalFailures: 7,
      totalDowntimeHours: 33.6,
    },
    {
      assetId: 'ast-003',
      assetCode: 'COMP-ROT-01',
      assetName: lang === 'es' ? 'Compresor de Aire a Tornillo Atlas Copco' : 'Atlas Copco Rotary Screw Compressor',
      mtbfHours: 580.2,
      mttrHours: 1.5,
      totalFailures: 2,
      totalDowntimeHours: 3.0,
    },
  ];

  try {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    // Mock auth/profile
    await page.route('**/api/v1/auth/me*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'c016fe84-846c-48a3-81ca-6de48a2be410',
          email: ATLAS_ADMIN.email,
          fullName: 'Ing. Roberto Méndez',
          roles: ['Tenant Admin'],
          permissions: ['analytics:read', 'assets:read', 'maintenance:read'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock reliability metrics
    await page.route(/\/api\/v1\/analytics\/reliability(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockReliability),
      });
    });

    // Mock TCO breakdown
    await page.route(/\/api\/v1\/analytics\/tco(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTco),
      });
    });

    // Mock asset reliability ranking table
    await page.route(/\/api\/v1\/analytics\/assets-reliability(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRanking),
      });
    });

    // PASO 1: Navegar a /dashboard
    await page.goto(`${ATLAS_BASE_URL}/dashboard`, { waitUntil: 'load' });
    await waitForPageReady(page, 1500);

    // Idioma
    await narrate(page, c.modTitle, c.sLangTitle, c.sLangDesc, 2000);
    const langBtn = page.locator('button:has(svg.lucide-languages)').first();
    if (await langBtn.isVisible().catch(() => false)) {
      await page.waitForTimeout(400);
      try {
        await highlightElement(page, langBtn, 700);
        await moveAndClick(page, langBtn, 500);
        const menuItem = page.getByRole('menuitem').nth(lang === 'es' ? 0 : 1);
        if (await menuItem.isVisible().catch(() => false)) {
          await moveAndClick(page, menuItem, 700);
        }
      } catch (e) {
        console.warn('Lang skip:', e);
      }
    }

    // PASO 2: Introducción a la Consola de Inteligencia de Mantenimiento
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 3000);

    // PASO 3: Tarjeta de Métricas de Confiabilidad (MTBF & MTTR)
    await narrate(page, c.modTitle, c.sReliabilityCardTitle, c.sReliabilityCardDesc, 3200);
    const reliabilityCard = page.locator('.grid.grid-cols-1.gap-4.lg\\:grid-cols-2 > div').first();
    if (await reliabilityCard.isVisible().catch(() => false)) {
      await highlightElement(page, reliabilityCard, 1200);
    }

    // PASO 4: Gráfico / Desglose de Costo Total de Propiedad (TCO)
    await narrate(page, c.modTitle, c.sTcoChartTitle, c.sTcoChartDesc, 3200);
    const tcoCard = page.locator('.grid.grid-cols-1.gap-4.lg\\:grid-cols-2 > div').nth(1);
    if (await tcoCard.isVisible().catch(() => false)) {
      await highlightElement(page, tcoCard, 1200);
    }

    // PASO 5: Tabla de Ranking de Confiabilidad por Activo
    await narrate(page, c.modTitle, c.sAssetTableTitle, c.sAssetTableDesc, 3200);
    const assetTable = page.locator('table').first();
    if (await assetTable.isVisible().catch(() => false)) {
      await highlightElement(page, assetTable, 1300);
    }

    // PASO 6: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `dashboard-kpis-confiabilidad-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 09 — Dashboard Analítico y KPIs de Confiabilidad (ES / EN)', () => {
  test.setTimeout(300_000);

  test('dashboard-kpis-confiabilidad-es', async ({ browser }) => {
    await runDashboardTutorial(browser, 'es');
  });

  test('dashboard-kpis-confiabilidad-en', async ({ browser }) => {
    await runDashboardTutorial(browser, 'en');
  });
});

