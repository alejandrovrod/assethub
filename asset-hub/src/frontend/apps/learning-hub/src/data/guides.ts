import type { LocalizedText } from './catalog'

export interface GuideStep {
  number: number
  title: LocalizedText
  description: LocalizedText
  tip?: LocalizedText
}

export interface LessonGuide {
  lessonId: string
  overview: LocalizedText
  keyTakeaways: {
    es: string[]
    en: string[]
  }
  steps: GuideStep[]
}

export const LESSON_GUIDES: Record<string, LessonGuide> = {
  // Módulo 01: Onboarding Empresarial
  '01-registro': {
    lessonId: '01-registro',
    overview: {
      es: 'Aprende a registrar una nueva empresa en Asset Hub, seleccionar el plan corporativo, validar la disponibilidad del slug (subdominio) y configurar el primer usuario administrador.',
      en: 'Learn how to register a new organization in Asset Hub, select a corporate tier, validate slug availability, and configure the initial workspace administrator.',
    },
    keyTakeaways: {
      es: [
        'Validación en tiempo real de slugs corporativos para evitar duplicados',
        'Aislamiento multi-tenant automático por subdominio',
        'Configuración inicial de zona horaria y moneda base',
      ],
      en: [
        'Real-time corporate slug availability verification',
        'Automatic multi-tenant isolation per organization subdomain',
        'Initial baseline setup for primary timezone and base currency',
      ],
    },
    steps: [
      {
        number: 1,
        title: {
          es: 'Acceder a la pantalla de Registro Corporativo',
          en: 'Navigate to the Corporate Registration Screen',
        },
        description: {
          es: 'Desde la página principal de Asset Hub, haz clic en "Comenzar Gratis" o dirígete a /signup.',
          en: 'From the main Asset Hub landing page, click "Start Free" or navigate directly to /signup.',
        },
        tip: {
          es: 'Puedes cambiar el idioma de la interfaz en cualquier momento desde el selector en la esquina superior.',
          en: 'You can switch interface language at any time using the selector at the top-right corner.',
        },
      },
      {
        number: 2,
        title: {
          es: 'Ingresar los Datos de la Organización y Validar el Slug',
          en: 'Enter Organization Details and Validate Slug',
        },
        description: {
          es: 'Escribe el nombre legal de tu empresa. El sistema autogenerará una sugerencia de subdominio. Si el slug está ocupado, prueba con una variante única.',
          en: 'Type your legal business name. The platform will automatically propose a slug. If taken, enter a unique business prefix.',
        },
        tip: {
          es: 'El slug será la dirección de acceso de tu equipo (ej: tuempresa.assethub.app).',
          en: 'The slug will become your team custom access URL (e.g. yourcompany.assethub.app).',
        },
      },
      {
        number: 3,
        title: {
          es: 'Crear la Cuenta del Administrador Maestro',
          en: 'Create Master Administrator Credentials',
        },
        description: {
          es: 'Ingresa nombre completo, correo corporativo y contraseña segura (mínimo 8 caracteres, alfanumérico y símbolos).',
          en: 'Enter full name, work email, and a secure password (minimum 8 characters with letters, numbers, and symbols).',
        },
      },
      {
        number: 4,
        title: {
          es: 'Completar el Asistente y Acceder al Workspace',
          en: 'Complete Onboarding & Enter Workspace',
        },
        description: {
          es: 'Al hacer clic en "Crear Empresa", serás redirigido automáticamente a tu Dashboard con los datos iniciales listos para operar.',
          en: 'Click "Create Organization" to be automatically redirected to your initialized Dashboard.',
        },
      },
    ],
  },

  // Módulo 02: Catálogos y Esquemas Dinámicos
  '02-catalogos': {
    lessonId: '02-catalogos',
    overview: {
      es: 'Descubre cómo parametrizar catálogos maestros de fabricantes, criticidades y categorías de activos para estructurar el inventario.',
      en: 'Discover how to configure master catalogs for manufacturers, criticalities, and asset categories to standardize your inventory.',
    },
    keyTakeaways: {
      es: [
        'Estandarización de nomenclaturas para evitar datos inconsistentes',
        'Categorías jerárquicas vinculables a plantillas técnicas',
        'Exportación e importación masiva de tablas maestras',
      ],
      en: [
        'Standardization of master records to avoid inconsistent naming',
        'Hierarchical categories linked to technical templates',
        'Bulk import and export of master tables',
      ],
    },
    steps: [
      {
        number: 1,
        title: {
          es: 'Abrir el Módulo de Catálogos',
          en: 'Open the Catalogs Module',
        },
        description: {
          es: 'En el menú lateral principal, selecciona "Catálogos" bajo el grupo Sistema.',
          en: 'In the main sidebar navigation, select "Catalogs" under the System group.',
        },
      },
      {
        number: 2,
        title: {
          es: 'Crear Fabricantes y Marcas',
          en: 'Create Manufacturers & Brands',
        },
        description: {
          es: 'Haz clic en "Nuevo Fabricante", especifica el nombre oficial, país de origen y datos de soporte del proveedor.',
          en: 'Click "New Manufacturer", enter the official brand name, country of origin, and vendor support details.',
        },
      },
      {
        number: 3,
        title: {
          es: 'Configurar Niveles de Criticidad',
          en: 'Configure Criticality Levels',
        },
        description: {
          es: 'Define niveles de impacto operacional (Alta, Media, Baja) asignando colores distintivos y tiempos máximos de respuesta (SLA).',
          en: 'Define operational impact tiers (High, Medium, Low) assigning status colors and response SLA targets.',
        },
      },
    ],
  },

  '02-esquemas': {
    lessonId: '02-esquemas',
    overview: {
      es: 'Diseña fichas técnicas a medida usando JSON Schema dinámico: agrega campos personalizados, pestañas operativas y validaciones sin tocar código.',
      en: 'Design custom asset datasheets using dynamic JSON Schema: add custom properties, tabs, and validation rules without coding.',
    },
    keyTakeaways: {
      es: [
        'Diseñador visual de formularios sin código',
        'Agrupación por pestañas y secciones personalizadas',
        'Validación estricta de tipos de datos (números, fechas, dropdowns)',
      ],
      en: [
        'No-code visual form and datasheet designer',
        'Tabbed organization and custom collapsible sections',
        'Strict schema validation for numbers, dates, and dropdown lists',
      ],
    },
    steps: [
      {
        number: 1,
        title: {
          es: 'Seleccionar o Crear Plantilla de Activo',
          en: 'Select or Create an Asset Template',
        },
        description: {
          es: 'Ve a Activos > Plantillas y haz clic en "Nueva Plantilla" o edita una existente (ej: Bombas Centrífugas o Servidores).',
          en: 'Navigate to Assets > Templates and click "New Template" or edit an existing one (e.g. Centrifugal Pumps or Rack Servers).',
        },
      },
      {
        number: 2,
        title: {
          es: 'Agregar Pestañas y Secciones',
          en: 'Add Tabs and Visual Sections',
        },
        description: {
          es: 'Organiza la información creando tabs temáticos como "Datos Eléctricos", "Garantía" y "Mantenimiento".',
          en: 'Organize data by creating functional tabs like "Electrical Specs", "Warranty", and "Maintenance".',
        },
      },
      {
        number: 3,
        title: {
          es: 'Definir Atributos Técnicos Dinámicos',
          en: 'Define Dynamic Technical Attributes',
        },
        description: {
          es: 'Arrastra nuevos campos indicando su tipo (texto, número, booleano, enum) y si son obligatorios para el técnico.',
          en: 'Add new attributes specifying their data type (text, number, boolean, enum) and whether they are required.',
        },
      },
    ],
  },

  // Módulo 03: Gestión de Activos y Ciclo de Vida
  '03-estados': {
    lessonId: '03-estados',
    overview: {
      es: 'Aprende a configurar máquinas de estados finitos que gobiernan las transiciones operativas de los activos (Operativo, En Falla, En Reparación, En Desuso).',
      en: 'Learn how to configure finite state machines that control asset operational transitions (Operational, Failed, Under Repair, Retired).',
    },
    keyTakeaways: {
      es: [
        'Transiciones con permisos estrictos por rol',
        'Validación de precondiciones antes de cambiar de estado',
        'Historial inmutable con auditoría de cambios',
      ],
      en: [
        'Role-gated state transitions with strict permissions',
        'Precondition validation before state updates',
        'Immutable audit trail recording who, when, and why',
      ],
    },
    steps: [
      {
        number: 1,
        title: {
          es: 'Abrir el Editor de Ciclo de Vida',
          en: 'Open Lifecycle Canvas Editor',
        },
        description: {
          es: 'Dentro de la configuración de plantillas, haz clic en la pestaña "Máquina de Estados".',
          en: 'Within template configuration, click on the "State Machine" tab.',
        },
      },
      {
        number: 2,
        title: {
          es: 'Definir Estados y Transiciones Permitidas',
          en: 'Define States and Allowed Transitions',
        },
        description: {
          es: 'Conecta los nodos para definir qué transiciones son válidas (ej: de "En Falla" únicamente a "En Reparación").',
          en: 'Connect nodes to define allowed flows (e.g. from "Fault" only towards "Under Repair").',
        },
      },
    ],
  },

  '03-01-alta': {
    lessonId: '03-01-alta',
    overview: {
      es: 'Crea un activo físico en el sistema utilizando la plantilla técnica, asignando tag corporativo, número de serie y ubicación.',
      en: 'Create a physical asset record using technical templates, assigning corporate tags, serial numbers, and locations.',
    },
    keyTakeaways: {
      es: [
        'Generación automática de códigos QR / Barcode',
        'Relleno estructurado de especificaciones dinámicas',
        'Asignación inmediata a responsable y centro de costo',
      ],
      en: [
        'Automatic QR / Barcode generation per asset',
        'Structured entry of dynamic technical properties',
        'Immediate assignment to custodian and cost center',
      ],
    },
    steps: [
      {
        number: 1,
        title: {
          es: 'Hacer clic en "Nuevo Activo"',
          en: 'Click "New Asset"',
        },
        description: {
          es: 'Ve a la lista de Activos y presiona el botón principal "+ Nuevo Activo".',
          en: 'Navigate to Assets list and press the primary "+ New Asset" button.',
        },
      },
      {
        number: 2,
        title: {
          es: 'Seleccionar la Plantilla Base',
          en: 'Select the Base Template',
        },
        description: {
          es: 'Elige la plantilla que corresponda al equipo para cargar automáticamente sus atributos técnicos.',
          en: 'Pick the corresponding equipment template to automatically render its required dynamic fields.',
        },
      },
      {
        number: 3,
        title: {
          es: 'Guardar y Generar Ficha Técnica',
          en: 'Save and Generate Technical Datasheet',
        },
        description: {
          es: 'Guarda los datos para obtener el identificador único y el código QR listo para imprimir.',
          en: 'Save the record to obtain the unique asset ID and print-ready QR tag.',
        },
      },
    ],
  },

  '03-02-bom': {
    lessonId: '03-02-bom',
    overview: {
      es: 'Gestiona la lista de materiales (BOM) y repuestos asociados a cada activo para agilizar mantenimientos y pedidos de almacén.',
      en: 'Manage Bill of Materials (BOM) and spare parts linked to each asset to accelerate maintenance and store replenishment.',
    },
    keyTakeaways: {
      es: ['Despiece de repuestos por activo', 'Enlace directo con el catálogo de stock', 'Estimación de costos de reposición'],
      en: ['Spare parts breakdown per asset', 'Direct link to inventory store catalog', 'Replacement cost estimation'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Abrir la Pestaña BOM', en: 'Open BOM Tab' },
        description: {
          es: 'En el detalle del activo, haz clic en la pestaña "Lista de Materiales (BOM)".',
          en: 'In the asset detail view, select the "Bill of Materials (BOM)" tab.',
        },
      },
      {
        number: 2,
        title: { es: 'Vincular Componentes y Repuestos', en: 'Link Components & Spare Parts' },
        description: {
          es: 'Agrega repuestos compatibles especificando cantidad necesaria y números de pieza.',
          en: 'Add compatible spare items specifying required quantity and manufacturer part numbers.',
        },
      },
    ],
  },

  '03-03-jerarquia': {
    lessonId: '03-03-jerarquia',
    overview: {
      es: 'Construye la jerarquía espacial y operativa de activos (Planta > Línea de Producción > Máquina > Componente).',
      en: 'Build the spatial and operational asset hierarchy (Plant > Production Line > Machine > Subcomponent).',
    },
    keyTakeaways: {
      es: ['Árbol visual interactivo', 'Propagación de estados de falla en cascada', 'Navegación contextual rápida'],
      en: ['Interactive visual asset tree', 'Cascading fault status propagation', 'Fast contextual navigation'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Acceder a la Vista de Jerarquía', en: 'Access Hierarchy Tree View' },
        description: {
          es: 'Desde el listado de activos, conmuta a la vista de "Árbol Jerárquico".',
          en: 'From the asset list, toggle the "Hierarchical Tree" view.',
        },
      },
      {
        number: 2,
        title: { es: 'Arrastrar y Asignar Activos Padre e Hijos', en: 'Assign Parent & Child Assets' },
        description: {
          es: 'Organiza componentes secundarios dentro del activo principal correspondiente.',
          en: 'Nest subcomponents inside their respective parent machine.',
        },
      },
    ],
  },

  '03-04-mapas': {
    lessonId: '03-04-mapas',
    overview: {
      es: 'Localiza activos en mapas interactivos y planos de planta mediante coordenadas geográficas o polígonos.',
      en: 'Locate assets across interactive maps and floorplans using GPS coordinates or boundary polygons.',
    },
    keyTakeaways: {
      es: ['Georreferenciación Leaflet/OpenStreetMap', 'Pins coloreados por estado operacional', 'Filtros por zona geográfica'],
      en: ['Leaflet/OpenStreetMap geospatial mapping', 'Color-coded pins by operational state', 'Geographic zone filters'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Abrir el Mapa de Operaciones', en: 'Open Operations Map' },
        description: {
          es: 'Selecciona la pestaña "Mapa" en la ficha del activo o en la vista global.',
          en: 'Select the "Map" tab on the asset sheet or from the global fleet view.',
        },
      },
      {
        number: 2,
        title: { es: 'Fijar Coordenadas o Polígono', en: 'Set Coordinates or Polygon' },
        description: {
          es: 'Haz clic en el mapa para posicionar el marcador exacto o dibuja el perímetro del activo.',
          en: 'Click on the map to place the pin or draw the asset operational boundary.',
        },
      },
    ],
  },

  '03-05-bitacora': {
    lessonId: '03-05-bitacora',
    overview: {
      es: 'Audita la línea de tiempo histórica del activo: cambios de estado, reparaciones, calibraciones y responsables.',
      en: 'Audit the historical asset timeline: status transitions, repairs, calibrations, and custodians.',
    },
    keyTakeaways: {
      es: ['Registro inmutable de eventos', 'Filtros cronológicos por tipo de suceso', 'Evidencia fotográfica adjunta'],
      en: ['Immutable event audit trail', 'Chronological filters by event type', 'Attached photo evidence'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Consultar la Bitácora Histórica', en: 'Review Historical Timeline' },
        description: {
          es: 'En la ficha del activo, haz clic en "Bitácora" para revisar cada evento cronológico.',
          en: 'In the asset datasheet, click "Timeline/Audit" to inspect all chronological records.',
        },
      },
    ],
  },

  '03-06-finanzas': {
    lessonId: '03-06-finanzas',
    overview: {
      es: 'Controla el costo de adquisición, depreciación contable acumulada y valor residual de cada equipo.',
      en: 'Track acquisition costs, accumulated financial depreciation, and residual equipment valuation.',
    },
    keyTakeaways: {
      es: ['Cálculo de depreciación lineal', 'Costo total de propiedad (TCO)', 'Proyección de fin de vida útil'],
      en: ['Straight-line depreciation calculation', 'Total Cost of Ownership (TCO)', 'End-of-life replacement projection'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Ingresar Datos Financieros', en: 'Enter Financial Details' },
        description: {
          es: 'Especifica costo de compra, fecha de puesta en servicio y vida útil estimada en meses.',
          en: 'Provide purchase price, commissioning date, and useful lifetime in months.',
        },
      },
    ],
  },

  // Módulo 04: Mantenimiento e Incidencias
  '04-00-plantillas': {
    lessonId: '04-00-plantillas',
    overview: {
      es: 'Crea plantillas estandarizadas para tipos comunes de fallas e incidencias de mantenimiento.',
      en: 'Create standardized templates for recurring maintenance fault classifications.',
    },
    keyTakeaways: {
      es: ['Clasificación uniforme de averías', 'Prioridades predeterminadas', 'Checklists de diagnóstico sugeridos'],
      en: ['Uniform fault taxonomy', 'Predefined priority levels', 'Suggested diagnostic checklists'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Crear Plantilla de Incidencia', en: 'Create Incident Template' },
        description: {
          es: 'Ve a Mantenimiento > Plantillas y añade categorías de fallas con sus protocolos.',
          en: 'Navigate to Maintenance > Workflow Templates and configure fault categories.',
        },
      },
    ],
  },

  '04-01-transicion': {
    lessonId: '04-01-transicion',
    overview: {
      es: 'Flujo de vida de una incidencia: desde el reporte en terreno hasta el cierre validado por supervisión.',
      en: 'Lifecycle of an incident: from initial field reporting through supervisor sign-off.',
    },
    keyTakeaways: {
      es: ['Estados: Abierta, En Diagnóstico, En Reparación, Resuelta', 'Asignación automática a cuadrillas'],
      en: ['States: Open, In Triage, In Repair, Resolved', 'Automatic workgroup dispatch'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Transicionar la Incidencia', en: 'Transition Incident Status' },
        description: {
          es: 'Abre la incidencia y presiona el botón de acción para avanzar al siguiente estado operativo.',
          en: 'Open the incident record and click the action button to advance to the next workflow state.',
        },
      },
    ],
  },

  '04-02-incidencias': {
    lessonId: '04-02-incidencias',
    overview: {
      es: 'Gestión y tablero central de incidencias operacionales reportadas por operadores y técnicos.',
      en: 'Central operational incident board reported by field technicians and machine operators.',
    },
    keyTakeaways: {
      es: ['Vista Kanban y tabla filtrable', 'SLA de respuesta por criticidad', 'Adjuntos fotográficos de averías'],
      en: ['Kanban board & tabular views', 'SLA timers by criticality', 'Attached fault photo evidence'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Priorizar y Asignar Averías', en: 'Triage & Assign Incidents' },
        description: {
          es: 'Filtra por severidad y asigna al especialista o cuadrilla técnica de turno.',
          en: 'Filter by severity and assign to the duty maintenance specialist or team.',
        },
      },
    ],
  },

  '04-03-ordenes': {
    lessonId: '04-03-ordenes',
    overview: {
      es: 'Generación, despacho y seguimiento de Órdenes de Trabajo (OT) correctivas y preventivas.',
      en: 'Generation, dispatch, and tracking of corrective and preventive Work Orders (WO).',
    },
    keyTakeaways: {
      es: ['Planificación de fechas y cuadrilla', 'Imputación de repuestos y horas-hombre', 'Firma digital de conformidad'],
      en: ['Schedule dates and work crew', 'Spare parts & labor hour logging', 'Digital customer sign-off'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Generar Orden de Trabajo', en: 'Create Work Order' },
        description: {
          es: 'Convierte una incidencia validada en una Orden de Trabajo oficial con tareas asignadas.',
          en: 'Convert an approved incident into an official Work Order with scheduled tasks.',
        },
      },
    ],
  },

  '04-04-tareas': {
    lessonId: '04-04-tareas',
    overview: {
      es: 'Ejecución técnica paso a paso: checklists interactivos, mediciones de parámetros y firmas en terreno.',
      en: 'Step-by-step task execution: interactive checklists, parameter readings, and field sign-offs.',
    },
    keyTakeaways: {
      es: ['Checklists obligatorios con validación', 'Registro de mediciones (presión, temperatura)', 'Modo sin conexión en PWA'],
      en: ['Required checklist verification', 'Parameter logging (pressure, temp)', 'Full offline support on PWA'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Completar Tareas en Terreno', en: 'Complete Field Tasks' },
        description: {
          es: 'El técnico tilda cada item completado y registra lecturas de instrumentos en su móvil.',
          en: 'The technician checks off each item and enters instrument measurements on mobile.',
        },
      },
    ],
  },

  '04-05-preventivos': {
    lessonId: '04-05-preventivos',
    overview: {
      es: 'Automatización de planes preventivos por calendario (mensual, anual) o por métrica de uso (horas de motor, km).',
      en: 'Automation of preventive plans by calendar schedule (monthly, annual) or meter usage (running hours, km).',
    },
    keyTakeaways: {
      es: ['Disparadores automáticos de órdenes', 'Reducción proactiva de paradas no programadas', 'Estimación de carga laboral'],
      en: ['Automatic order generation triggers', 'Proactive reduction of unplanned downtime', 'Workload capacity forecast'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Programar Plan Preventivo', en: 'Schedule Preventive Plan' },
        description: {
          es: 'Configura la frecuencia de servicio y plantilla de tareas para que el sistema cree las OT periódicas.',
          en: 'Configure maintenance interval and task templates to automatically spawn recurring WOs.',
        },
      },
    ],
  },

  // Módulo 05: Inventario y Repuestos
  '05-01-almacenes': {
    lessonId: '05-01-almacenes',
    overview: {
      es: 'Alta y administración de bodegas, pañoles técnicos y ubicaciones físicas de estantería.',
      en: 'Creation and management of warehouses, technician vans, and shelf bin locations.',
    },
    keyTakeaways: {
      es: ['Múltiples almacenes físicos y móviles', 'Estructura Almacén > Pasillo > Estante > Gaveta'],
      en: ['Multiple physical and mobile warehouses', 'Warehouse > Aisle > Shelf > Bin structure'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Crear Nuevo Almacén', en: 'Create New Warehouse' },
        description: {
          es: 'Define el almacén indicando su dirección física, responsable de custodia y tipo.',
          en: 'Define the warehouse entering physical address, custodian in charge, and warehouse type.',
        },
      },
    ],
  },

  '05-02-stock': {
    lessonId: '05-02-stock',
    overview: {
      es: 'Control de saldos de stock, movimientos de entrada/salida y transferencias entre bodegas.',
      en: 'Inventory balances, stock receipts, issues, and transfers across multiple warehouses.',
    },
    keyTakeaways: {
      es: ['Stock disponible vs reservado para OT', 'Alertas automáticas de punto de reorden', 'Trazabilidad por lote y serie'],
      en: ['Available vs WO-reserved stock', 'Automatic reorder threshold alerts', 'Lot and serial number tracking'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Registrar Movimiento de Inventario', en: 'Log Stock Movement' },
        description: {
          es: 'Ingresa un nuevo movimiento especificando repuesto, cantidad, almacén origen y destino.',
          en: 'Enter a stock transaction specifying item, quantity, source, and destination warehouse.',
        },
      },
    ],
  },

  '05-03-config': {
    lessonId: '05-03-config',
    overview: {
      es: 'Configuración general de políticas de inventario, valoración (FIFO / Costo Promedio Ponderado) y unidades de medida.',
      en: 'General inventory policy setup, valuation methods (FIFO / Weighted Average), and units of measure.',
    },
    keyTakeaways: {
      es: ['Métodos de costeo contable', 'Unidades de medida estandarizadas', 'Políticas de control de mermas'],
      en: ['Accounting costing methods', 'Standardized units of measurement', 'Shrinkage & loss policies'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Ajustar Políticas de Inventario', en: 'Adjust Inventory Policies' },
        description: {
          es: 'Ve a Inventario > Configuración y define los parámetros contables y operativos.',
          en: 'Navigate to Inventory > Settings and configure operational and financial defaults.',
        },
      },
    ],
  },

  // Módulo 06: Personal y Cuadrillas
  '06-01-empleados': {
    lessonId: '06-01-empleados',
    overview: {
      es: 'Gestión de ficha de técnicos, especialistas, certificaciones de seguridad y tarifas horarias.',
      en: 'Technician profiles, certifications, security clearances, and standard hourly cost rates.',
    },
    keyTakeaways: {
      es: ['Control de vencimiento de certificaciones', 'Tarifas horarias para costeo de OT', 'Datos de contacto para emergencias'],
      en: ['Certification expiry tracking', 'Hourly labor rates for WO costing', 'Emergency contact information'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Dar de Alta Empleado Técnico', en: 'Register Technical Employee' },
        description: {
          es: 'Ingresa los datos personales, especialidad técnica (mecánica, eléctrica) y costo por hora.',
          en: 'Enter personal details, technical discipline (mechanical, electrical), and hourly rate.',
        },
      },
    ],
  },

  '06-02-equipos': {
    lessonId: '06-02-equipos',
    overview: {
      es: 'Organización de cuadrillas operativas y asignación de líderes de equipo para despacho de trabajos.',
      en: 'Organization of work crews and appointment of crew leads for work dispatch.',
    },
    keyTakeaways: {
      es: ['Cuadrillas multidisciplinarias', 'Asignación masiva de órdenes', 'Disponibilidad de turnos'],
      en: ['Multi-disciplinary crews', 'Bulk order dispatch', 'Shift calendar availability'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Crear Cuadrilla de Mantenimiento', en: 'Create Maintenance Crew' },
        description: {
          es: 'Agrupa técnicos por especialidad y asigna un supervisor responsable.',
          en: 'Group technicians by expertise and assign a lead supervisor.',
        },
      },
    ],
  },

  // Módulo 07: Plantillas de Comunicación
  '07-01-plantillas': {
    lessonId: '07-01-plantillas',
    overview: {
      es: 'Diseño y automatización de notificaciones por email para alertas de incidencias y cambios de estado.',
      en: 'Design and automation of email notifications for incident alerts and workflow status changes.',
    },
    keyTakeaways: {
      es: ['Variables dinámicas (ej: {{asset_name}})', 'Disparadores automáticos por evento', 'Editor visual enriquecido'],
      en: ['Dynamic variables (e.g. {{asset_name}})', 'Event-driven automated triggers', 'Rich visual template editor'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Personalizar Mensaje de Notificación', en: 'Customize Notification Template' },
        description: {
          es: 'Inserta etiquetas dinámicas para que los correos muestren automáticamente los datos del activo e incidencia.',
          en: 'Insert dynamic tokens so notification emails include asset tags and incident severity.',
        },
      },
    ],
  },

  // Módulo 08: Configuración Corporativa y Seguridad
  '08-01-tenant': {
    lessonId: '08-01-tenant',
    overview: {
      es: 'Ajustes globales del tenant: logo de la empresa, colores corporativos, moneda y zona horaria.',
      en: 'Global tenant configuration: company logo branding, corporate colors, currency, and timezone.',
    },
    keyTakeaways: {
      es: ['Personalización de marca', 'Configuración regional', 'Parámetros fiscales de la empresa'],
      en: ['White-label brand customization', 'Regional localization setup', 'Corporate tax parameters'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Personalizar Identidad Corporativa', en: 'Customize Corporate Identity' },
        description: {
          es: 'Carga el logo de tu empresa y define el nombre formal que aparecerá en reportes impresos.',
          en: 'Upload your company logo and set the legal name displayed on printed reports.',
        },
      },
    ],
  },

  '08-02-roles': {
    lessonId: '08-02-roles',
    overview: {
      es: 'Control de acceso basado en roles (RBAC): permisos granulares de lectura, creación, edición y borrado.',
      en: 'Role-Based Access Control (RBAC): fine-grained read, write, update, and delete permissions.',
    },
    keyTakeaways: {
      es: ['Matriz de permisos por módulo', 'Separación de funciones (técnicos vs auditores)', 'Seguridad empresarial'],
      en: ['Per-module permission matrix', 'Segregation of duties (technicians vs auditors)', 'Enterprise security'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Configurar Matriz de Permisos', en: 'Configure Permission Matrix' },
        description: {
          es: 'Tilda los privilegios exactos que tendrá cada perfil (ej: solo ver inventario o gestionar usuarios).',
          en: 'Toggle exact privileges assigned to each role (e.g. read-only inventory vs user management).',
        },
      },
    ],
  },

  '08-03-usuarios': {
    lessonId: '08-03-usuarios',
    overview: {
      es: 'Invitación, activación y gestión de usuarios del sistema con asignación de roles y estados de cuenta.',
      en: 'Invitation, provisioning, and administration of system users with role assignment and status control.',
    },
    keyTakeaways: {
      es: ['Invitaciones por correo electrónico', 'Bloqueo temporal de cuentas', 'Historial de sesiones activas'],
      en: ['Email invitation onboarding', 'Account lock / unlock triggers', 'Active session logs'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Invitar Nuevo Usuario', en: 'Invite New User' },
        description: {
          es: 'Ingresa el correo del colaborador y selecciona su rol para enviarle su link de bienvenida.',
          en: 'Enter the team member email and select their role to send their secure welcome link.',
        },
      },
    ],
  },

  '08-04-cuenta': {
    lessonId: '08-04-cuenta',
    overview: {
      es: 'Seguridad personal del usuario: cambio de contraseña y autenticación de dos factores (MFA).',
      en: 'Personal user account security: password updates and Multi-Factor Authentication (MFA).',
    },
    keyTakeaways: {
      es: ['Autenticación con TOTP (Google Authenticator)', 'Códigos de recuperación de emergencia', 'Sesiones seguras'],
      en: ['TOTP 2FA authenticator app pairing', 'Emergency recovery codes', 'Secure session revocation'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Activar Autenticación 2FA', en: 'Enable 2FA Multi-Factor Authentication' },
        description: {
          es: 'Escanea el código QR desde tu app autenticadora y confirma con el código de 6 dígitos.',
          en: 'Scan the QR code from your authenticator app and verify with the 6-digit code.',
        },
      },
    ],
  },

  // Módulo 09: Dashboard y Analítica
  '09-01-kpis': {
    lessonId: '09-01-kpis',
    overview: {
      es: 'Monitoreo de KPIs de confiabilidad operacional: MTBF (Tiempo Medio Entre Fallas), MTTR (Tiempo Medio de Reparación) y Disponibilidad.',
      en: 'Operational reliability KPI monitoring: MTBF (Mean Time Between Failures), MTTR (Mean Time to Repair), and Availability.',
    },
    keyTakeaways: {
      es: ['Métricas de confiabilidad industrial', 'Gráficos de tendencia de costos', 'Filtro por criticidad y período'],
      en: ['Industrial reliability benchmarks', 'Cost trend analytics charts', 'Criticality and date range filters'],
    },
    steps: [
      {
        number: 1,
        title: { es: 'Analizar Indicadores de Confiabilidad', en: 'Analyze Reliability Indicators' },
        description: {
          es: 'Revisa el MTBF para medir la estabilidad de tus activos y el MTTR para evaluar la velocidad de respuesta.',
          en: 'Examine MTBF to assess asset operational stability and MTTR to evaluate maintenance turnaround speed.',
        },
      },
      {
        number: 2,
        title: { es: 'Exportar Reportes Ejecutivos', en: 'Export Executive Reports' },
        description: {
          es: 'Filtra por rango de fechas y exporta gráficos de disponibilidad y costos para comités de gerencia.',
          en: 'Filter by date range and export availability and expenditure summaries for management reviews.',
        },
      },
    ],
  },
}
