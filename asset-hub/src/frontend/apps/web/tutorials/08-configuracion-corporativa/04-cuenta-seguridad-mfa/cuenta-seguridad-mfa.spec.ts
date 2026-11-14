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
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/08-configuracion-corporativa/04-cuenta-seguridad-mfa');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-08d');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 08D: Cuenta de Usuario, Seguridad y MFA',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Gestión de Cuenta y Perfil del Colaborador',
    sIntroDesc: 'Permite al personal técnico y directivo actualizar su perfil institucional y proteger su acceso con seguridad avanzada.',
    sProfileInfoTitle: 'Información Personal y Preferencias',
    sProfileInfoDesc: 'Revisión del nombre corporativo, correo electrónico institucional e idioma de interfaz preferido.',
    sSaveProfileTitle: 'Actualización de Perfil',
    sSaveProfileDesc: 'Confirmando los cambios en los datos de contacto y preferencias regionales del usuario.',
    sSecurityTabTitle: 'Pestaña de Seguridad y Contraseña',
    sSecurityTabDesc: 'Módulo para la renovación periódica de credenciales respetando políticas de complejidad.',
    sMfaTabTitle: 'Autenticación Multifactor (MFA / 2FA)',
    sMfaTabDesc: 'Protección reforzada para roles críticos que previene accesos no autorizados mediante código TOTP de un solo uso.',
    sSummaryTitle: 'Perfil y Seguridad Listos',
    sSummaryDesc: 'La cuenta de usuario cuenta con máxima protección y directivas de seguridad corporativa activas.',
  },
  en: {
    modTitle: 'Module 08D: User Account, Security & MFA',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Account & User Profile Management',
    sIntroDesc: 'Allows technical and executive staff to maintain their profile and enforce high-standard security safeguards.',
    sProfileInfoTitle: 'Personal Information & Preferences',
    sProfileInfoDesc: 'Reviewing corporate name, institutional email address, and interface language settings.',
    sSaveProfileTitle: 'Updating Profile Information',
    sSaveProfileDesc: 'Saving changes to contact details and regional preferences.',
    sSecurityTabTitle: 'Security & Password Management Tab',
    sSecurityTabDesc: 'Dedicated module for periodic credential updates adhering to password complexity policies.',
    sMfaTabTitle: 'Multi-Factor Authentication (MFA / 2FA)',
    sMfaTabDesc: 'Enhanced protection for privileged accounts preventing unauthorized logins using time-based TOTP tokens.',
    sSummaryTitle: 'Account Security Configured',
    sSummaryDesc: 'User profile and enterprise security protections are fully operational.',
  },
};

async function runAccountSecurityTutorial(browser: any, lang: 'es' | 'en') {
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

  let profile = {
    id: 'usr-001',
    fullName: 'Ing. Roberto Méndez',
    email: 'rmendez@atlas-industrial.com',
    preferredLocale: lang,
    avatarUrl: null,
    isMfaEnabled: true,
  };

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
          permissions: ['tenant:read', 'users:read'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
          userProfile: profile,
        }),
      });
    });

    // Mock update profile
    await page.route('**/api/v1/auth/profile*', async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        profile = { ...profile, ...body };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(profile),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
    });

    // PASO 1: Navegar a /settings/account
    await page.goto(`${ATLAS_BASE_URL}/settings/account`, { waitUntil: 'load' });
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

    // PASO 2: Introducción a Cuenta de Usuario
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Información Personal
    await narrate(page, c.modTitle, c.sProfileInfoTitle, c.sProfileInfoDesc, 2800);
    const nameInput = page.locator('input').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await highlightElement(page, nameInput, 700);
    }
    const emailInput = page.locator('input').nth(1);
    if (await emailInput.isVisible().catch(() => false)) {
      await highlightElement(page, emailInput, 700);
    }

    // PASO 4: Guardar Cambios en Perfil
    await narrate(page, c.modTitle, c.sSaveProfileTitle, c.sSaveProfileDesc, 2600);
    const saveProfileBtn = page.locator('button').filter({ hasText: /Guardar cambios|Save changes/i }).first();
    if (await saveProfileBtn.isVisible().catch(() => false)) {
      await highlightElement(page, saveProfileBtn, 700);
      await moveAndClick(page, saveProfileBtn, 1000);
    }
    await waitForPageReady(page, 1200);

    // PASO 5: Pestaña de Seguridad y Contraseña
    await narrate(page, c.modTitle, c.sSecurityTabTitle, c.sSecurityTabDesc, 2800);
    const tabs = page.locator('button[role="tab"]');
    const securityTab = tabs.nth(1);
    if (await securityTab.isVisible().catch(() => false)) {
      await highlightElement(page, securityTab, 700);
      await moveAndClick(page, securityTab, 900);
      await waitForPageReady(page, 1200);

      const pwdCard = page.locator('.space-y-4, .grid').first();
      if (await pwdCard.isVisible().catch(() => false)) {
        await highlightElement(page, pwdCard, 1000);
      }
    }

    // PASO 6: Pestaña MFA / 2FA
    await narrate(page, c.modTitle, c.sMfaTabTitle, c.sMfaTabDesc, 3000);
    const mfaTab = tabs.nth(2);
    if (await mfaTab.isVisible().catch(() => false)) {
      await highlightElement(page, mfaTab, 700);
      await moveAndClick(page, mfaTab, 900);
      await waitForPageReady(page, 1200);

      const mfaCard = page.locator('.rounded-lg.border').first();
      if (await mfaCard.isVisible().catch(() => false)) {
        await highlightElement(page, mfaCard, 1000);
      }
    }

    // PASO 7: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `cuenta-seguridad-mfa-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 08D — Cuenta de Usuario, Seguridad y MFA (ES / EN)', () => {
  test.setTimeout(300_000);

  test('cuenta-seguridad-mfa-es', async ({ browser }) => {
    await runAccountSecurityTutorial(browser, 'es');
  });

  test('cuenta-seguridad-mfa-en', async ({ browser }) => {
    await runAccountSecurityTutorial(browser, 'en');
  });
});

