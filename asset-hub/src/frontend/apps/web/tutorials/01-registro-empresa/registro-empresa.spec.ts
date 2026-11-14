import { expect, test, type Browser } from '@playwright/test';
import {
  highlightElement,
  moveAndClick,
  moveAndType,
  narrate,
  openTutorialSession,
  saveNamedVideo,
  selectLanguageInUI,
  waitForPageReady,
} from '../helpers/tutorial-recorder';

const ROOT_URL = 'http://localhost:5173';

type Lang = 'es' | 'en';

interface CompanyLocaleData {
  orgName: string;
  takenSlug: string;
  availableSlug: string;
  adminName: string;
  email: string;
  password: string;
  supportEmail: string;
  copy: {
    modSignup: string;
    modCreated: string;
    modConfig: string;
    modReady: string;
    s1Title: string;
    s1Desc: string;
    sLangTitle: string;
    sLangDesc: string;
    s2Title: string;
    s2Desc: string;
    s3Title: string;
    s3Desc: string;
    s4Title: string;
    s4Desc: string;
    sTakenTitle: string;
    sTakenDesc: string;
    s5Title: string;
    s5Desc: string;
    s6Title: string;
    s6Desc: string;
    s7Title: string;
    s7Desc: string;
    s8Title: string;
    s8Desc: string;
    s9Title: string;
    s9Desc: string;
    sDoneTitle: string;
    sDoneDesc: string;
  };
}

const DATA_BY_LANG: Record<Lang, CompanyLocaleData> = {
  es: {
    orgName: 'Industrias Metalúrgicas Atlas S.A.',
    takenSlug: 'demo',
    availableSlug: 'atlas-industrial',
    adminName: 'Ing. Roberto Méndez',
    email: 'rmendez@atlas-industrial.com',
    password: 'AtlasIndustrial2026!',
    supportEmail: 'soporte@atlas-industrial.com',
    copy: {
      modSignup: 'Alta de Empresa',
      modCreated: 'Nuevo Espacio Creado',
      modConfig: 'Configuración Inicial',
      modReady: 'Empresa Lista',
      s1Title: '1. Portal Principal de Asset Hub',
      s1Desc: 'Una nueva empresa ingresa al portal web de Asset Hub para dar de alta su propio espacio aislado.',
      sLangTitle: 'Selección de Idioma',
      sLangDesc: 'La plataforma es multi-idioma: podés cambiar entre Español e Inglés en cualquier momento.',
      s2Title: '2. Ir al Registro de Organización',
      s2Desc: 'En la pantalla de acceso, el administrador selecciona la opción para registrar una nueva empresa.',
      s3Title: '3. Datos de la Organización',
      s3Desc: 'Registramos a "Industrias Metalúrgicas Atlas S.A." completando la razón social y su subdominio único.',
      s4Title: '4. Validación de Subdominio Único',
      s4Desc: 'Probamos primero con un subdominio ya ocupado ("demo") para mostrar la protección de exclusividad.',
      sTakenTitle: 'Subdominio No Disponible',
      sTakenDesc: 'El sistema alerta de inmediato que ese subdominio ya pertenece a otra organización.',
      s5Title: '5. Subdominio Corporativo Confirmado',
      s5Desc: 'El subdominio "atlas-industrial.assethub.app" está libre y será la URL privada de la empresa.',
      s6Title: '6. Cuenta del Administrador Principal',
      s6Desc: 'Cargamos los datos de "Ing. Roberto Méndez", quien recibirá permisos totales del tenant.',
      s7Title: '7. Creación del Tenant e Ingreso Automático',
      s7Desc: 'Al confirmar, se aprovisiona el espacio aislado, se autentica al administrador y redirige al subdominio.',
      s8Title: '8. Bienvenida al Panel de Control',
      s8Desc: 'Ya estamos dentro de "atlas-industrial.localhost", listo para configurar plantillas, activos y equipo.',
      s9Title: '9. Datos de Contacto de la Organización',
      s9Desc: 'Completamos el correo de soporte técnico de la empresa para notificaciones y marca corporativa.',
      sDoneTitle: '¡Cuenta Empresarial Configurada!',
      sDoneDesc: 'Industrias Metalúrgicas Atlas S.A. ya tiene su entorno activo y listo para operar.',
    },
  },
  en: {
    orgName: 'Atlas Precision Manufacturing Inc.',
    takenSlug: 'demo',
    availableSlug: 'atlas-industrial',
    adminName: 'Eng. Roberto Mendez',
    email: 'rmendez@atlas-industrial.com',
    password: 'AtlasIndustrial2026!',
    supportEmail: 'support@atlas-industrial.com',
    copy: {
      modSignup: 'Company Onboarding',
      modCreated: 'New Workspace Ready',
      modConfig: 'Initial Setup',
      modReady: 'Workspace Active',
      s1Title: '1. Asset Hub Landing Portal',
      s1Desc: 'A new organization visits Asset Hub to provision its own isolated multi-tenant workspace.',
      sLangTitle: 'Multi-Language Support',
      sLangDesc: 'Switch between Español and English right from the top bar at any point.',
      s2Title: '2. Navigate to Organization Signup',
      s2Desc: 'From the sign-in screen, the administrator selects the option to register a new company.',
      s3Title: '3. Organization Details',
      s3Desc: 'We register "Atlas Precision Manufacturing Inc." by entering its legal name and unique subdomain.',
      s4Title: '4. Subdomain Availability Check',
      s4Desc: 'We first test an already taken subdomain ("demo") to see how the platform enforces tenant uniqueness.',
      sTakenTitle: 'Subdomain Unavailable',
      sTakenDesc: 'The system immediately alerts that this subdomain already belongs to another company.',
      s5Title: '5. Corporate Subdomain Confirmed',
      s5Desc: 'The "atlas-industrial.assethub.app" subdomain is available and becomes the company private URL.',
      s6Title: '6. Initial Administrator Account',
      s6Desc: 'We enter the details for "Eng. Roberto Mendez", who will receive full Tenant Admin permissions.',
      s7Title: '7. Provisioning & Automatic Sign-In',
      s7Desc: 'Submitting provisions the isolated tenant, authenticates the admin, and redirects to the workspace.',
      s8Title: '8. Welcome to the Dashboard',
      s8Desc: 'We are now inside "atlas-industrial.localhost", ready to configure templates, assets, and staff.',
      s9Title: '9. Organization Contact Settings',
      s9Desc: 'Finally, we set the corporate technical support email for branding and system notifications.',
      sDoneTitle: 'Company Account Ready!',
      sDoneDesc: 'Atlas Precision Manufacturing Inc. is fully provisioned and ready for operations.',
    },
  },
};

async function runCompanySignupTutorial(browser: Browser, lang: Lang): Promise<void> {
  const data = DATA_BY_LANG[lang];
  const c = data.copy;

  const session = await openTutorialSession(browser, {
    authenticated: false,
    baseURL: ROOT_URL,
    lang,
  });
  const { page } = session;

  try {
    await page.route('**/api/v1/tenants/check-slug*', async (route) => {
      const url = new URL(route.request().url());
      const slug = url.searchParams.get('slug');
      if (slug === data.takenSlug) {
        await new Promise((r) => setTimeout(r, 550));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available: false }),
        });
        return;
      }
      if (slug === data.availableSlug) {
        await new Promise((r) => setTimeout(r, 650));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available: true }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/v1/auth/signup-tenant', async (route) => {
      const response = await route.fetch();
      if (response.ok()) {
        await route.fulfill({ response });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenantId: data.availableSlug,
          status: 'active',
        }),
      });
    });

    // 1. Landing Page
    await page.goto(`${ROOT_URL}/`, { waitUntil: 'load' });
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 20_000 });
    await waitForPageReady(page, 1600);

    await narrate(page, c.modSignup, c.s1Title, c.s1Desc, 2400);

    // Demostrar selección de idioma en la barra superior
    await narrate(page, c.modSignup, c.sLangTitle, c.sLangDesc, 1800);
    await selectLanguageInUI(page, lang);

    await page.evaluate(() => window.scrollBy({ top: 440, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(700);

    const startBtn = page.locator('header a[href="/login"].bg-primary').first();
    await highlightElement(page, startBtn, 800);
    await moveAndClick(page, startBtn, 900);

    // 2. Transición desde Login a Registro (/login -> /signup)
    await page.waitForURL(/\/login/);
    await waitForPageReady(page, 700);

    await narrate(page, c.modSignup, c.s2Title, c.s2Desc, 1900);

    const registerLink = page.locator('a[href="/signup"]').first();
    await highlightElement(page, registerLink, 800);
    await moveAndClick(page, registerLink, 900);

    // 3. Formulario de Registro (/signup)
    await page.waitForURL(/\/signup/);
    await waitForPageReady(page, 800);

    await narrate(page, c.modSignup, c.s3Title, c.s3Desc, 2100);

    const orgNameInput = page.locator('input[name="orgName"]');
    await moveAndType(page, orgNameInput, data.orgName, 40);

    const slugInput = page.locator('input[name="slug"]');
    const adminNameInput = page.locator('input[name="adminName"]');

    await narrate(page, c.modSignup, c.s4Title, c.s4Desc, 2100);

    await moveAndType(page, slugInput, data.takenSlug, 60);
    await moveAndClick(page, adminNameInput, 900);

    const unavailableMsg = page.locator('form p.text-red-600, form p.dark\\:text-red-400').first();
    await unavailableMsg.waitFor({ state: 'visible', timeout: 5000 });
    await highlightElement(page, unavailableMsg, 1200);
    await narrate(page, c.modSignup, c.sTakenTitle, c.sTakenDesc, 1800);

    await moveAndType(page, slugInput, data.availableSlug, 55);
    await moveAndClick(page, adminNameInput, 900);

    const availableMsg = page.locator('form p.text-emerald-600, form p.dark\\:text-emerald-400').first();
    await availableMsg.waitFor({ state: 'visible', timeout: 5000 });
    await highlightElement(page, availableMsg, 1100);
    await narrate(page, c.modSignup, c.s5Title, c.s5Desc, 2100);

    await narrate(page, c.modSignup, c.s6Title, c.s6Desc, 1900);
    await moveAndType(page, adminNameInput, data.adminName, 40);
    await moveAndType(page, page.locator('input[name="email"]'), data.email, 40);
    await moveAndType(page, page.locator('input[name="password"]'), data.password, 40);

    const submitBtn = page.locator('button[type="submit"]');
    await highlightElement(page, submitBtn, 800);
    await narrate(page, c.modSignup, c.s7Title, c.s7Desc, 1700);
    await moveAndClick(page, submitBtn, 600);

    await page.waitForURL(new RegExp(`${data.availableSlug}\\.localhost.*/dashboard`), {
      timeout: 30_000,
    });
    await waitForPageReady(page, 1400);

    // 4. Bienvenida y configuración inicial
    await narrate(page, c.modCreated, c.s8Title, c.s8Desc, 2400);

    await page.goto(`http://${data.availableSlug}.localhost:5173/settings/tenant`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForPageReady(page, 1000);

    await narrate(page, c.modConfig, c.s9Title, c.s9Desc, 2000);

    const supportEmailInput = page.locator('#supportEmail');
    await moveAndType(page, supportEmailInput, data.supportEmail, 40);

    const saveSettingsBtn = page.getByRole('button', { name: /Guardar|Save/i }).first();
    await highlightElement(page, saveSettingsBtn, 800);
    await moveAndClick(page, saveSettingsBtn, 1200);

    await narrate(page, c.modReady, c.sDoneTitle, c.sDoneDesc, 2400);
    await expect(page).toHaveURL(/\/settings\/tenant/);
  } finally {
    await saveNamedVideo(session, `01-registro-empresa/registro-cuenta-empresa-${lang}`);
  }
}

test.describe.serial('Tutorial 01 — Registro de Cuenta para una Empresa (ES / EN)', () => {
  test('registro-cuenta-empresa-es', async ({ browser }) => {
    await runCompanySignupTutorial(browser, 'es');
  });

  test('registro-cuenta-empresa-en', async ({ browser }) => {
    await runCompanySignupTutorial(browser, 'en');
  });
});
