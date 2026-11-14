export type Lang = 'es' | 'en'
export type RoleFilter = 'all' | 'admin' | 'maintenance' | 'inventory' | 'analytics'

export interface LocalizedText {
  es: string
  en: string
}

export interface Lesson {
  id: string
  moduleId: string
  order: number
  title: LocalizedText
  description: LocalizedText
  duration: string
  role: Exclude<RoleFilter, 'all'>
  prerequisiteIds?: string[]
  videoPath: {
    es: string
    en: string
  }
}

export interface ModuleGroup {
  id: string
  number: string
  title: LocalizedText
  subtitle: LocalizedText
  lessons: Lesson[]
}

const VIDEOS_BASE = (import.meta.env.VITE_VIDEOS_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/videos'
const THUMBS_BASE = (import.meta.env.VITE_THUMBS_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/thumbnails'

export const videoUrl = (relativePath: string) => `${VIDEOS_BASE}/${relativePath.replace(/^\//, '')}`
export const thumbnailUrl = (videoRelativePath: string) =>
  `${THUMBS_BASE}/${videoRelativePath.replace(/^\//, '').replace(/\.webm$/, '.jpg')}`

export const LEARNING_MODULES: ModuleGroup[] = [
  {
    id: 'm01',
    number: '01',
    title: { es: 'Onboarding Empresarial', en: 'Company Onboarding' },
    subtitle: {
      es: 'Creación de cuenta corporativa, validación de subdominio y configuración inicial.',
      en: 'Corporate account signup, subdomain validation, and initial workspace setup.',
    },
    lessons: [
      {
        id: '01-registro',
        moduleId: 'm01',
        order: 1,
        title: { es: 'Registro de Cuenta y Empresa', en: 'Company Account Registration' },
        description: {
          es: 'Cómo dar de alta tu empresa en Asset Hub, validar disponibilidad de slug corporativo y configurar los parámetros iniciales del tenant.',
          en: 'How to register your company in Asset Hub, validate corporate slug availability, and configure initial tenant settings.',
        },
        duration: '01:50',
        role: 'admin',
        videoPath: {
          es: '01-registro-empresa/registro-cuenta-empresa-es.webm',
          en: '01-registro-empresa/registro-cuenta-empresa-en.webm',
        },
      },
    ],
  },
  {
    id: 'm02',
    number: '02',
    title: { es: 'Catálogos y Esquemas Dinámicos', en: 'Catalogs & Dynamic Schemas' },
    subtitle: {
      es: 'Estandarización de listas maestras y formularios técnicos por tipo de activo.',
      en: 'Standardization of master lists and dynamic technical forms per asset type.',
    },
    lessons: [
      {
        id: '02-catalogos',
        moduleId: 'm02',
        order: 1,
        title: { es: 'Catálogos y Plantillas de Activos', en: 'Asset Catalogs & Templates' },
        description: {
          es: 'Configuración de catálogos maestros (fabricantes, criticidades, puestos) y creación de plantillas base para activos.',
          en: 'Setting up master catalogs (manufacturers, criticalities, roles) and creating base asset templates.',
        },
        duration: '02:30',
        role: 'admin',
        videoPath: {
          es: '02-catalogos-y-plantillas/catalogos-y-plantillas-activos-es.webm',
          en: '02-catalogos-y-plantillas/catalogos-y-plantillas-activos-en.webm',
        },
      },
      {
        id: '02-esquemas',
        moduleId: 'm02',
        order: 2,
        title: { es: 'Esquemas Dinámicos, Tabs y Secciones', en: 'Dynamic Schemas, Tabs & Sections' },
        description: {
          es: 'Diseño visual de fichas técnicas con JSON Schema, pestañas personalizadas y secciones de atributos técnicos.',
          en: 'Visual design of technical datasheets using JSON Schema, custom tabs, and structured attribute sections.',
        },
        duration: '02:15',
        role: 'admin',
        prerequisiteIds: ['02-catalogos'],
        videoPath: {
          es: '02-plantillas/esquemas-dinamicos-tabs-secciones-es.webm',
          en: '02-plantillas/esquemas-dinamicos-tabs-secciones-en.webm',
        },
      },
    ],
  },
  {
    id: 'm03',
    number: '03',
    title: { es: 'Ciclo de Vida y Gestión de Activos', en: 'Asset Lifecycle & Management' },
    subtitle: {
      es: 'Máquina de estados, ficha técnica, BOM, jerarquía de planta, mapas, bitácora y finanzas.',
      en: 'State machine, technical datasheet, BOM, plant hierarchy, maps, audit log, and finance.',
    },
    lessons: [
      {
        id: '03-estados',
        moduleId: 'm03',
        order: 1,
        title: { es: 'Máquina de Estados y Ciclo de Vida', en: 'Lifecycle State Machine' },
        description: {
          es: 'Modelado visual de estados operativos (Operativo, En Mantenimiento, Fuera de Servicio) y reglas de transición.',
          en: 'Visual modeling of operational states (Operational, Under Maintenance, Out of Service) and transition rules.',
        },
        duration: '02:00',
        role: 'admin',
        prerequisiteIds: ['04-00-plantillas'],
        videoPath: {
          es: '03-maquina-estados/maquina-estados-ciclo-vida-es.webm',
          en: '03-maquina-estados/maquina-estados-ciclo-vida-en.webm',
        },
      },
      {
        id: '03-01-alta',
        moduleId: 'm03',
        order: 2,
        title: { es: 'Alta y Ficha Técnica de Activos', en: 'Asset Creation & Datasheet' },
        description: {
          es: 'Registro de un nuevo activo industrial utilizando plantillas dinámicas y completando su ficha técnica.',
          en: 'Registering a new industrial asset using dynamic templates and completing its technical datasheet.',
        },
        duration: '01:20',
        role: 'maintenance',
        prerequisiteIds: ['02-esquemas'],
        videoPath: {
          es: '03-activos/01-alta-ficha-activos/alta-ficha-activos-es.webm',
          en: '03-activos/01-alta-ficha-activos/alta-ficha-activos-en.webm',
        },
      },
      {
        id: '03-02-bom',
        moduleId: 'm03',
        order: 3,
        title: { es: 'Lista de Materiales y Repuestos (BOM)', en: 'Bill of Materials (BOM)' },
        description: {
          es: 'Vinculación de repuestos críticos y consumibles al activo para agilizar reservas en órdenes de trabajo.',
          en: 'Linking critical spare parts and consumables to an asset to streamline work order reservations.',
        },
        duration: '01:35',
        role: 'maintenance',
        prerequisiteIds: ['03-01-alta'],
        videoPath: {
          es: '03-activos/02-bom-materiales/bom-materiales-es.webm',
          en: '03-activos/02-bom-materiales/bom-materiales-en.webm',
        },
      },
      {
        id: '03-03-jerarquia',
        moduleId: 'm03',
        order: 4,
        title: { es: 'Jerarquía de Planta y Sub-activos', en: 'Plant Hierarchy & Sub-assets' },
        description: {
          es: 'Organización padre-hijo de líneas de producción, celdas y componentes dependientes.',
          en: 'Parent-child organization of production lines, work cells, and dependent sub-components.',
        },
        duration: '01:15',
        role: 'maintenance',
        prerequisiteIds: ['03-01-alta'],
        videoPath: {
          es: '03-activos/03-jerarquia-planta/jerarquia-activos-es.webm',
          en: '03-activos/03-jerarquia-planta/jerarquia-activos-en.webm',
        },
      },
      {
        id: '03-04-mapas',
        moduleId: 'm03',
        order: 5,
        title: { es: 'Ubicaciones y Mapas Interactivos', en: 'Locations & Interactive Maps' },
        description: {
          es: 'Geolocalización de activos sobre planos de planta y mapas interactivos.',
          en: 'Geolocation of assets over plant floorplans and interactive maps.',
        },
        duration: '01:55',
        role: 'maintenance',
        videoPath: {
          es: '03-activos/04-ubicaciones-mapas/ubicaciones-mapas-es.webm',
          en: '03-activos/04-ubicaciones-mapas/ubicaciones-mapas-en.webm',
        },
      },
      {
        id: '03-05-bitacora',
        moduleId: 'm03',
        order: 6,
        title: { es: 'Bitácora y Trazabilidad', en: 'Activity Log & Traceability' },
        description: {
          es: 'Consulta cronológica de eventos, cambios de estado, custodias e intervenciones sobre el activo.',
          en: 'Chronological audit of events, state transitions, custody changes, and maintenance interventions.',
        },
        duration: '01:20',
        role: 'maintenance',
        videoPath: {
          es: '03-activos/05-bitacora-trazabilidad/bitacora-trazabilidad-es.webm',
          en: '03-activos/05-bitacora-trazabilidad/bitacora-trazabilidad-en.webm',
        },
      },
      {
        id: '03-06-finanzas',
        moduleId: 'm03',
        order: 7,
        title: { es: 'Finanzas y Depreciación Contable', en: 'Asset Finance & Depreciation' },
        description: {
          es: 'Control de valor de adquisición, depreciación acumulada, valor en libros y ajustes financieros.',
          en: 'Tracking acquisition cost, accumulated depreciation, book value, and financial adjustments.',
        },
        duration: '01:15',
        role: 'admin',
        videoPath: {
          es: '03-activos/06-finanzas-depreciacion/finanzas-activos-es.webm',
          en: '03-activos/06-finanzas-depreciacion/finanzas-activos-en.webm',
        },
      },
    ],
  },
  {
    id: 'm04',
    number: '04',
    title: { es: 'Mantenimiento Integral', en: 'End-to-End Maintenance' },
    subtitle: {
      es: 'Desde plantillas de incidencias hasta planes preventivos cíclicos.',
      en: 'From incident templates through work orders, tasks, and preventive plans.',
    },
    lessons: [
      {
        id: '04-00-plantillas',
        moduleId: 'm04',
        order: 1,
        title: { es: 'Plantillas de Incidencias (Precondición)', en: 'Incident Templates (Prerequisite)' },
        description: {
          es: 'Creación de flujos de incidencias requeridos antes de configurar transiciones automáticas en la máquina de estados.',
          en: 'Creating incident workflow templates required before configuring automatic state machine transitions.',
        },
        duration: '01:25',
        role: 'admin',
        videoPath: {
          es: '04-mantenimiento/00-plantillas-incidencias/plantillas-incidencias-es.webm',
          en: '04-mantenimiento/00-plantillas-incidencias/plantillas-incidencias-en.webm',
        },
      },
      {
        id: '04-01-transicion',
        moduleId: 'm04',
        order: 2,
        title: { es: 'Transición de Estado e Incidencia Automática', en: 'State Transition & Auto-Incident' },
        description: {
          es: 'Cómo el cambio de estado de un activo dispara automáticamente una incidencia usando la plantilla configurada.',
          en: 'How changing an asset state automatically triggers an incident using the configured template.',
        },
        duration: '01:30',
        role: 'maintenance',
        prerequisiteIds: ['04-00-plantillas', '03-estados'],
        videoPath: {
          es: '04-mantenimiento/01-transicion-estado-incidencia/transicion-estado-incidencia-es.webm',
          en: '04-mantenimiento/01-transicion-estado-incidencia/transicion-estado-incidencia-en.webm',
        },
      },
      {
        id: '04-02-incidencias',
        moduleId: 'm04',
        order: 3,
        title: { es: 'Gestión de Incidencias, Triaje y Diagnóstico', en: 'Incident Triage & Diagnostics' },
        description: {
          es: 'Recepción, clasificación de severidad, asignación de responsable y diagnóstico técnico de fallas.',
          en: 'Receiving, severity triage, assignee selection, and technical root-cause diagnostics.',
        },
        duration: '01:20',
        role: 'maintenance',
        videoPath: {
          es: '04-mantenimiento/02-gestion-incidencias/gestion-incidencias-es.webm',
          en: '04-mantenimiento/02-gestion-incidencias/gestion-incidencias-en.webm',
        },
      },
      {
        id: '04-03-ordenes',
        moduleId: 'm04',
        order: 4,
        title: { es: 'Órdenes de Trabajo y Reserva de BOM', en: 'Work Orders & BOM Reservation' },
        description: {
          es: 'Creación de órdenes de trabajo correctivas, programación y reserva de repuestos desde inventario.',
          en: 'Creating corrective work orders, scheduling, and reserving spare parts from inventory.',
        },
        duration: '01:20',
        role: 'maintenance',
        prerequisiteIds: ['04-02-incidencias'],
        videoPath: {
          es: '04-mantenimiento/03-ordenes-trabajo/ordenes-trabajo-es.webm',
          en: '04-mantenimiento/03-ordenes-trabajo/ordenes-trabajo-en.webm',
        },
      },
      {
        id: '04-04-tareas',
        moduleId: 'm04',
        order: 5,
        title: { es: 'Tareas de Ejecución (Kanban y Lista)', en: 'Execution Tasks (Kanban & List)' },
        description: {
          es: 'Ejecución operativa de tareas en campo, cambio de columnas en tablero Kanban y registro de avance.',
          en: 'Field task execution, Kanban board column transitions, and progress logging.',
        },
        duration: '01:15',
        role: 'maintenance',
        prerequisiteIds: ['04-03-ordenes'],
        videoPath: {
          es: '04-mantenimiento/04-tareas-ejecucion/tareas-ejecucion-es.webm',
          en: '04-mantenimiento/04-tareas-ejecucion/tareas-ejecucion-en.webm',
        },
      },
      {
        id: '04-05-preventivos',
        moduleId: 'm04',
        order: 6,
        title: { es: 'Planes Preventivos y Recurrencia Cíclica', en: 'Preventive Plans & Recurrence' },
        description: {
          es: 'Programación de mantenimientos preventivos periódicos para evitar paradas no planificadas.',
          en: 'Scheduling recurring preventive maintenance plans to prevent unplanned downtime.',
        },
        duration: '01:10',
        role: 'maintenance',
        videoPath: {
          es: '04-mantenimiento/05-planes-preventivos/planes-preventivos-es.webm',
          en: '04-mantenimiento/05-planes-preventivos/planes-preventivos-en.webm',
        },
      },
    ],
  },
  {
    id: 'm05',
    number: '05',
    title: { es: 'Inventario y Almacenes', en: 'Inventory & Warehouses' },
    subtitle: {
      es: 'Bodegas operativas, saldos de stock, ajustes y modos de consumo.',
      en: 'Operational warehouses, stock balances, adjustments, and consumption modes.',
    },
    lessons: [
      {
        id: '05-01-almacenes',
        moduleId: 'm05',
        order: 1,
        title: { es: 'Almacenes y Bodegas Operativas', en: 'Warehouses & Storage Locations' },
        description: {
          es: 'Alta y administración de bodegas centrales y almacenes satélites en planta.',
          en: 'Creating and managing central warehouses and satellite plant storage locations.',
        },
        duration: '01:15',
        role: 'inventory',
        videoPath: {
          es: '05-inventario/01-almacenes-bodegas/almacenes-bodegas-es.webm',
          en: '05-inventario/01-almacenes-bodegas/almacenes-bodegas-en.webm',
        },
      },
      {
        id: '05-02-stock',
        moduleId: 'm05',
        order: 2,
        title: { es: 'Saldos de Stock y Ajustes de Inventario', en: 'Stock Balances & Adjustments' },
        description: {
          es: 'Consulta de existencias, valorización promedio y registro de entradas o ajustes manuales.',
          en: 'Checking on-hand quantities, average cost valuation, and posting receipts or adjustments.',
        },
        duration: '01:15',
        role: 'inventory',
        prerequisiteIds: ['05-01-almacenes'],
        videoPath: {
          es: '05-inventario/02-saldos-stock/saldos-stock-es.webm',
          en: '05-inventario/02-saldos-stock/saldos-stock-en.webm',
        },
      },
      {
        id: '05-03-config',
        moduleId: 'm05',
        order: 3,
        title: { es: 'Configuración y Modos de Inventario', en: 'Inventory Modes & Configuration' },
        description: {
          es: 'Selección de modo Interno, Externo o Híbrido y política de control de stock negativo.',
          en: 'Choosing Internal, External, or Hybrid operating modes and negative stock policy.',
        },
        duration: '01:10',
        role: 'admin',
        videoPath: {
          es: '05-inventario/03-configuracion-inventario/configuracion-inventario-es.webm',
          en: '05-inventario/03-configuracion-inventario/configuracion-inventario-en.webm',
        },
      },
    ],
  },
  {
    id: 'm06',
    number: '06',
    title: { es: 'Personal y Cuadrillas', en: 'Staff & Work Crews' },
    subtitle: {
      es: 'Directorio de técnicos, puestos operativos y conformación de brigadas.',
      en: 'Technician directory, job titles, and operational maintenance crews.',
    },
    lessons: [
      {
        id: '06-01-empleados',
        moduleId: 'm06',
        order: 1,
        title: { es: 'Empleados y Puestos de Mantenimiento', en: 'Employees & Job Titles' },
        description: {
          es: 'Registro de personal técnico, asignación de puesto de catálogo y generación de acceso al sistema.',
          en: 'Registering technicians, assigning catalog job titles, and provisioning system login access.',
        },
        duration: '01:20',
        role: 'admin',
        videoPath: {
          es: '06-personal/01-empleados-puestos/empleados-puestos-es.webm',
          en: '06-personal/01-empleados-puestos/empleados-puestos-en.webm',
        },
      },
      {
        id: '06-02-equipos',
        moduleId: 'm06',
        order: 2,
        title: { es: 'Equipos y Cuadrillas de Trabajo', en: 'Teams & Work Crews' },
        description: {
          es: 'Creación de cuadrillas multidisciplinarias, selección de miembros y designación de líder de equipo.',
          en: 'Building multidisciplinary crews, selecting members, and designating a team lead.',
        },
        duration: '01:15',
        role: 'maintenance',
        prerequisiteIds: ['06-01-empleados'],
        videoPath: {
          es: '06-personal/02-equipos-cuadrillas/equipos-cuadrillas-es.webm',
          en: '06-personal/02-equipos-cuadrillas/equipos-cuadrillas-en.webm',
        },
      },
    ],
  },
  {
    id: 'm07',
    number: '07',
    title: { es: 'Plantillas de Comunicación', en: 'Communication Templates' },
    subtitle: {
      es: 'Correos automáticos y documentos imprimibles con variables dinámicas.',
      en: 'Automated emails and printable documents with dynamic placeholders.',
    },
    lessons: [
      {
        id: '07-01-plantillas',
        moduleId: 'm07',
        order: 1,
        title: { es: 'Gestión de Plantillas y Previsualización', en: 'Template Management & Preview' },
        description: {
          es: 'Diseño bilingüe de notificaciones y reportes con variables dinámicas, historial de versiones y vista previa.',
          en: 'Bilingual notification and report design with dynamic variables, version history, and live preview.',
        },
        duration: '01:15',
        role: 'admin',
        videoPath: {
          es: '07-plantillas-comunicacion/01-gestion-plantillas/plantillas-comunicacion-es.webm',
          en: '07-plantillas-comunicacion/01-gestion-plantillas/plantillas-comunicacion-en.webm',
        },
      },
    ],
  },
  {
    id: 'm08',
    number: '08',
    title: { es: 'Configuración Corporativa y Seguridad', en: 'Corporate Settings & Security' },
    subtitle: {
      es: 'Branding del tenant, matriz RBAC, invitaciones de usuarios y seguridad MFA.',
      en: 'Tenant branding, RBAC matrix, user invitations, and MFA account security.',
    },
    lessons: [
      {
        id: '08-01-tenant',
        moduleId: 'm08',
        order: 1,
        title: { es: 'Parámetros del Tenant y Notificaciones', en: 'Tenant Branding & Notifications' },
        description: {
          es: 'Configuración de identidad corporativa, correo de soporte y mapeo de eventos del sistema a plantillas.',
          en: 'Configuring corporate branding, support email, and mapping system events to templates.',
        },
        duration: '01:00',
        role: 'admin',
        videoPath: {
          es: '08-configuracion-corporativa/01-parametros-tenant/parametros-tenant-es.webm',
          en: '08-configuracion-corporativa/01-parametros-tenant/parametros-tenant-en.webm',
        },
      },
      {
        id: '08-02-roles',
        moduleId: 'm08',
        order: 2,
        title: { es: 'Roles y Permisos Granulares (RBAC)', en: 'Roles & Granular Permissions (RBAC)' },
        description: {
          es: 'Creación de roles personalizados y activación granular de permisos por módulo funcional.',
          en: 'Creating custom security roles and toggling granular permissions per functional module.',
        },
        duration: '01:15',
        role: 'admin',
        videoPath: {
          es: '08-configuracion-corporativa/02-roles-permisos/roles-permisos-es.webm',
          en: '08-configuracion-corporativa/02-roles-permisos/roles-permisos-en.webm',
        },
      },
      {
        id: '08-03-usuarios',
        moduleId: 'm08',
        order: 3,
        title: { es: 'Gestión de Usuarios e Invitaciones', en: 'User Accounts & Invitations' },
        description: {
          es: 'Invitación segura por correo electrónico, asignación de roles y seguimiento de invitaciones pendientes.',
          en: 'Secure email invitations, role assignment, and tracking of pending onboarding links.',
        },
        duration: '01:05',
        role: 'admin',
        prerequisiteIds: ['08-02-roles'],
        videoPath: {
          es: '08-configuracion-corporativa/03-gestion-usuarios/gestion-usuarios-es.webm',
          en: '08-configuracion-corporativa/03-gestion-usuarios/gestion-usuarios-en.webm',
        },
      },
      {
        id: '08-04-cuenta',
        moduleId: 'm08',
        order: 4,
        title: { es: 'Cuenta de Usuario, Seguridad y MFA', en: 'User Account, Security & MFA' },
        description: {
          es: 'Actualización de perfil, cambio de contraseña y protección con autenticación multifactor (MFA/2FA).',
          en: 'Profile updates, password management, and multi-factor authentication (MFA/2FA) protection.',
        },
        duration: '01:00',
        role: 'admin',
        videoPath: {
          es: '08-configuracion-corporativa/04-cuenta-seguridad-mfa/cuenta-seguridad-mfa-es.webm',
          en: '08-configuracion-corporativa/04-cuenta-seguridad-mfa/cuenta-seguridad-mfa-en.webm',
        },
      },
    ],
  },
  {
    id: 'm09',
    number: '09',
    title: { es: 'Dashboard Analítico y KPIs', en: 'Analytics Dashboard & KPIs' },
    subtitle: {
      es: 'Confiabilidad MTBF/MTTR, desglose de TCO y ranking de activos críticos.',
      en: 'MTBF/MTTR reliability metrics, TCO breakdown, and critical asset ranking.',
    },
    lessons: [
      {
        id: '09-01-kpis',
        moduleId: 'm09',
        order: 1,
        title: { es: 'KPIs de Confiabilidad y TCO', en: 'Reliability KPIs & TCO' },
        description: {
          es: 'Interpretación de métricas MTBF, MTTR, costos totales de propiedad (TCO) y ranking de criticidad.',
          en: 'Interpreting MTBF, MTTR, Total Cost of Ownership (TCO), and asset reliability rankings.',
        },
        duration: '00:50',
        role: 'analytics',
        videoPath: {
          es: '09-dashboard-analitico/01-kpis-confiabilidad-tco/dashboard-kpis-confiabilidad-es.webm',
          en: '09-dashboard-analitico/01-kpis-confiabilidad-tco/dashboard-kpis-confiabilidad-en.webm',
        },
      },
    ],
  },
]

export const ALL_LESSONS: Lesson[] = LEARNING_MODULES.flatMap((m) => m.lessons)

