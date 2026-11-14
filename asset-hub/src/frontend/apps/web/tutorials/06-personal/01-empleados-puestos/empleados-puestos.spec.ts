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
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/06-personal/01-empleados-puestos');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-06a');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 06A: Empleados y Puestos de Mantenimiento',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Directorio de Personal y Técnicos',
    sIntroDesc: 'Gestiona la nómina operativa, especialidades técnicas y perfiles de acceso al sistema para mantenimiento.',
    sTabsFilterTitle: 'Filtros y Búsqueda de Personal',
    sTabsFilterDesc: 'Permite filtrar rápidamente entre personal activo, inactivo y buscar por nombre o especialidad.',
    sNewEmployeeBtnTitle: 'Alta de Nuevo Empleado',
    sNewEmployeeBtnDesc: 'Iniciando el registro de un nuevo técnico electromecánico en el sistema.',
    sFillPersonalTitle: 'Datos Personales y Contacto',
    sFillPersonalDesc: 'Ingresando nombre, apellido, correo corporativo y teléfono de contacto para asignaciones en campo.',
    sRoleJobTitle: 'Puesto de Trabajo y Acceso al Sistema',
    sRoleJobDesc: 'Asigna el rol de catálogo técnico y genera automáticamente credenciales con permisos de rol de sistema.',
    sSaveTitle: 'Guardar y Generar Credenciales',
    sSaveDesc: 'Confirmando el alta del técnico y generando su contraseña temporal de acceso inicial.',
    sSummaryTitle: 'Empleado Registrado con Éxito',
    sSummaryDesc: 'El técnico queda incorporado en la nómina activa y listo para formar parte de cuadrillas y órdenes de trabajo.',
  },
  en: {
    modTitle: 'Module 06A: Staff Employees & Maintenance Job Titles',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Maintenance Staff & Technicians Directory',
    sIntroDesc: 'Manage field technicians, operational roles, contact info, and system login permissions.',
    sTabsFilterTitle: 'Filters and Staff Search',
    sTabsFilterDesc: 'Quickly filter between active and inactive personnel, or search by name and specialty.',
    sNewEmployeeBtnTitle: 'Registering New Employee',
    sNewEmployeeBtnDesc: 'Starting the registration sheet for a new electromechanical technician.',
    sFillPersonalTitle: 'Personal & Contact Information',
    sFillPersonalDesc: 'Entering name, surname, corporate email, and phone number for field work order assignments.',
    sRoleJobTitle: 'Job Title & System Login Access',
    sRoleJobDesc: 'Assigns technical catalog job title and provisions system user login with technical permissions.',
    sSaveTitle: 'Save & Generate Credentials',
    sSaveDesc: 'Confirming registration and provisioning temporary first-login credentials for the technician.',
    sSummaryTitle: 'Employee Successfully Registered',
    sSummaryDesc: 'The technician is now part of the active roster, ready to be assigned to teams and work orders.',
  },
};

async function runEmployeesTutorial(browser: any, lang: 'es' | 'en') {
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

  const initialEmployees = [
    {
      id: 'emp-001',
      firstName: 'Carlos',
      lastName: 'Gómez',
      email: 'cgomez@atlas-industrial.com',
      phoneNumber: '+52 55 4123 9876',
      roleCatalogItemId: 'role-001',
      roleLabel: lang === 'es' ? 'Técnico Mecánico Senior' : 'Senior Mechanical Technician',
      isActive: true,
      userId: 'user-001',
    },
    {
      id: 'emp-002',
      firstName: 'Marcela',
      lastName: 'Ríos',
      email: 'mrios@atlas-industrial.com',
      phoneNumber: '+52 55 8899 4433',
      roleCatalogItemId: 'role-002',
      roleLabel: lang === 'es' ? 'Especialista en Automatización PLC' : 'PLC Automation Specialist',
      isActive: true,
      userId: 'user-002',
    },
    {
      id: 'emp-003',
      firstName: 'Fernando',
      lastName: 'Torres',
      email: 'ftorres@atlas-industrial.com',
      phoneNumber: '+52 55 3322 1100',
      roleCatalogItemId: 'role-003',
      roleLabel: lang === 'es' ? 'Inspector Predictivo Termógrafo' : 'Predictive Thermography Inspector',
      isActive: true,
      userId: 'user-003',
    },
  ];

  const roleCatalogItems = [
    { id: 'role-001', code: 'MEC-SR', label: lang === 'es' ? 'Técnico Mecánico Senior' : 'Senior Mechanical Technician' },
    { id: 'role-002', code: 'AUTO-PLC', label: lang === 'es' ? 'Especialista en Automatización PLC' : 'PLC Automation Specialist' },
    { id: 'role-003', code: 'PRED-TERM', label: lang === 'es' ? 'Inspector Predictivo Termógrafo' : 'Predictive Thermography Inspector' },
    { id: 'role-004', code: 'ELEC-IND', label: lang === 'es' ? 'Electricista Industrial' : 'Industrial Electrician' },
  ];

  const systemRoles = [
    { id: 'srole-001', name: 'Field Technician', description: 'Acceso a ejecución de órdenes de trabajo' },
    { id: 'srole-002', name: 'Maintenance Supervisor', description: 'Planificación y aprobación de tareas' },
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
          permissions: ['employees:read', 'employees:create', 'employees:update', 'employees:delete'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock catalog-items employee-role
    await page.route(/\/api\/v1\/catalogs\/employee-role\/items(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(roleCatalogItems),
      });
    });

    // Mock system roles
    await page.route(/\/api\/v1\/roles(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(systemRoles),
      });
    });

    // Mock employees API
    await page.route(/\/api\/v1\/employees(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: initialEmployees,
            totalCount: initialEmployees.length,
            page: 1,
            pageSize: 100,
          }),
        });
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const created = {
          id: 'emp-004',
          firstName: body.firstName || 'Alejandro',
          lastName: body.lastName || 'Valdez',
          email: body.email || 'avaldez@atlas-industrial.com',
          phoneNumber: body.phoneNumber || '+52 55 7766 5544',
          roleCatalogItemId: body.roleCatalogItemId || 'role-004',
          roleLabel: lang === 'es' ? 'Electricista Industrial' : 'Industrial Electrician',
          isActive: true,
          temporalPassword: 'TempPass2026!#Atlas',
        };
        initialEmployees.push(created);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }
      return route.fallback();
    });

    // PASO 1: Navegar a /staff/employees
    await page.goto(`${ATLAS_BASE_URL}/staff/employees`, { waitUntil: 'load' });
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

    // PASO 2: Introducción a Directorio de Empleados
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Filtros de estado y Búsqueda
    await narrate(page, c.modTitle, c.sTabsFilterTitle, c.sTabsFilterDesc, 2600);
    const searchInput = page.locator('input[placeholder*="Buscar"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await highlightElement(page, searchInput, 700);
    }
    const tabsList = page.locator('[role="tablist"]').first();
    if (await tabsList.isVisible().catch(() => false)) {
      await highlightElement(page, tabsList, 800);
    }

    // PASO 4: Botón Nuevo Empleado
    await narrate(page, c.modTitle, c.sNewEmployeeBtnTitle, c.sNewEmployeeBtnDesc, 2600);
    const addBtn = page.locator('button:has(svg.lucide-plus)').first();
    await highlightElement(page, addBtn, 700);
    await moveAndClick(page, addBtn, 900);

    // PASO 5: Completar Formulario en Sheet
    const sheet = page.locator('[role="dialog"]').first();
    await sheet.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sFillPersonalTitle, c.sFillPersonalDesc, 2800);

    // Nombre
    const firstNameInput = sheet.locator('input#emp-firstName');
    await highlightElement(page, firstNameInput, 600);
    await moveAndType(page, firstNameInput, 'Alejandro', 40);

    // Apellido
    const lastNameInput = sheet.locator('input#emp-lastName');
    await highlightElement(page, lastNameInput, 600);
    await moveAndType(page, lastNameInput, 'Valdez', 40);

    // Email
    const emailInput = sheet.locator('input#emp-email');
    await highlightElement(page, emailInput, 600);
    await moveAndType(page, emailInput, 'avaldez@atlas-industrial.com', 35);

    // Teléfono
    const phoneInput = sheet.locator('input#emp-phone');
    if (await phoneInput.isVisible().catch(() => false)) {
      await highlightElement(page, phoneInput, 500);
      await moveAndType(page, phoneInput, '+52 55 7766 5544', 35);
    }

    // PASO 6: Puesto de Trabajo y Acceso
    await narrate(page, c.modTitle, c.sRoleJobTitle, c.sRoleJobDesc, 2800);

    // Seleccionar Puesto (Select)
    const jobSelect = sheet.locator('button[role="combobox"]').first();
    if (await jobSelect.isVisible().catch(() => false)) {
      await highlightElement(page, jobSelect, 600);
      await moveAndClick(page, jobSelect, 600);
      const roleOption = page.getByRole('option').last();
      if (await roleOption.isVisible().catch(() => false)) {
        await moveAndClick(page, roleOption, 600);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // PASO 7: Guardar y Generar Credenciales
    await narrate(page, c.modTitle, c.sSaveTitle, c.sSaveDesc, 2600);
    const saveBtn = sheet.locator('button').filter({ hasText: /Guardar|Save|Registrar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
      await highlightElement(page, saveBtn, 700);
      await moveAndClick(page, saveBtn, 1000);
    }

    // Si aparece pantalla de contraseña temporal, copiar/cerrar
    await page.waitForTimeout(1000);
    const doneBtn = sheet.locator('button').filter({ hasText: /Listo|Done|Aceptar/i }).first();
    if (await doneBtn.isVisible().catch(() => false)) {
      await highlightElement(page, doneBtn, 700);
      await moveAndClick(page, doneBtn, 800);
    }

    await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await waitForPageReady(page, 1500);

    // Resaltar nueva fila creada
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
      const finalFileName = `empleados-puestos-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 06A — Empleados y Puestos de Mantenimiento (ES / EN)', () => {
  test.setTimeout(300_000);

  test('empleados-puestos-es', async ({ browser }) => {
    await runEmployeesTutorial(browser, 'es');
  });

  test('empleados-puestos-en', async ({ browser }) => {
    await runEmployeesTutorial(browser, 'en');
  });
});

