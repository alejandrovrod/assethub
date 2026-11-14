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
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/08-configuracion-corporativa/02-roles-permisos');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-08b');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 08B: Roles y Permisos Granulares (RBAC)',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Gestión de Seguridad y Roles Granulares',
    sIntroDesc: 'Administra los perfiles de acceso mediante un esquema RBAC con permisos por módulo funcional.',
    sRolesTableTitle: 'Matriz de Roles del Sistema',
    sRolesTableDesc: 'Supervisa los roles predeterminados del sistema y los roles personalizados configurados en la organización.',
    sNewRoleBtnTitle: 'Creación de Nuevo Rol Personalizado',
    sNewRoleBtnDesc: 'Iniciando el configurador para diseñar un rol técnico con permisos restringidos de auditoría y campo.',
    sRoleInfoTitle: 'Nombre y Alcance del Rol',
    sRoleInfoDesc: 'Definiendo la denominación institucional y responsabilidades del perfil de seguridad.',
    sPermissionsMatrixTitle: 'Selección de Permisos por Módulo',
    sPermissionsMatrixDesc: 'Activando capacidades específicas para la lectura de activos y reporte de órdenes de trabajo.',
    sSaveRoleTitle: 'Guardar y Publicar Rol RBAC',
    sSaveRoleDesc: 'Persistiendo el nuevo perfil de seguridad, listo para ser asignado a técnicos y supervisores.',
    sSummaryTitle: 'Rol de Seguridad Habilitado',
    sSummaryDesc: 'El esquema de control de acceso queda reforzado con políticas y permisos precisos.',
  },
  en: {
    modTitle: 'Module 08B: Roles & Granular RBAC Permissions',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Security Management & Granular Roles',
    sIntroDesc: 'Enforce access control using an RBAC model with fine-grained permissions per functional module.',
    sRolesTableTitle: 'System & Custom Roles Matrix',
    sRolesTableDesc: 'Inspect pre-configured tenant default roles alongside organization-specific custom profiles.',
    sNewRoleBtnTitle: 'Create New Custom Role',
    sNewRoleBtnDesc: 'Opening the role creator to craft a custom technical profile with targeted access rights.',
    sRoleInfoTitle: 'Role Name & Scope Description',
    sRoleInfoDesc: 'Setting institutional title and responsibility boundaries for the security profile.',
    sPermissionsMatrixTitle: 'Modular Permission Selection',
    sPermissionsMatrixDesc: 'Granting specific scopes for asset inspection and maintenance work orders execution.',
    sSaveRoleTitle: 'Save & Deploy RBAC Role',
    sSaveRoleDesc: 'Persisting the security role, immediately available for assignment to field staff.',
    sSummaryTitle: 'Security Role Activated',
    sSummaryDesc: 'Role-based access control is now reinforced with audited granular privileges.',
  },
};

async function runRolesTutorial(browser: any, lang: 'es' | 'en') {
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

  const rolesList = [
    {
      id: 'role-admin',
      name: 'Tenant Admin',
      description: lang === 'es' ? 'Acceso completo a todos los módulos y configuraciones' : 'Full access to all modules and configurations',
      isSystemDefault: true,
      permissionCount: 95,
      userCount: 2,
    },
    {
      id: 'role-tech',
      name: 'Field Technician',
      description: lang === 'es' ? 'Ejecución y registro de tareas en campo' : 'Execution and recording of field tasks',
      isSystemDefault: true,
      permissionCount: 24,
      userCount: 6,
    },
    {
      id: 'role-supervisor',
      name: 'Maintenance Supervisor',
      description: lang === 'es' ? 'Aprobación de órdenes de trabajo y gestión de cuadrillas' : 'Approval of work orders and crew management',
      isSystemDefault: false,
      permissionCount: 48,
      userCount: 3,
    },
  ];

  const permissionCatalog = [
    {
      module: 'Assets',
      permissions: [
        { code: 'assets:read', description: lang === 'es' ? 'Consultar ficha técnica de activos' : 'View asset technical specifications' },
        { code: 'assets:update', description: lang === 'es' ? 'Modificar datos de activo' : 'Edit asset information' },
        { code: 'assets:change-state', description: lang === 'es' ? 'Transicionar estado en máquina de estados' : 'Transition asset lifecycle state' },
      ],
    },
    {
      module: 'Maintenance',
      permissions: [
        { code: 'maintenance:read', description: lang === 'es' ? 'Consultar órdenes de trabajo' : 'View work orders' },
        { code: 'maintenance:create', description: lang === 'es' ? 'Generar nuevas órdenes correctivas' : 'Create corrective work orders' },
        { code: 'tasks:complete', description: lang === 'es' ? 'Firmar y cerrar tareas de ejecución' : 'Sign off and close tasks' },
      ],
    },
    {
      module: 'Inventory',
      permissions: [
        { code: 'inventory:read', description: lang === 'es' ? 'Ver saldos y almacenes' : 'View stock and warehouses' },
        { code: 'stock:adjust', description: lang === 'es' ? 'Registrar entradas y ajustes' : 'Post receipts and adjustments' },
      ],
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
          permissions: ['roles:read', 'roles:manage'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock roles list
    await page.route(/\/api\/v1\/roles(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rolesList),
        });
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const created = {
          id: 'role-auditor',
          name: body.name || 'Auditor de Calidad y Confiabilidad',
          description: body.description || 'Auditoría técnica de activos y revisión de intervenciones',
          isSystemDefault: false,
          permissionCount: body.permissionCodes?.length || 5,
          userCount: 0,
        };
        rolesList.push(created);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }
      return route.fallback();
    });

    // Mock permission catalog
    await page.route(/\/api\/v1\/roles\/permissions-catalog(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(permissionCatalog),
      });
    });

    // PASO 1: Navegar a /settings/roles
    await page.goto(`${ATLAS_BASE_URL}/settings/roles`, { waitUntil: 'load' });
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

    // PASO 2: Introducción a Roles RBAC
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Matriz de Roles
    await narrate(page, c.modTitle, c.sRolesTableTitle, c.sRolesTableDesc, 2800);
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await highlightElement(page, firstRow, 1000);
    }

    // PASO 4: Botón Nuevo Rol
    await narrate(page, c.modTitle, c.sNewRoleBtnTitle, c.sNewRoleBtnDesc, 2600);
    const addRoleBtn = page.locator('button:has(svg.lucide-plus)').first();
    await highlightElement(page, addRoleBtn, 700);
    await moveAndClick(page, addRoleBtn, 900);

    // PASO 5: Dialog de Configuración de Rol
    const dialog = page.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sRoleInfoTitle, c.sRoleInfoDesc, 2800);

    // Nombre del Rol
    const nameInput = dialog.locator('#role-name');
    await highlightElement(page, nameInput, 600);
    const roleNameVal = lang === 'es' ? 'Auditor de Calidad y Confiabilidad' : 'Reliability & Quality Auditor';
    await moveAndType(page, nameInput, roleNameVal, 35);

    // Descripción del Rol
    const descInput = dialog.locator('#role-desc');
    await highlightElement(page, descInput, 600);
    const roleDescVal = lang === 'es' ? 'Auditoría técnica de activos e historial de mantenimiento' : 'Technical asset audits and maintenance log review';
    await moveAndType(page, descInput, roleDescVal, 30);

    // PASO 6: Matriz de Permisos por Módulo
    await narrate(page, c.modTitle, c.sPermissionsMatrixTitle, c.sPermissionsMatrixDesc, 3000);

    // Switch de Módulo Assets
    const moduleSwitch1 = dialog.locator('button[role="switch"]').first();
    if (await moduleSwitch1.isVisible().catch(() => false)) {
      await highlightElement(page, moduleSwitch1, 600);
      await moveAndClick(page, moduleSwitch1, 600);
    }

    // Switch de Módulo Maintenance
    const moduleSwitch2 = dialog.locator('button[role="switch"]').nth(4);
    if (await moduleSwitch2.isVisible().catch(() => false)) {
      await highlightElement(page, moduleSwitch2, 600);
      await moveAndClick(page, moduleSwitch2, 600);
    }

    // PASO 7: Guardar Rol
    await narrate(page, c.modTitle, c.sSaveRoleTitle, c.sSaveRoleDesc, 2600);
    const saveBtn = dialog.locator('button').filter({ hasText: /Guardar rol|Save role|Crear|Create/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await highlightElement(page, saveBtn, 700);
      await moveAndClick(page, saveBtn, 1200);
    }

    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await waitForPageReady(page, 1500);

    // Resaltar nuevo rol en tabla
    const lastRow = page.locator('table tbody tr').last();
    if (await lastRow.isVisible().catch(() => false)) {
      await highlightElement(page, lastRow, 1100);
    }

    // PASO 8: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `roles-permisos-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 08B — Roles y Permisos Granulares (ES / EN)', () => {
  test.setTimeout(300_000);

  test('roles-permisos-es', async ({ browser }) => {
    await runRolesTutorial(browser, 'es');
  });

  test('roles-permisos-en', async ({ browser }) => {
    await runRolesTutorial(browser, 'en');
  });
});

