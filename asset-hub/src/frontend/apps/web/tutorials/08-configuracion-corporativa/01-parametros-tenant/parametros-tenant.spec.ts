import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  initTutorialOverlay,
  narrate,
  moveAndClick,
  moveAndType,
  highlightElement,
  waitForPageReady,
} from '../../helpers/tutorial-recorder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ATLAS_BASE_URL = 'http://atlas-industrial.localhost:5173';
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/08-configuracion-corporativa/01-parametros-tenant');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-08a');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 08A: Parámetros del Tenant y Notificaciones',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Configuración Corporativa del Tenant',
    sIntroDesc: 'Personaliza la identidad visual de la empresa, canales de soporte y enrutamiento de notificaciones automáticas.',
    sBrandingTitle: 'Identidad y Correo de Soporte Técnico',
    sBrandingDesc: 'Configura el logotipo corporativo y el buzón oficial para la atención de incidencias en planta.',
    sUpdateSupportTitle: 'Actualización de Contacto Operativo',
    sUpdateSupportDesc: 'Estableciendo el correo de mesa de ayuda técnica institucional de Atlas Industrial.',
    sSaveBrandTitle: 'Guardar Identidad Corporativa',
    sSaveBrandDesc: 'Persistiendo los cambios visuales y de contacto para todos los usuarios del tenant.',
    sNotificationsTabTitle: 'Pestaña de Notificaciones del Sistema',
    sNotificationsTabDesc: 'Mapea eventos operativos del ciclo de vida con plantillas de correo personalizadas.',
    sIncidentMappingTitle: 'Enlace de Evento de Incidencias',
    sIncidentMappingDesc: 'Asigna la plantilla corporativa activa para alertas inmediatas al reportarse una parada no programada.',
    sSummaryTitle: 'Configuración Completa',
    sSummaryDesc: 'Los parámetros de marca y automatización de alertas quedan listos y operando.',
  },
  en: {
    modTitle: 'Module 08A: Tenant Branding & Notification Rules',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Corporate Tenant Configuration',
    sIntroDesc: 'Customize enterprise visual identity, technical support channels, and automated notification triggers.',
    sBrandingTitle: 'Branding & Technical Support Channel',
    sBrandingDesc: 'Manage company logo and official support inbox for plant incident escalations.',
    sUpdateSupportTitle: 'Updating Operational Contact',
    sUpdateSupportDesc: 'Setting the institutional technical helpdesk email for Atlas Industrial.',
    sSaveBrandTitle: 'Saving Corporate Identity',
    sSaveBrandDesc: 'Applying branding and contact updates across all workspace users.',
    sNotificationsTabTitle: 'System Notifications Tab',
    sNotificationsTabDesc: 'Map core lifecycle events to custom localized email communication templates.',
    sIncidentMappingTitle: 'Incident Event Template Binding',
    sIncidentMappingDesc: 'Bind critical stoppage alerts to the standardized corporate incident notification template.',
    sSummaryTitle: 'Configuration Applied',
    sSummaryDesc: 'Tenant visual identity and automated event notifications are fully operational.',
  },
};

async function runTenantSettingsTutorial(browser: any, lang: 'es' | 'en') {
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

  let tenantSettings = {
    supportEmail: 'soporte.mantenimiento@atlas-industrial.com',
    logoUrl: '/logos/atlas-logo.png',
  };

  const notificationMappings = [
    {
      id: 'map-001',
      systemEvent: 'Incident.Created',
      templateId: 'none',
      isActive: true,
    },
    {
      id: 'map-002',
      systemEvent: 'Incident.StatusChanged',
      templateId: 'none',
      isActive: true,
    },
  ];

  const availableTemplates = [
    {
      id: 'tpl-001',
      code: 'INC-CRIT-ALERT',
      name: lang === 'es' ? 'Alerta Inmediata de Parada Crítica' : 'Critical Asset Stoppage Immediate Alert',
      entityScope: 'incident',
      templateType: 'email',
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
          permissions: ['tenant:read', 'tenant:write', 'communication-templates:read'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock tenant settings
    await page.route(/\/api\/v1\/tenant\/settings(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(tenantSettings),
        });
      }
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        tenantSettings = { ...tenantSettings, ...body };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(tenantSettings),
        });
      }
      return route.fallback();
    });

    // Mock notification mappings
    await page.route(/\/api\/v1\/tenant\/notifications\/mappings(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(notificationMappings),
        });
      }
      if (route.request().method() === 'PUT' || route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const existing = notificationMappings.find(m => m.systemEvent === body.systemEvent);
        if (existing) {
          existing.templateId = body.templateId;
        } else {
          notificationMappings.push({
            id: 'map-new',
            systemEvent: body.systemEvent,
            templateId: body.templateId,
            isActive: true,
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'map-updated', success: true }),
        });
      }
      return route.fallback();
    });

    // Mock communication templates list
    await page.route(/\/api\/v1\/communication-templates(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: availableTemplates,
          totalCount: availableTemplates.length,
        }),
      });
    });

    // PASO 1: Navegar a /settings/tenant
    await page.goto(`${ATLAS_BASE_URL}/settings/tenant`, { waitUntil: 'load' });
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
        console.warn('Language switch skip:', e);
      }
    }

    // PASO 2: Introducción a Configuración Corporativa
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Identidad y Correo de Soporte
    await narrate(page, c.modTitle, c.sBrandingTitle, c.sBrandingDesc, 2800);
    const logoArea = page.locator('#logo');
    if (await logoArea.isVisible().catch(() => false)) {
      await highlightElement(page, logoArea, 800);
    }

    // PASO 4: Actualizar Correo de Soporte
    await narrate(page, c.modTitle, c.sUpdateSupportTitle, c.sUpdateSupportDesc, 2600);
    const emailInput = page.locator('#supportEmail');
    await highlightElement(page, emailInput, 600);
    await emailInput.fill('');
    await moveAndType(page, emailInput, 'ayuda.planta@atlas-industrial.com', 35);

    // PASO 5: Guardar Identidad Corporativa
    await narrate(page, c.modTitle, c.sSaveBrandTitle, c.sSaveBrandDesc, 2600);
    const saveBtn = page.locator('button').filter({ hasText: /Guardar cambios|Save changes/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await highlightElement(page, saveBtn, 700);
      await moveAndClick(page, saveBtn, 1000);
    }
    await waitForPageReady(page, 1000);

    // PASO 6: Pestaña de Notificaciones del Sistema
    await narrate(page, c.modTitle, c.sNotificationsTabTitle, c.sNotificationsTabDesc, 2800);
    const notifTabTrigger = page.locator('button[role="tab"]').nth(1);
    await highlightElement(page, notifTabTrigger, 700);
    await moveAndClick(page, notifTabTrigger, 900);
    await waitForPageReady(page, 1000);

    // PASO 7: Enlace de Evento de Incidencias
    await narrate(page, c.modTitle, c.sIncidentMappingTitle, c.sIncidentMappingDesc, 3000);
    const incidentSelect = page.locator('button[role="combobox"]').first();
    if (await incidentSelect.isVisible().catch(() => false)) {
      await highlightElement(page, incidentSelect, 700);
      await moveAndClick(page, incidentSelect, 700);
      const tplOption = page.getByRole('option').last();
      if (await tplOption.isVisible().catch(() => false)) {
        await moveAndClick(page, tplOption, 800);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // PASO 8: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `parametros-tenant-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 08A — Parámetros del Tenant y Notificaciones (ES / EN)', () => {
  test.setTimeout(300_000);

  test('parametros-tenant-es', async ({ browser }) => {
    await runTenantSettingsTutorial(browser, 'es');
  });

  test('parametros-tenant-en', async ({ browser }) => {
    await runTenantSettingsTutorial(browser, 'en');
  });
});

