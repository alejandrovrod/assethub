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
const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../learning-hub/public/videos/06-personal/02-equipos-cuadrillas');
const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../../temp-videos-06b');

fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

const ATLAS_ADMIN = {
  email: 'admin@atlas.industrial.com',
};

const COPY = {
  es: {
    modTitle: 'Módulo 06B: Equipos y Cuadrillas de Trabajo',
    sLangTitle: 'Selector de Idioma',
    sLangDesc: 'Demostración de la plataforma en idioma Español y configuración regional activa.',
    sIntroTitle: 'Gestión de Cuadrillas y Brigadas Operativas',
    sIntroDesc: 'Organiza al personal técnico en equipos multidisciplinarios para la asignación ágil de órdenes de trabajo.',
    sTeamsTableTitle: 'Listado de Equipos de Mantenimiento',
    sTeamsTableDesc: 'Supervisa el número de miembros, especialidades y líderes asignados a cada frente de trabajo en planta.',
    sNewTeamBtnTitle: 'Alta de Nuevo Equipo',
    sNewTeamBtnDesc: 'Iniciando el formulario para conformar una brigada técnica especializada.',
    sFillTeamInfoTitle: 'Nombre y Alcance Operativo',
    sFillTeamInfoDesc: 'Definiendo la denominación de la cuadrilla y su responsabilidad operativa en planta.',
    sSelectMembersTitle: 'Selección de Miembros Técnicos',
    sSelectMembersDesc: 'Incorporando técnicos calificados a la plantilla operativa del equipo.',
    sDesignateLeadTitle: 'Designación de Líder de Equipo (Team Lead)',
    sDesignateLeadDesc: 'Asignando el rol de Líder técnico para la supervisión y cierre de órdenes en campo.',
    sSaveTeamTitle: 'Guardar y Conformar Cuadrilla',
    sSaveTeamDesc: 'Confirmando la creación del equipo con su respectivo líder y miembros asignados.',
    sSummaryTitle: 'Cuadrilla Habilitada',
    sSummaryDesc: 'El equipo de mantenimiento está listo para ser asignado en planes preventivos y órdenes correctivas.',
  },
  en: {
    modTitle: 'Module 06B: Maintenance Teams & Work Crews',
    sLangTitle: 'Language Selector',
    sLangDesc: 'Platform demonstration with English locale and active regional settings.',
    sIntroTitle: 'Work Crews & Operational Brigades Management',
    sIntroDesc: 'Organize technical personnel into multidisciplinary squads for agile work order scheduling.',
    sTeamsTableTitle: 'Maintenance Teams Directory',
    sTeamsTableDesc: 'Monitor total members, technical specialties, and designated team leads across plant operations.',
    sNewTeamBtnTitle: 'Creating New Team',
    sNewTeamBtnDesc: 'Opening registration sheet to build a new specialized maintenance crew.',
    sFillTeamInfoTitle: 'Team Name & Operational Scope',
    sFillTeamInfoDesc: 'Defining brigade designation and operational maintenance responsibilities.',
    sSelectMembersTitle: 'Selecting Technician Members',
    sSelectMembersDesc: 'Adding qualified field technicians to the crew roster.',
    sDesignateLeadTitle: 'Designating Team Lead',
    sDesignateLeadDesc: 'Assigning technical lead responsibility for field supervision and work order sign-offs.',
    sSaveTeamTitle: 'Save & Establish Crew',
    sSaveTeamDesc: 'Confirming team creation with assigned lead and technician members.',
    sSummaryTitle: 'Crew Ready for Field Action',
    sSummaryDesc: 'The maintenance team is now active and ready for work orders and preventive schedule assignments.',
  },
};

async function runTeamsTutorial(browser: any, lang: 'es' | 'en') {
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

  const employees = [
    {
      id: 'emp-001',
      firstName: 'Carlos',
      lastName: 'Gómez',
      email: 'cgomez@atlas-industrial.com',
      isActive: true,
    },
    {
      id: 'emp-002',
      firstName: 'Marcela',
      lastName: 'Ríos',
      email: 'mrios@atlas-industrial.com',
      isActive: true,
    },
    {
      id: 'emp-003',
      firstName: 'Fernando',
      lastName: 'Torres',
      email: 'ftorres@atlas-industrial.com',
      isActive: true,
    },
    {
      id: 'emp-004',
      firstName: 'Alejandro',
      lastName: 'Valdez',
      email: 'avaldez@atlas-industrial.com',
      isActive: true,
    },
  ];

  const teams = [
    {
      id: 'team-001',
      name: lang === 'es' ? 'Brigada Mecánica Planta Pesada' : 'Heavy Plant Mechanical Crew',
      description: lang === 'es' ? 'Atención a prensas hidráulicas y líneas de extrusión' : 'Hydraulic presses and extrusion lines support',
      memberCount: 2,
      leadName: 'Carlos Gómez',
      members: [
        { employeeId: 'emp-001', firstName: 'Carlos', lastName: 'Gómez', isLead: true },
        { employeeId: 'emp-003', firstName: 'Fernando', lastName: 'Torres', isLead: false },
      ],
    },
    {
      id: 'team-002',
      name: lang === 'es' ? 'Frente Eléctrico y Automatización' : 'Electrical & Automation Front',
      description: lang === 'es' ? 'Diagnóstico de PLCs, servomotores y tableros de potencia' : 'PLC diagnostics, servo drives, and power panels',
      memberCount: 1,
      leadName: 'Marcela Ríos',
      members: [
        { employeeId: 'emp-002', firstName: 'Marcela', lastName: 'Ríos', isLead: true },
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
          permissions: ['teams:read', 'teams:create', 'teams:update', 'teams:delete', 'employees:read'],
          tenantSlug: 'atlas-industrial',
          tenantName: 'Industrias Metalúrgicas Atlas S.A.',
        }),
      });
    });

    // Mock employees API
    await page.route(/\/api\/v1\/employees(\?.*)?$/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: employees,
          totalCount: employees.length,
          page: 1,
          pageSize: 200,
        }),
      });
    });

    // Mock teams API
    await page.route(/\/api\/v1\/teams(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: teams,
            totalCount: teams.length,
            page: 1,
            pageSize: 100,
          }),
        });
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const created = {
          id: 'team-003',
          name: body.name || (lang === 'es' ? 'Cuadrilla Electromecánica Rápida' : 'Quick Response Electromechanical Squad'),
          description: body.description || (lang === 'es' ? 'Atención urgente a paradas de línea crítica' : 'Critical line stoppages rapid intervention'),
          memberCount: body.members?.length || 2,
          leadName: 'Marcela Ríos',
          members: body.members || [],
        };
        teams.push(created);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }
      return route.fallback();
    });

    // PASO 1: Navegar a /staff/teams
    await page.goto(`${ATLAS_BASE_URL}/staff/teams`, { waitUntil: 'load' });
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

    // PASO 2: Introducción a Equipos y Cuadrillas
    await narrate(page, c.modTitle, c.sIntroTitle, c.sIntroDesc, 2800);

    // PASO 3: Directorio de Equipos
    await narrate(page, c.modTitle, c.sTeamsTableTitle, c.sTeamsTableDesc, 2800);
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await highlightElement(page, firstRow, 1000);
    }

    // PASO 4: Botón Alta de Nuevo Equipo
    await narrate(page, c.modTitle, c.sNewTeamBtnTitle, c.sNewTeamBtnDesc, 2600);
    const addBtn = page.locator('button:has(svg.lucide-plus)').first();
    await highlightElement(page, addBtn, 700);
    await moveAndClick(page, addBtn, 900);

    // PASO 5: Completar Formulario en Sheet
    const sheet = page.locator('[role="dialog"]').first();
    await sheet.waitFor({ state: 'visible', timeout: 8000 });

    await narrate(page, c.modTitle, c.sFillTeamInfoTitle, c.sFillTeamInfoDesc, 2800);

    // Nombre de Equipo
    const nameInput = sheet.locator('input').first();
    await highlightElement(page, nameInput, 600);
    const teamNameVal = lang === 'es' ? 'Cuadrilla Electromecánica Rápida' : 'Quick Response Electromechanical Squad';
    await moveAndType(page, nameInput, teamNameVal, 35);

    // Descripción
    const descInput = sheet.locator('input').nth(1);
    await highlightElement(page, descInput, 600);
    const teamDescVal = lang === 'es' ? 'Atención urgente a paradas de línea crítica' : 'Critical line stoppages rapid intervention';
    await moveAndType(page, descInput, teamDescVal, 30);

    // PASO 6: Seleccionar Miembros Técnicos
    await narrate(page, c.modTitle, c.sSelectMembersTitle, c.sSelectMembersDesc, 2800);

    // Checkbox primer técnico
    const memberCheckbox1 = sheet.locator('button[role="checkbox"]').first();
    if (await memberCheckbox1.isVisible().catch(() => false)) {
      await highlightElement(page, memberCheckbox1, 600);
      await moveAndClick(page, memberCheckbox1, 600);
    }

    // Checkbox segundo técnico
    const memberCheckbox2 = sheet.locator('button[role="checkbox"]').nth(1);
    if (await memberCheckbox2.isVisible().catch(() => false)) {
      await highlightElement(page, memberCheckbox2, 600);
      await moveAndClick(page, memberCheckbox2, 600);
    }

    // PASO 7: Designar Líder de Equipo
    await narrate(page, c.modTitle, c.sDesignateLeadTitle, c.sDesignateLeadDesc, 2800);
    const makeLeaderBtn = sheet.locator('button').filter({ hasText: /Hacer líder|Make Leader|Leader|Líder/i }).first();
    if (await makeLeaderBtn.isVisible().catch(() => false)) {
      await highlightElement(page, makeLeaderBtn, 700);
      await moveAndClick(page, makeLeaderBtn, 800);
    }

    // PASO 8: Guardar y Conformar Cuadrilla
    await narrate(page, c.modTitle, c.sSaveTeamTitle, c.sSaveTeamDesc, 2600);
    const saveBtn = sheet.locator('button').filter({ hasText: /Crear equipo|Create Team|Guardar|Save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
      await highlightElement(page, saveBtn, 700);
      await moveAndClick(page, saveBtn, 1200);
    }

    await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await waitForPageReady(page, 1500);

    // Resaltar nueva fila de equipo
    const lastRow = page.locator('table tbody tr').last();
    if (await lastRow.isVisible().catch(() => false)) {
      await highlightElement(page, lastRow, 1100);
    }

    // PASO 9: Conclusión
    await narrate(page, c.modTitle, c.sSummaryTitle, c.sSummaryDesc, 2800);
    await page.waitForTimeout(1000);
  } finally {
    const video = page.video();
    await session.context.close();

    if (video) {
      const rawPath = await video.path();
      const finalFileName = `equipos-cuadrillas-${lang}.webm`;
      const finalPath = path.join(VIDEOS_OUTPUT_DIR, finalFileName);
      fs.copyFileSync(rawPath, finalPath);
    }
  }
}

test.describe('Tutorial 06B — Equipos y Cuadrillas de Trabajo (ES / EN)', () => {
  test.setTimeout(300_000);

  test('equipos-cuadrillas-es', async ({ browser }) => {
    await runTeamsTutorial(browser, 'es');
  });

  test('equipos-cuadrillas-en', async ({ browser }) => {
    await runTeamsTutorial(browser, 'en');
  });
});

