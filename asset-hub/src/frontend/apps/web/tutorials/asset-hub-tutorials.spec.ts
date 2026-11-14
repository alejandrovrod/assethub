import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  BASE_URL,
  closeOverlay,
  moveAndClick,
  narrate,
  openTutorialSession,
  performLoginAndSaveState,
  saveNamedVideo,
  tryMoveAndClick,
  waitForPageReady,
} from './helpers/tutorial-recorder';

interface TabStep {
  label: RegExp | string;
  title: string;
  description: string;
  pauseMs?: number;
}

/**
 * Clicks through a sequence of tabs inside a scope (or full page) while narrating each one.
 */
async function walkTabs(
  page: Page,
  scope: Locator | Page,
  moduleName: string,
  steps: TabStep[],
): Promise<void> {
  for (const step of steps) {
    const tab = scope.getByRole('tab', { name: step.label }).first();
    const clicked = await tryMoveAndClick(page, tab, 600, 3000);
    if (clicked) {
      await narrate(page, moduleName, step.title, step.description, step.pauseMs ?? 2000);
    }
  }
}

/**
 * Smoothly scrolls the page down and back up to showcase long views in a video.
 */
async function scrollShowcase(page: Page, distance = 420): Promise<void> {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), distance);
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(700);
}

test.describe.serial('Tutoriales Asset Hub — Todos los Módulos', () => {
  test('01-login-y-dashboard', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: false });
    const { page } = session;

    try {
      await performLoginAndSaveState(page, true);

      await expect(page).toHaveURL(/\/dashboard/);
      await narrate(
        page,
        'Panel de Control',
        'Indicadores de Confiabilidad y Operación',
        'Desde el Dashboard supervisás MTBF, MTTR, disponibilidad operativa e incidencias activas en tiempo real.',
        2600,
      );

      await scrollShowcase(page, 480);

      await narrate(
        page,
        'Panel de Control',
        'Costo Total de Propiedad (TCO) y Ranking de Activos',
        'Podés analizar los costos acumulados de mantenimiento y filtrar métricas haciendo clic en cualquier activo de la tabla.',
        2400,
      );

      const firstAssetRow = page.locator('tbody tr').first();
      if (await tryMoveAndClick(page, firstAssetRow, 1200, 3500)) {
        await narrate(
          page,
          'Panel de Control',
          'Vista Filtrada por Activo',
          'Al seleccionar un activo, todo el tablero recalcula sus KPIs para ese equipo específico.',
          2200,
        );
        await tryMoveAndClick(page, page.getByRole('button', { name: /todos los activos/i }), 900, 3000);
      }
    } finally {
      await saveNamedVideo(session, '01-login-y-dashboard');
    }
  });

  test('02-plantillas', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: true });
    const { page } = session;

    try {
      await page.goto(`${BASE_URL}/assets/templates`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await narrate(
        page,
        'Plantillas de Activos',
        'Estandarización de Tipos de Equipo',
        'Las plantillas definen los campos técnicos, ciclo de vida y checklist que heredarán todos los activos creados con ellas.',
        2400,
      );

      const libraryBtn = page.getByRole('button', { name: /biblioteca/i });
      if (await tryMoveAndClick(page, libraryBtn, 1200, 3500)) {
        await narrate(
          page,
          'Plantillas de Activos',
          'Biblioteca Global de Plantillas',
          'Podés importar plantillas listas para usar (vehículos, equipos industriales, IT) con un clic.',
          2200,
        );
        await closeOverlay(page, 700);
      }

      // Open template builder (prefer editing first existing template or creating from scratch)
      const editBtn = page.locator('tbody tr').first().locator('button').first();
      const createBtn = page.locator('button[title*="Crear plantilla"], button[title*="Create"]').first();
      const opened =
        (await tryMoveAndClick(page, editBtn, 1000, 3000)) ||
        (await tryMoveAndClick(page, createBtn, 1000, 3000));

      if (opened) {
        const dialog = page.getByRole('dialog').last();
        await walkTabs(page, dialog, 'Constructor de Plantilla', [
          {
            label: /general/i,
            title: '1. Datos Generales',
            description: 'Definís el código, nombre y descripción de la plantilla de activo.',
          },
          {
            label: /atributos/i,
            title: '2. Constructor de Atributos',
            description: 'Diseñás pestañas, secciones y campos dinámicos (texto, número, selección, fechas) sin código.',
          },
          {
            label: /ciclo de vida/i,
            title: '3. Ciclo de Vida (Workflow)',
            description: 'Configurás los estados permitidos y transiciones visuales del activo.',
          },
          {
            label: /checklist/i,
            title: '4. Checklist de Mantenimiento',
            description: 'Definís las tareas técnicas base que acompañarán al equipo.',
          },
          {
            label: /vista previa/i,
            title: '5. Vista Previa en Vivo',
            description: 'Validás exactamente cómo verá el técnico el formulario antes de guardar.',
          },
        ]);
        await closeOverlay(page, 700);
      }

      // Incident Workflow Templates
      await page.goto(`${BASE_URL}/maintenance/workflow-templates`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Plantillas de Incidencias',
        'Formularios y Flujos de Reporte',
        'También podés configurar plantillas para incidencias, definiendo campos obligatorios y reglas para disparar Órdenes de Trabajo.',
        2600,
      );

      const editWfBtn = page.locator('tbody tr').first().locator('button').first();
      if (await tryMoveAndClick(page, editWfBtn, 1000, 3000)) {
        const wfDialog = page.getByRole('dialog').last();
        await walkTabs(page, wfDialog, 'Plantilla de Incidencia', [
          {
            label: /atributos/i,
            title: 'Campos del Reporte',
            description: 'Campos que completará el técnico desde la web o la PWA offline al reportar.',
          },
          {
            label: /ciclo de vida/i,
            title: 'Estados de la Incidencia',
            description: 'Configurás qué transición genera automáticamente una Orden de Trabajo.',
          },
        ]);
        await closeOverlay(page, 700);
      }
    } finally {
      await saveNamedVideo(session, '02-plantillas');
    }
  });

  test('03-activos', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: true });
    const { page } = session;

    try {
      await page.goto(`${BASE_URL}/assets`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await narrate(
        page,
        'Activos',
        'Catálogo Central de Activos',
        'Consultá y filtrá todo tu inventario técnico por código, nombre, estado operativo o nivel de criticidad.',
        2400,
      );

      const listToggle = page.locator('button:has(svg.lucide-list)').first();
      if (await tryMoveAndClick(page, listToggle, 1100, 3000)) {
        await narrate(
          page,
          'Activos',
          'Vista en Lista y Grilla',
          'Alterná rápidamente entre tarjetas visuales o tabla detallada según tu preferencia.',
          1800,
        );
      }

      const mapBtn = page.getByRole('button', { name: /ver en mapa|map/i });
      if (await tryMoveAndClick(page, mapBtn, 1400, 3000)) {
        await narrate(
          page,
          'Activos',
          'Geolocalización Global',
          'Visualizá la ubicación física de todos los activos georreferenciados en el mapa interactivo.',
          2200,
        );
        await closeOverlay(page, 700);
      }

      const importBtn = page.getByRole('button', { name: /importar/i });
      if (await tryMoveAndClick(page, importBtn, 1200, 3000)) {
        await narrate(
          page,
          'Activos',
          'Asistente de Importación Masiva',
          'Subí planillas Excel/CSV, mapeá columnas y validá registros antes de crear activos en lote.',
          2200,
        );
        await closeOverlay(page, 700);
      }

      // Open first asset detail
      const firstRowOrCard = page.locator('tbody tr.cursor-pointer, div.cursor-pointer.group').first();
      if (await tryMoveAndClick(page, firstRowOrCard, 1200, 4000)) {
        await waitForPageReady(page);
        await narrate(
          page,
          'Detalle de Activo',
          'Ficha 360° del Equipo',
          'Cada activo centraliza ficha técnica, materiales BOM, ubicación, jerarquía, finanzas e historial de mantenimiento.',
          2400,
        );

        await walkTabs(page, page, 'Detalle de Activo', [
          {
            label: /bom|materiales/i,
            title: 'BOM y Repuestos Asociados',
            description: 'Lista de materiales y repuestos compatibles con el equipo para agilizar consumos en campo.',
          },
          {
            label: /ubicaci[oó]n|mapa/i,
            title: 'Ubicación en Mapa',
            description: 'Coordenadas exactas y referencia geográfica del activo.',
          },
          {
            label: /bit[aá]cora|timeline/i,
            title: 'Bitácora de Eventos',
            description: 'Trazabilidad cronológica de cambios de estado, ediciones y eventos.',
          },
          {
            label: /jerarqu[ií]a/i,
            title: 'Jerarquía Padre / Componentes',
            description: 'Relación con sistemas superiores y sub-activos dependientes.',
          },
          {
            label: /finanzas/i,
            title: 'Gestión Financiera del Activo',
            description: 'Perfil financiero, depreciación, asientos devengados, custodias y bajas.',
          },
          {
            label: /detalles/i,
            title: 'Atributos Dinámicos',
            description: 'Formulario técnico completo generado desde su plantilla.',
          },
        ]);
      }
    } finally {
      await saveNamedVideo(session, '03-activos');
    }
  });

  test('04-incidencias', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: true });
    const { page } = session;

    try {
      await page.goto(`${BASE_URL}/maintenance/incidents`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await narrate(
        page,
        'Incidencias',
        'Bandeja de Reportes y Fallas',
        'Centralizá todas las incidencias reportadas desde la web o la app móvil de campo vinculadas a cada activo.',
        2400,
      );

      // Open Report Incident sheet
      const addIncidentBtn = page.locator('button:has(svg.lucide-plus)').first();
      if (await tryMoveAndClick(page, addIncidentBtn, 1100, 3000)) {
        await narrate(
          page,
          'Incidencias',
          'Reportar Nueva Incidencia',
          'Seleccionás el activo afectado, la plantilla de incidencia y completás los datos requeridos.',
          2200,
        );
        await closeOverlay(page, 700);
      }

      // Open first incident detail via Eye button or row link
      const viewBtn = page.locator('tbody tr').first().locator('button:has(svg.lucide-eye), a').first();
      if (await tryMoveAndClick(page, viewBtn, 1200, 4000)) {
        await waitForPageReady(page);
        await narrate(
          page,
          'Detalle de Incidencia',
          'Triaje y Transición de Estados',
          'Desde el detalle podés validar evidencias, avanzar el flujo de estado y generar una Orden de Trabajo.',
          2500,
        );

        await walkTabs(page, page, 'Detalle de Incidencia', [
          {
            label: /bit[aá]cora/i,
            title: 'Historial de la Incidencia',
            description: 'Auditoría completa de transiciones, responsables y tareas derivadas.',
          },
          {
            label: /detalles/i,
            title: 'Atributos y Tareas Derivadas',
            description: 'Visualización de metadatos, orden generada y tareas operativas asociadas.',
          },
        ]);
      }
    } finally {
      await saveNamedVideo(session, '04-incidencias');
    }
  });

  test('05-tareas', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: true });
    const { page } = session;

    try {
      await page.goto(`${BASE_URL}/maintenance/tasks`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await narrate(
        page,
        'Tareas de Trabajo',
        'Gestión Operativa en Lista y Kanban',
        'Las tareas representan las actividades concretas asignadas a técnicos o cuadrillas, agrupadas por Orden o independientes.',
        2500,
      );

      const kanbanTab = page.getByRole('tab', { name: /kanban/i });
      if (await tryMoveAndClick(page, kanbanTab, 1200, 3000)) {
        await narrate(
          page,
          'Tareas de Trabajo',
          'Tablero Kanban por Estado',
          'Visualizá rápidamente el avance entre Por hacer, En progreso, Pausada y Completada.',
          2200,
        );
      }

      const listTab = page.getByRole('tab', { name: /lista/i });
      await tryMoveAndClick(page, listTab, 900, 3000);

      // Expand grouped order row if needed, then click a task row or Kanban card
      const orderGroupRow = page.locator('tbody tr:has(svg.lucide-wrench)').first();
      await tryMoveAndClick(page, orderGroupRow, 800, 2000);

      const taskRow = page.locator('tbody tr').filter({ hasNot: page.locator('svg.lucide-wrench') }).first();
      const clickedTask = await tryMoveAndClick(page, taskRow, 1100, 3000);
      if (clickedTask) {
        await narrate(
          page,
          'Detalle de Tarea',
          'Panel Dividido de Ejecución',
          'Al seleccionar una tarea se abre el panel lateral sin perder el contexto de la lista.',
          2200,
        );

        await walkTabs(page, page, 'Detalle de Tarea', [
          {
            label: /detalle/i,
            title: 'Checklist y Asignación',
            description: 'Editá título, responsable, checklist técnico paso a paso y transiciones de estado.',
          },
          {
            label: /evidencias/i,
            title: 'Evidencias y Firma Digital',
            description: 'Galería de fotos, archivos adjuntos y firma digital de conformidad.',
          },
          {
            label: /historial/i,
            title: 'Trazabilidad de Tiempos',
            description: 'Registro cronológico de inicios, pausas y finalización.',
          },
          {
            label: /comentarios/i,
            title: 'Comunicación del Equipo',
            description: 'Hilo de comentarios internos entre supervisores y técnicos de campo.',
          },
        ]);
      } else {
        const addTaskBtn = page.locator('button:has(svg.lucide-plus)').first();
        if (await tryMoveAndClick(page, addTaskBtn, 1100, 3000)) {
          await narrate(
            page,
            'Tareas de Trabajo',
            'Creación de Nueva Tarea',
            'Asigná responsable, prioridad y descripción desde el formulario lateral.',
            2000,
          );
          await closeOverlay(page, 600);
        }
      }
    } finally {
      await saveNamedVideo(session, '05-tareas');
    }
  });

  test('06-ordenes-y-planes', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: true });
    const { page } = session;

    try {
      await page.goto(`${BASE_URL}/maintenance/orders`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await narrate(
        page,
        'Órdenes de Mantenimiento',
        'Planificación Correctiva y Preventiva',
        'Controlá el ciclo completo de cada Orden de Trabajo: Borrador, Aprobada, Programada, En Progreso y Verificada.',
        2500,
      );

      const firstOrderRow = page.locator('tbody tr.cursor-pointer').first();
      if (await tryMoveAndClick(page, firstOrderRow, 1100, 3500)) {
        await narrate(
          page,
          'Orden de Mantenimiento',
          'Detalle, Repuestos y Tareas',
          'Desde el panel derecho gestionás fechas programadas, botones de flujo, consumo de materiales y tareas vinculadas.',
          2600,
        );
      } else {
        const addOrderBtn = page.locator('button:has(svg.lucide-plus)').first();
        if (await tryMoveAndClick(page, addOrderBtn, 1100, 3000)) {
          await narrate(
            page,
            'Órdenes de Mantenimiento',
            'Nueva Orden de Mantenimiento',
            'Creá órdenes vinculadas a un activo, asignando técnico o equipo y ventana de programación.',
            2200,
          );
          await closeOverlay(page, 600);
        }
      }

      // Preventive Plans
      await page.goto(`${BASE_URL}/maintenance/preventive-plans`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await narrate(
        page,
        'Planes Preventivos',
        'Mantenimiento Programado Recurrente',
        'Automatizá la generación de órdenes preventivas por frecuencia de calendario o ciclos de uso.',
        2500,
      );

      const firstPlanRow = page.locator('tbody tr').first();
      if (await tryMoveAndClick(page, firstPlanRow, 1100, 3500)) {
        await walkTabs(page, page, 'Plan Preventivo', [
          {
            label: /calendario/i,
            title: 'Calendario de Ejecuciones',
            description: 'Visualizá las próximas fechas programadas del plan preventivo.',
          },
          {
            label: /bit[aá]cora/i,
            title: 'Bitácora del Plan',
            description: 'Registro de ejecuciones automáticas y manuales.',
          },
          {
            label: /generados/i,
            title: 'Órdenes Generadas',
            description: 'Acceso directo a todas las órdenes creadas por este plan.',
          },
        ]);
      }
    } finally {
      await saveNamedVideo(session, '06-ordenes-y-planes');
    }
  });

  test('07-inventario-y-catalogos', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: true });
    const { page } = session;

    try {
      await page.goto(`${BASE_URL}/inventory/warehouses`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Inventario — Almacenes',
        'Gestión de Bodegas y Almacenes',
        'Definí los almacenes centrales o móviles donde se resguardan los repuestos y materiales.',
        2300,
      );

      await page.goto(`${BASE_URL}/inventory/stock`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Inventario — Stock',
        'Existencias, Costos y Movimientos',
        'Supervisá existencias por almacén, valor total de inventario y alertas de quiebre de stock.',
        2300,
      );

      const adjustBtn = page.getByRole('button', { name: /registrar entrada|ajuste/i });
      if (await tryMoveAndClick(page, adjustBtn, 1100, 3000)) {
        await narrate(
          page,
          'Inventario — Stock',
          'Entradas y Ajustes de Stock',
          'Registrá recepciones de compra o ajustes de inventario indicando cantidad, costo unitario y motivo.',
          2200,
        );
        await closeOverlay(page, 700);
      }

      await page.goto(`${BASE_URL}/inventory/settings`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Inventario — Configuración',
        'Modo de Operación y Políticas',
        'Configurá si operás inventario interno, externo o híbrido, y si permitís saldos negativos.',
        2300,
      );

      await page.goto(`${BASE_URL}/catalogs`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Catálogos Dinámicos',
        'Listas Maestras del Sistema',
        'Administrá catálogos personalizados (repuestos, marcas, prioridades, motivos) reutilizables en plantillas.',
        2300,
      );
      await tryMoveAndClick(page, page.locator('tbody tr').first(), 1000, 3000);
    } finally {
      await saveNamedVideo(session, '07-inventario-y-catalogos');
    }
  });

  test('08-personal-usuarios-y-configuracion', async ({ browser }) => {
    const session = await openTutorialSession(browser, { authenticated: true });
    const { page } = session;

    try {
      await page.goto(`${BASE_URL}/staff/employees`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Personal — Empleados',
        'Directorio Técnico y Operativo',
        'Administrá técnicos, supervisores y operarios, y habilitá su acceso al sistema directamente desde su ficha.',
        2300,
      );

      await page.goto(`${BASE_URL}/staff/teams`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Personal — Equipos',
        'Cuadrillas y Líderes de Trabajo',
        'Agrupá empleados en cuadrillas con un líder designado para asignar órdenes y tareas en conjunto.',
        2300,
      );

      await page.goto(`${BASE_URL}/settings/users`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Configuración — Usuarios',
        'Cuentas e Invitaciones',
        'Creá cuentas directamente o enviá invitaciones por correo electrónico asignando roles.',
        2200,
      );

      await page.goto(`${BASE_URL}/settings/roles`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Configuración — Roles y Permisos',
        'Control Granular por Módulo',
        'Personalizá exactamente qué acciones puede leer, crear, editar o aprobar cada perfil.',
        2200,
      );
      const editRoleBtn = page.getByRole('button', { name: /editar/i }).first();
      if (await tryMoveAndClick(page, editRoleBtn, 1100, 3000)) {
        await narrate(
          page,
          'Configuración — Roles',
          'Matriz de Permisos',
          'Activá o desactivá permisos individuales organizados por cada módulo de la plataforma.',
          2000,
        );
        await closeOverlay(page, 600);
      }

      await page.goto(`${BASE_URL}/settings/tenant`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Organización y Auditoría',
        'Marca Corporativa y Notificaciones',
        'Configurá el logo institucional, correo de soporte y automatización de plantillas de notificación.',
        2200,
      );

      await page.goto(`${BASE_URL}/settings/audit`, { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);
      await narrate(
        page,
        'Auditoría del Sistema',
        'Registro Inmutable de Acciones',
        'Consultá quién realizó cada acción crítica, cuándo y desde qué entidad para cumplimiento y seguridad.',
        2400,
      );
    } finally {
      await saveNamedVideo(session, '08-personal-usuarios-y-configuracion');
    }
  });
});

