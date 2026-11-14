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
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/07-plantillas-comunicacion/01-gestion-plantillas');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-07');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 07: Plantillas de Comunicación y Documentos',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Gestor de Plantillas de Notificación',
    sIntroDesc: 'Centraliza las comunicaciones por correo electrónico y reportes documentales generados para activos, incidencias y órdenes.',
    sFiltersTitle: 'Filtros por Ámbito y Formato',
    sFiltersDesc: 'Filtra plantillas asociadas a Incidencias, Órdenes de Trabajo o Activos, diferenciando correos de reportes imprimibles.',
    sNewTemplateTitle: 'Crear Nueva Plantilla',
    sNewTemplateDesc: 'Iniciando el configurador visual para definir código, ámbito de entidad y formato de salida.',
    sScopeDefinitionTitle: 'Código y Ámbito de Entidad',
    sScopeDefinitionDesc: 'Asignamos código único corporativo y vinculamos la plantilla al ciclo de vida de Órdenes de Trabajo.',
    sLocalesEditorTitle: 'Diseño Bilingüe y Variables Dinámicas',
    sLocalesEditorDesc: 'Permite redactar el asunto y cuerpo HTML con placeholders como {order.id}, {asset.name} y {recipient.name}.',
    sPreviewDialogTitle: 'Previsualización con Datos de Muestra',
    sPreviewDialogDesc: 'Inspeccionando el renderizado final del documento con variables dinámicas resueltas antes de publicarlo.',
    sSaveTemplateTitle: 'Publicación y Control de Versiones',
    sSaveTemplateDesc: 'Guardando la versión activa de la plantilla con historial completo de cambios y auditoría.',
    sSummaryTitle: 'Plantilla Habilitada',
    sSummaryDesc: 'El sistema enviará notificaciones y generará reportes automáticamente utilizando esta plantilla.',
  },
  en: {
    modTitle: 'Module 07: Communication Templates & Documents',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Notification & Communication Templates Manager',
    sIntroDesc: 'Centralize automated email notifications and PDF printable documents for assets, incidents, and work orders.',
    sFiltersTitle: 'Scope & Template Type Filters',
    sFiltersDesc: 'Filter templates linked to Incidents, Maintenance Orders, or Assets, separating emails from printable reports.',
    sNewTemplateTitle: 'Create New Template',
    sNewTemplateDesc: 'Opening the configuration sheet to define template code, entity scope, and document format.',
    sScopeDefinitionTitle: 'Code & Entity Scope Definition',
    sScopeDefinitionDesc: 'Assigning a corporate unique code and binding the template to Maintenance Orders lifecycle events.',
    sLocalesEditorTitle: 'Bilingual Content & Dynamic Placeholders',
    sLocalesEditorDesc: 'Craft localized subjects and HTML body with dynamic variables like {order.id}, {asset.name}, and {recipient.name}.',
    sPreviewDialogTitle: 'Render Preview with Sample Data',
    sPreviewDialogDesc: 'Inspecting final document layout with resolved mock data before rolling it out to production.',
    sSaveTemplateTitle: 'Publishing & Version History',
    sSaveTemplateDesc: 'Saving the active template version with audit logs and version rollback capabilities.',
    sSummaryTitle: 'Template Ready for Dispatch',
    sSummaryDesc: 'Asset Hub will automatically dispatch notifications and format work orders with this standardized layout.',
  },
};

async function runCommunicationTemplatesTutorial(browser: any, lang: 'es' | 'en') {
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

  const initialTemplates = [
    {
      id: 'tpl-001',
      code: 'INC-CRIT-ALERT',
      name: lang === 'es' ? 'Notificación de Parada Crítica de Activo' : 'Critical Asset Stoppage Alert',
      entityScope: 'incident',
      templateType: 'email',
      locales: ['es', 'en'],
      activeVersionNumber: 2,
      versionCount: 2,
      createdAt: '2026-02-01T10:00:00Z',
    },
    {
      id: 'tpl-002',
      code: 'WO-COMPLETION-REPORT',
      name: lang === 'es' ? 'Acta de Entrega de Orden de Trabajo' : 'Work Order Handover Protocol',
      entityScope: 'maintenanceOrder',
      templateType: 'document',
      locales: ['es', 'en'],
      activeVersionNumber: 1,
      versionCount: 1,
      createdAt: '2026-02-05T14:30:00Z',
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
          permissions: [
            'communication-templates:read',
            'communication-templates:manage',
            'communication-templates:preview',
          ],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock communication-templates API
    await page.route(/\/api\/v1\/communication-templates(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: initialTemplates,
            totalCount: initialTemplates.length,
          }),
        });
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const created = {
          id: 'tpl-003',
          code: body.code || 'WO-ASSIGNED-NOTIF',
          name: body.name || (lang === 'es' ? 'Aviso de Asignación de Tareas' : 'Task Assignment Notice'),
          entityScope: body.entityScope || 'maintenanceOrder',
          templateType: body.templateType || 'email',
          locales: ['es'],
          activeVersionNumber: 1,
          versionCount: 1,
          createdAt: new Date().toISOString(),
        };
        initialTemplates.push(created);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }
      return route.fallback();
    });

    // Mock preview endpoint
    await page.route(/\/api\/v1\/communication-templates\/[a-z0-9-]+\/preview(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          renderedSubject: lang === 'es' ? '[URGENTE] Parada Crítica en Línea Extrusión 02' : '[CRITICAL] Stoppage on Extrusion Line 02',
          renderedHtml: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #dc2626; margin-top: 0;">ALERTA DE SEGURIDAD OPERATIVA</h2>
            <p>Se ha registrado una incidencia de severidad <strong>ALTA</strong> en el activo <strong>Prensa Hidráulica 500T</strong>.</p>
            <p><strong>Orden de Trabajo:</strong> OT-2026-089<br/><strong>Responsable asignado:</strong> Ing. Roberto Méndez</p>
          </div>`,
        }),
      });
    });

    // PASO 1: Navegar a /maintenance/communication-templates
    await page.goto(`${ATLAS_BASE_URL}/maintenance/communication-templates`, { waitUntil: 'load' });
    await waitForPageReady(page, 1500);

    // Idioma
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

    // PASO 2: Introducción al Gestor de Plantillas
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Filtros por Ámbito y Formato
    await narrate(page, c.modTitle, c.sFiltersTitle, c.sFiltersDesc, 2800);
    const scopeSelect = page.locator('button[role="combobox"]').first();
    if (await scopeSelect.isVisible().catch(() => false)) {
      await highlightElement(page, scopeSelect, 800);
    }
    const typeSelect = page.locator('button[role="combobox"]').nth(1);
    if (await typeSelect.isVisible().catch(() => false)) {
      await highlightElement(page, typeSelect, 800);
    }

    // PASO 4: Botón Nueva Plantilla
    await narrate(page, c.modTitle, c.sNewTemplateTitle, c.sNewTemplateDesc, 2600);
    const addBtn = page.locator('button:has(svg.lucide-plus)').first();
    await highlightElement(page, addBtn, 700);
    await moveAndClick(page, addBtn, 900);

    // PASO 5: Completar Datos de Plantilla en Sheet
    const sheet = page.locator('[role="dialog"]').first();
    await sheet.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sScopeDefinitionTitle, c.sScopeDefinitionDesc, 2800);

    // Código
    const codeInput = sheet.locator('input').first();
    if (await codeInput.isVisible().catch(() => false)) {
      await highlightElement(page, codeInput, 600);
      await moveAndType(page, codeInput, 'WO-ASSIGNED-NOTIF', 35);
    }

    // Nombre
    const nameInput = sheet.locator('input').nth(1);
    if (await nameInput.isVisible().catch(() => false)) {
      await highlightElement(page, nameInput, 600);
      const tplName = lang === 'es' ? 'Aviso de Asignación de Tareas' : 'Task Assignment Notice';
      await moveAndType(page, nameInput, tplName, 35);
    }

    // PASO 6: Editor de Contenido y Variables
    await narrate(page, c.modTitle, c.sLocalesEditorTitle, c.sLocalesEditorDesc, 3000);

    // Asunto del correo
    const subjectInput = sheet.locator('input[placeholder*="Asunto"], input[placeholder*="Subject"]').first();
    if (await subjectInput.isVisible().catch(() => false)) {
      await highlightElement(page, subjectInput, 600);
      const subjectVal = lang === 'es' ? 'Nueva Tarea Asignada: {order.title}' : 'New Work Task Assigned: {order.title}';
      await moveAndType(page, subjectInput, subjectVal, 30);
    }

    // Cerrar Sheet para mostrar previsualización de plantilla existente
    const cancelBtn = sheet.locator('button').filter({ hasText: /Cancelar|Cancel/i }).first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await moveAndClick(page, cancelBtn, 600);
    } else {
      await page.keyboard.press('Escape');
    }
    await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await waitForPageReady(page, 1000);

    // PASO 7: Previsualización de Plantilla (Botón Eye)
    await narrate(page, c.modTitle, c.sPreviewDialogTitle, c.sPreviewDialogDesc, 2800);
    const previewBtn = page.locator('button:has(svg.lucide-eye)').first();
    if (await previewBtn.isVisible().catch(() => false)) {
      await highlightElement(page, previewBtn, 700);
      await moveAndClick(page, previewBtn, 900);

      const previewDialog = page.locator('[role="dialog"]').first();
      await previewDialog.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(1500);

      const closePreview = previewDialog.locator('button').filter({ hasText: /Cerrar|Close/i }).first();
      if (await closePreview.isVisible().catch(() => false)) {
        await moveAndClick(page, closePreview, 700);
      } else {
        await page.keyboard.press('Escape');
      }
      await previewDialog.waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
    }

    // PASO 8: Publicación y Control de Versiones
    await narrate(page, c.modTitle, c.sSaveTemplateTitle, c.sSaveTemplateDesc, 2800);
    const historyBtn = page.locator('button:has(svg.lucide-history)').first();
    if (await historyBtn.isVisible().catch(() => false)) {
      await highlightElement(page, historyBtn, 700);
      await moveAndClick(page, historyBtn, 800);
      await page.waitForTimeout(1200);
      await page.keyboard.press('Escape');
    }

    // PASO 9: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `plantillas-comunicacion-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 07 — Plantillas de Comunicación y Documentos (ES / EN)', () => {
  test.setTimeout(300_000);

  test('plantillas-comunicacion-es', async ({ browser }) => {
    await runCommunicationTemplatesTutorial(browser, 'es');
  });

  test('plantillas-comunicacion-en', async ({ browser }) => {
    await runCommunicationTemplatesTutorial(browser, 'en');
  });
});
