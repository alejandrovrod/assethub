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
    sMapTabTitle: string;
    sMapTabDesc: string;
    sCoordinatesTitle: string;
    sCoordinatesDesc: string;
    sGeofenceTitle: string;
    sGeofenceDesc: string;
    sFullscreenTitle: string;
    sFullscreenDesc: string;
    sGlobalMapTitle: string;
    sGlobalMapDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, TutorialData> = {
  es: {
    copy: {
      modTitle: 'Gestión de Activos — Ubicación Geoespacial y Mapas',
      sLangTitle: 'Demostración Multilenguaje',
      sLangDesc: 'Georreferenciación de activos, coordenadas GPS, polígonos de planta y visualización global.',
      sIntroTitle: 'Georreferenciación en Planta Industrial',
      sIntroDesc: 'La ubicación precisa permite a las brigadas de mantenimiento localizar equipos en predios extensos.',
      sOpenAssetTitle: 'Ficha Técnica del Torno CNC',
      sOpenAssetDesc: 'Accedemos a los datos técnicos para consultar y ajustar su geoposicionamiento en planta.',
      sMapTabTitle: 'Pestaña de Ubicación y Mapas',
      sMapTabDesc: 'Visualizador cartográfico con mapas vectoriales satelitales, pines de estado y polígonos GeoJSON.',
      sCoordinatesTitle: 'Pin de Coordenadas y Estado del Activo',
      sCoordinatesDesc: 'El marcador refleja la posición exacta en nave industrial con color representativo de su estado operativo.',
      sGeofenceTitle: 'Herramientas de Delimitación y Geocercas',
      sGeofenceDesc: 'Permite dibujar perímetros de seguridad, celdas de trabajo y zonas restringidas de mantenimiento.',
      sFullscreenTitle: 'Modo Pantalla Completa y Navegación',
      sFullscreenDesc: 'Maximizamos el mapa para inspección detallada de layout, distancias y accesos logísticos.',
      sGlobalMapTitle: 'Mapa Global de Activos de la Empresa',
      sGlobalMapDesc: 'Visualización consolidada de todo el parque de maquinaria distribuido entre plantas y naves.',
    },
  },
  en: {
    copy: {
      modTitle: 'Asset Management — Geospatial Location & Maps',
      sLangTitle: 'Multilanguage Walkthrough',
      sLangDesc: 'Asset georeferencing, GPS coordinates, plant geofences, and fleet map view.',
      sIntroTitle: 'Industrial Geolocation & Site Mapping',
      sIntroDesc: 'Precise positioning allows field technicians to rapidly locate assets across large industrial sites.',
      sOpenAssetTitle: 'CNC Lathe Technical Sheet',
      sOpenAssetDesc: 'Opening equipment record to inspect and manage its geospatial plant placement.',
      sMapTabTitle: 'Location & Map Visualization Tab',
      sMapTabDesc: 'Interactive cartographic viewer featuring satellite tiles, status markers, and GeoJSON boundaries.',
      sCoordinatesTitle: 'GPS Pin & Real-Time Operational State',
      sCoordinatesDesc: 'The pin denotes exact shop-floor placement with status-coded colors and failure risk levels.',
      sGeofenceTitle: 'Geofencing & Boundary Drawing Tools',
      sGeofenceDesc: 'Enables drafting security perimeters, robotic work cells, and hazardous maintenance zones.',
      sFullscreenTitle: 'Fullscreen Inspection Mode',
      sFullscreenDesc: 'Expanding the viewport for detailed plant layout navigation, logistics access, and clearance checks.',
      sGlobalMapTitle: 'Enterprise Global Asset Fleet Map',
      sGlobalMapDesc: 'Consolidated overview of all machines and mobile assets distributed across multi-site facilities.',
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

async function runLocationTutorial(browser: Browser, lang: Lang): Promise<void> {
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

    // Interceptar listado de búsqueda para asegurar que siempre haya activos en la tabla
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
              latitude: 25.6866,
              longitude: -100.3161,
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

    // Interceptar detalle del activo con coordenadas y geoJson
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
            latitude: 25.6866,
            longitude: -100.3161,
            geoJson: JSON.stringify({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [-100.3165, 25.6864],
                        [-100.3157, 25.6864],
                        [-100.3157, 25.6868],
                        [-100.3165, 25.6868],
                        [-100.3165, 25.6864],
                      ],
                    ],
                  },
                },
              ],
            }),
            propertiesJson: '{}',
            installedAt: '2026-01-15T00:00:00Z',
          }),
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

    // 3. Cambiar a pestaña Ubicación (Map)
    await narrate(page, c.modTitle, c.sMapTabTitle, c.sMapTabDesc, 2500);
    const mapTab = page.locator('[role="tab"][value="map"], button[role="tab"]:has-text("Ubicación"), button[role="tab"]:has-text("Location")').first();
    await highlightElement(page, mapTab, 800);
    await moveAndClick(page, mapTab, 900);
    await waitForPageReady(page, 1000);

    // 4. Resaltar contenedor del mapa y pin de coordenadas
    await narrate(page, c.modTitle, c.sCoordinatesTitle, c.sCoordinatesDesc, 2600);
    const mapContainer = page.locator('.leaflet-container').first();
    if (await mapContainer.isVisible().catch(() => false)) {
      await highlightElement(page, mapContainer, 1200);
    }

    // 5. Herramientas de dibujo Geoman / Geocercas
    await narrate(page, c.modTitle, c.sGeofenceTitle, c.sGeofenceDesc, 2600);
    const geomanToolbar = page.locator('.leaflet-pm-toolbar').first();
    if (await geomanToolbar.isVisible().catch(() => false)) {
      await highlightElement(page, geomanToolbar, 1000);
    }

    // 6. Maximizar / Pantalla Completa
    await narrate(page, c.modTitle, c.sFullscreenTitle, c.sFullscreenDesc, 2500);
    const fullscreenBtn = page.locator('button:has(svg.lucide-maximize)').first();
    if (await fullscreenBtn.isVisible().catch(() => false)) {
      await highlightElement(page, fullscreenBtn, 600);
      await moveAndClick(page, fullscreenBtn, 1000);
      await page.waitForTimeout(1000);
      // Restaurar
      const minimizeBtn = page.locator('button:has(svg.lucide-minimize)').first();
      if (await minimizeBtn.isVisible().catch(() => false)) {
        await moveAndClick(page, minimizeBtn, 700);
      }
    }

    // 7. Volver al listado y mostrar el Mapa Global de Activos
    await narrate(page, c.modTitle, c.sGlobalMapTitle, c.sGlobalMapDesc, 2600);
    await page.goto(`${ATLAS_BASE_URL}/assets`, { waitUntil: 'load' });
    await waitForPageReady(page, 1000);

    const globalMapBtn = page.getByRole('button', { name: /Ver en mapa|View on map/i }).first();
    if (await globalMapBtn.isVisible().catch(() => false)) {
      await highlightElement(page, globalMapBtn, 800);
      await moveAndClick(page, globalMapBtn, 1200);

      const mapModal = page.getByRole('dialog').first();
      if (await mapModal.isVisible().catch(() => false)) {
        await highlightElement(page, mapModal, 1500);
        const closeBtn = mapModal.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await moveAndClick(page, closeBtn, 600);
        }
      }
    }

    await page.waitForTimeout(1000);
  } finally {
    await saveNamedVideo(
      session,
      `03-activos/04-ubicaciones-mapas/ubicaciones-mapas-${lang}`,
    );
  }
}

test.describe.serial('Tutorial 03D — Ubicación Geoespacial y Mapas de Activos (ES / EN)', () => {
  test('ubicaciones-mapas-es', async ({ browser }) => {
    await runLocationTutorial(browser, 'es');
  });

  test('ubicaciones-mapas-en', async ({ browser }) => {
    await runLocationTutorial(browser, 'en');
  });
});