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
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/08-configuracion-corporativa/03-gestion-usuarios');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-08c');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 08C: Gestión de Usuarios e Invitaciones',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Directorio de Cuentas de Acceso',
    sIntroDesc: 'Administra los usuarios autorizados, credenciales, estados de cuenta e invitaciones pendientes en Atlas Industrial.',
    sUsersTableTitle: 'Listado de Usuarios y Roles Asignados',
    sUsersTableDesc: 'Supervisa el estado activo/inactivo, último acceso registrado y perfiles RBAC vinculados a cada cuenta.',
    sInviteBtnTitle: 'Invitar Nuevo Colaborador',
    sInviteBtnDesc: 'Iniciando el modal de invitación corporativa segura por correo electrónico.',
    sInviteFormTitle: 'Buzón Corporativo y Rol de Seguridad',
    sInviteFormDesc: 'Especificando el correo del destinatario y el rol operativo que desempeñará en la plataforma.',
    sSendInviteTitle: 'Enviar Invitación y Generar Token',
    sSendInviteDesc: 'Generando el enlace de incorporación temporal y remitiendo la notificación de bienvenida.',
    sInvitationsTabTitle: 'Pestaña de Invitaciones Pendientes',
    sInvitationsTabDesc: 'Permite auditar solicitudes enviadas, copiar el link directo de onboarding o reenviar el acceso.',
    sSummaryTitle: 'Gestión de Acceso Lista',
    sSummaryDesc: 'El flujo de incorporación e invitación de nuevos colaboradores queda auditado y operativo.',
  },
  en: {
    modTitle: 'Module 08C: User Accounts & Invitation Management',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'User Accounts Directory',
    sIntroDesc: 'Manage authorized users, security roles, account active states, and onboarding invitations.',
    sUsersTableTitle: 'Active Users & Assigned Roles',
    sUsersTableDesc: 'Monitor active/inactive status, last session timestamps, and linked RBAC roles per user account.',
    sInviteBtnTitle: 'Invite New Teammate',
    sInviteBtnDesc: 'Opening the enterprise secure email invitation dialog.',
    sInviteFormTitle: 'Corporate Email & Role Assignment',
    sInviteFormDesc: 'Specifying the recipient email address and pre-assigning operational security permissions.',
    sSendInviteTitle: 'Dispatch Invite & Generate Token',
    sSendInviteDesc: 'Creating temporary onboarding link and dispatching corporate invitation email.',
    sInvitationsTabTitle: 'Pending Invitations Tab',
    sInvitationsTabDesc: 'Audit outgoing onboarding requests, copy direct registration links, or resend notifications.',
    sSummaryTitle: 'User Access Control Ready',
    sSummaryDesc: 'Collaborator onboarding and identity provisioning workflows are fully verified.',
  },
};

async function runUsersTutorial(browser: any, lang: 'es' | 'en') {
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

  const usersList = [
    {
      id: 'usr-001',
      fullName: 'Ing. Roberto Méndez',
      email: 'rmendez@atlas-industrial.com',
      isActive: true,
      roles: [{ id: 'role-admin', name: 'Tenant Admin' }],
      createdAt: '2026-01-10T08:00:00Z',
      lastLoginAt: '2026-02-12T14:30:00Z',
    },
    {
      id: 'usr-002',
      fullName: 'Marcela Ríos',
      email: 'mrios@atlas-industrial.com',
      isActive: true,
      roles: [{ id: 'role-supervisor', name: 'Maintenance Supervisor' }],
      createdAt: '2026-01-15T09:30:00Z',
      lastLoginAt: '2026-02-12T11:15:00Z',
    },
    {
      id: 'usr-003',
      fullName: 'Carlos Gómez',
      email: 'cgomez@atlas-industrial.com',
      isActive: true,
      roles: [{ id: 'role-tech', name: 'Field Technician' }],
      createdAt: '2026-01-20T10:15:00Z',
      lastLoginAt: '2026-02-11T16:45:00Z',
    },
  ];

  const pendingInvitations = [
    {
      id: 'inv-001',
      email: 'jgarcia@atlas-industrial.com',
      role: { id: 'role-tech', name: 'Field Technician' },
      createdAt: '2026-02-10T12:00:00Z',
      expiresAt: '2026-02-17T12:00:00Z',
      token: 'inv-tok-998877',
      acceptedAt: null,
      cancelledAt: null,
    },
  ];

  const rolesList = [
    { id: 'role-admin', name: 'Tenant Admin' },
    { id: 'role-supervisor', name: 'Maintenance Supervisor' },
    { id: 'role-tech', name: 'Field Technician' },
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
          permissions: ['users:read', 'users:manage', 'user:invite', 'roles:read'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock users list
    await page.route(/\/api\/v1\/users(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: usersList,
          totalCount: usersList.length,
          page: 1,
          pageSize: 20,
        }),
      });
    });

    // Mock invitations list & creation
    await page.route(/\/api\/v1\/users\/invitations(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(pendingInvitations),
        });
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const createdInv = {
          id: 'inv-002',
          email: body.email || 'lparedes@atlas-industrial.com',
          role: { id: body.roleId || 'role-tech', name: 'Field Technician' },
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          token: 'inv-tok-123456',
          acceptedAt: null,
          cancelledAt: null,
        };
        pendingInvitations.push(createdInv);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdInv),
        });
      }
      return route.fallback();
    });

    // Mock roles list
    await page.route(/\/api\/v1\/roles(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rolesList),
      });
    });

    // PASO 1: Navegar a /settings/users
    await page.goto(`${ATLAS_BASE_URL}/settings/users`, { waitUntil: 'load' });
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
        console.warn('Lang switch skip:', e);
      }
    }

    // PASO 2: Introducción a Gestión de Usuarios
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Listado de Usuarios Activos
    await narrate(page, c.modTitle, c.sUsersTableTitle, c.sUsersTableDesc, 2800);
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await highlightElement(page, firstRow, 1000);
    }

    // PASO 4: Botón Invitar Usuario
    await narrate(page, c.modTitle, c.sInviteBtnTitle, c.sInviteBtnDesc, 2600);
    const inviteBtn = page.locator('button:has(svg.lucide-mail-plus), button:has-text("Invitar"), button:has-text("Invite")').first();
    await highlightElement(page, inviteBtn, 700);
    await moveAndClick(page, inviteBtn, 900);

    // PASO 5: Completar Formulario de Invitación en Dialog
    const inviteDialog = page.locator('[role="dialog"]').first();
    await inviteDialog.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sInviteFormTitle, c.sInviteFormDesc, 2800);

    // Email a invitar
    const emailInput = inviteDialog.locator('input[type="email"]').first();
    await highlightElement(page, emailInput, 600);
    await moveAndType(page, emailInput, 'lparedes@atlas-industrial.com', 35);

    // Seleccionar Rol
    const roleSelect = inviteDialog.locator('button[role="combobox"]').first();
    if (await roleSelect.isVisible().catch(() => false)) {
      await highlightElement(page, roleSelect, 600);
      await moveAndClick(page, roleSelect, 600);
      const roleOption = page.getByRole('option').last();
      if (await roleOption.isVisible().catch(() => false)) {
        await moveAndClick(page, roleOption, 600);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // PASO 6: Enviar Invitación
    await narrate(page, c.modTitle, c.sSendInviteTitle, c.sSendInviteDesc, 2600);
    const sendBtn = inviteDialog.locator('button').filter({ hasText: /Enviar invitación|Send invite/i }).first();
    if (await sendBtn.isVisible().catch(() => false)) {
      await highlightElement(page, sendBtn, 700);
      await moveAndClick(page, sendBtn, 1000);
    }

    await inviteDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await waitForPageReady(page, 1500);

    // PASO 7: Pestaña de Invitaciones Pendientes
    await narrate(page, c.modTitle, c.sInvitationsTabTitle, c.sInvitationsTabDesc, 2800);
    const invitationsTab = page.locator('button[role="tab"]').nth(1);
    if (await invitationsTab.isVisible().catch(() => false)) {
      await highlightElement(page, invitationsTab, 700);
      await moveAndClick(page, invitationsTab, 900);
      await page.waitForTimeout(1000);

      const invRow = page.locator('table tbody tr').first();
      if (await invRow.isVisible().catch(() => false)) {
        await highlightElement(page, invRow, 1000);
      }
    }

    // PASO 8: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `gestion-usuarios-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 08C — Gestión de Usuarios e Invitaciones (ES / EN)', () => {
  test.setTimeout(300_000);

  test('gestion-usuarios-es', async ({ browser }) => {
    await runUsersTutorial(browser, 'es');
  });

  test('gestion-usuarios-en', async ({ browser }) => {
    await runUsersTutorial(browser, 'en');
  });
});

