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
  "01-registro": {
    "lessonId": "01-registro",
    "overview": {
      "es": "Aprende a registrar una nueva empresa en Asset Hub, seleccionar el plan corporativo, validar la disponibilidad del slug (subdominio) y configurar el primer usuario administrador.",
      "en": "Learn how to register a new organization in Asset Hub, select a corporate tier, validate slug availability, and configure the initial workspace administrator."
    },
    "keyTakeaways": {
      "es": [
        "Validación en tiempo real de slugs corporativos para evitar duplicados",
        "Aislamiento multi-tenant automático por subdominio",
        "Configuración inicial de zona horaria y moneda base"
      ],
      "en": [
        "Real-time corporate slug availability verification",
        "Automatic multi-tenant isolation per organization subdomain",
        "Initial baseline setup for primary timezone and base currency"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "1. Portal Principal de Asset Hub",
          "en": "1. Asset Hub Landing Portal"
        },
        "description": {
          "es": "Una nueva empresa ingresa al portal web de Asset Hub para dar de alta su propio espacio aislado.",
          "en": "A new organization visits Asset Hub to provision its own isolated multi-tenant workspace."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Selección de Idioma",
          "en": "Multi-Language Support"
        },
        "description": {
          "es": "La plataforma es multi-idioma: podés cambiar entre Español e Inglés en cualquier momento.",
          "en": "Switch between Español and English right from the top bar at any point."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "2. Ir al Registro de Organización",
          "en": "2. Navigate to Organization Signup"
        },
        "description": {
          "es": "En la pantalla de acceso, el administrador selecciona la opción para registrar una nueva empresa.",
          "en": "From the sign-in screen, the administrator selects the option to register a new company."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "3. Datos de la Organización",
          "en": "3. Organization Details"
        },
        "description": {
          "es": "Registramos a \"Industrias Metalúrgicas Atlas S.A.\" completando la razón social y su subdominio único.",
          "en": "We register \"Atlas Precision Manufacturing Inc.\" by entering its legal name and unique subdomain."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "4. Validación de Subdominio Único",
          "en": "4. Subdomain Availability Check"
        },
        "description": {
          "es": "Probamos primero con un subdominio ya ocupado (\"demo\") para mostrar la protección de exclusividad.",
          "en": "We first test an already taken subdomain (\"demo\") to see how the platform enforces tenant uniqueness."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Subdominio No Disponible",
          "en": "Subdomain Unavailable"
        },
        "description": {
          "es": "El sistema alerta de inmediato que ese subdominio ya pertenece a otra organización.",
          "en": "The system immediately alerts that this subdomain already belongs to another company."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "5. Subdominio Corporativo Confirmado",
          "en": "5. Corporate Subdomain Confirmed"
        },
        "description": {
          "es": "El subdominio \"atlas-industrial.assethub.app\" está libre y será la URL privada de la empresa.",
          "en": "The \"atlas-industrial.assethub.app\" subdomain is available and becomes the company private URL."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "6. Cuenta del Administrador Principal",
          "en": "6. Initial Administrator Account"
        },
        "description": {
          "es": "Cargamos los datos de \"Ing. Roberto Méndez\", quien recibirá permisos totales del tenant.",
          "en": "We enter the details for \"Eng. Roberto Mendez\", who will receive full Tenant Admin permissions."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "7. Creación del Tenant e Ingreso Automático",
          "en": "7. Provisioning & Automatic Sign-In"
        },
        "description": {
          "es": "Al confirmar, se aprovisiona el espacio aislado, se autentica al administrador y redirige al subdominio.",
          "en": "Submitting provisions the isolated tenant, authenticates the admin, and redirects to the workspace."
        }
      },
      {
        "number": 10,
        "title": {
          "es": "8. Bienvenida al Panel de Control",
          "en": "8. Welcome to the Dashboard"
        },
        "description": {
          "es": "Ya estamos dentro de \"atlas-industrial.localhost\", listo para configurar plantillas, activos y equipo.",
          "en": "We are now inside \"atlas-industrial.localhost\", ready to configure templates, assets, and staff."
        }
      },
      {
        "number": 11,
        "title": {
          "es": "9. Datos de Contacto de la Organización",
          "en": "9. Organization Contact Settings"
        },
        "description": {
          "es": "Completamos el correo de soporte técnico de la empresa para notificaciones y marca corporativa.",
          "en": "Finally, we set the corporate technical support email for branding and system notifications."
        }
      },
      {
        "number": 12,
        "title": {
          "es": "¡Cuenta Empresarial Configurada!",
          "en": "Company Account Ready!"
        },
        "description": {
          "es": "Industrias Metalúrgicas Atlas S.A. ya tiene su entorno activo y listo para operar.",
          "en": "Atlas Precision Manufacturing Inc. is fully provisioned and ready for operations."
        }
      }
    ]
  },
  "02-catalogos": {
    "lessonId": "02-catalogos",
    "overview": {
      "es": "Descubre cómo parametrizar catálogos maestros de fabricantes, criticidades y categorías de activos para estructurar el inventario.",
      "en": "Discover how to configure master catalogs for manufacturers, criticalities, and asset categories to standardize your inventory."
    },
    "keyTakeaways": {
      "es": [
        "Estandarización de nomenclaturas para evitar datos inconsistentes",
        "Categorías jerárquicas vinculables a plantillas técnicas",
        "Exportación e importación masiva de tablas maestras"
      ],
      "en": [
        "Standardization of master records to avoid inconsistent naming",
        "Hierarchical categories linked to technical templates",
        "Bulk import and export of master tables"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Soporte Multilenguaje",
          "en": "Multi-Language Switcher"
        },
        "description": {
          "es": "Elegimos Español en el selector superior antes de configurar los catálogos maestros.",
          "en": "We switch the interface to English from the top bar before configuring master catalogs."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "1. Creación de Catálogos Maestros",
          "en": "1. Creating Master Catalogs"
        },
        "description": {
          "es": "Definimos listas maestras reutilizables. Crearemos el catálogo \"Marca de Maquinaria Industrial\".",
          "en": "Define reusable dropdown lists. We will create the \"Industrial Machinery Brands\" catalog."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "2. Guardar Nuevo Catálogo",
          "en": "2. Save New Catalog"
        },
        "description": {
          "es": "Ingresamos el código único, su etiqueta visible y lo vinculamos al módulo de Activos.",
          "en": "Enter a unique code, display label, and link the catalog to the Assets module."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "3. Agregar Elementos al Catálogo",
          "en": "3. Add Catalog Items"
        },
        "description": {
          "es": "Cargamos las opciones reales que podrá elegir el operador (Mazak Corporation y Haas Automation).",
          "en": "Add the real options operators will select in forms (Mazak Corporation & Haas Automation)."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Catálogo Maestro Listo",
          "en": "Master Catalog Ready"
        },
        "description": {
          "es": "Las marcas quedaron registradas y listas para usarse en cualquier plantilla de activos.",
          "en": "Equipment brands are saved and ready to be linked to any asset template."
        }
      }
    ]
  },
  "02-esquemas": {
    "lessonId": "02-esquemas",
    "overview": {
      "es": "Diseña fichas técnicas a medida usando JSON Schema dinámico: agrega campos personalizados, pestañas operativas y validaciones sin tocar código.",
      "en": "Design custom asset datasheets using dynamic JSON Schema: add custom properties, tabs, and validation rules without coding."
    },
    "keyTakeaways": {
      "es": [
        "Diseñador visual de formularios sin código",
        "Agrupación por pestañas y secciones personalizadas",
        "Validación estricta de tipos de datos (números, fechas, dropdowns)"
      ],
      "en": [
        "No-code visual form and datasheet designer",
        "Tabbed organization and custom collapsible sections",
        "Strict schema validation for numbers, dates, and dropdown lists"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Configuración paso a paso en Español: modelado avanzado de pestañas, secciones y visibilidad condicional.",
          "en": "Step-by-step walkthrough in English: advanced tabs, section dividers, and conditional visibility."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Plantillas de Activos & Esquemas Dinámicos",
          "en": "Asset Templates & Schema Architecture"
        },
        "description": {
          "es": "El SchemaBuilder permite crear formularios estructurados para capturar datos complejos de ingeniería.",
          "en": "The SchemaBuilder structures rich engineering forms with tabs, sections, and business logic."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Pestaña de Atributos",
          "en": "Attributes Tab"
        },
        "description": {
          "es": "Accedemos al constructor de esquemas donde gestionamos pestañas, secciones y campos.",
          "en": "Entering the visual schema designer to configure tabs, sections, and custom attributes."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Gestión y Renombrado de Pestañas",
          "en": "Tab Customization & Renaming"
        },
        "description": {
          "es": "Renombramos la pestaña principal como \"Especificaciones Mecánicas\" para ordenar el formulario.",
          "en": "Renaming default tab to \"Mechanical Specifications\" to organize equipment parameters."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Secciones Divisorias",
          "en": "Section Dividers"
        },
        "description": {
          "es": "Insertamos un divisor de sección \"Parámetros Principales\" para agrupar las especificaciones clave.",
          "en": "Adding a \"Core Parameters\" section divider to group operational specifications."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Atributos Numéricos en la Sección",
          "en": "Numeric Fields in Section"
        },
        "description": {
          "es": "Agregamos \"Presión Máxima\" y \"Caudal Nominal\" con propagación a órdenes de trabajo.",
          "en": "Defining \"Max Pressure\" and \"Rated Flow\" with order propagation enabled."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Segunda Pestaña del Formulario",
          "en": "Adding Secondary Tab"
        },
        "description": {
          "es": "Creamos la pestaña \"Datos Eléctricos & Seguridad\" y agregamos el interruptor booleano de conexión.",
          "en": "Creating \"Electrical & Safety Data\" tab and adding a boolean electrical switch attribute."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Lógica de Visibilidad Condicional",
          "en": "Conditional Visibility Logic"
        },
        "description": {
          "es": "El campo \"Amperaje Nominal\" solo se muestra cuando \"Requiere Conexión Trifásica\" es Sí (true).",
          "en": "The \"Rated Amperage\" field only appears when \"Requires Three-Phase\" equals Yes (true)."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Vista Previa Interactiva",
          "en": "Interactive Preview Validation"
        },
        "description": {
          "es": "Verificamos en la vista previa cómo se renderizan las pestañas y la visibilidad condicional.",
          "en": "Testing the live form preview to confirm multi-tab rendering and conditional behavior."
        }
      },
      {
        "number": 10,
        "title": {
          "es": "Persistencia del Esquema Dinámico",
          "en": "Persisting Dynamic Schema"
        },
        "description": {
          "es": "Guardamos la plantilla con su esquema jerárquico listo para el alta de activos en planta.",
          "en": "Saving the template with full multi-tab schema ready for industrial equipment onboarding."
        }
      }
    ]
  },
  "03-estados": {
    "lessonId": "03-estados",
    "overview": {
      "es": "Aprende a configurar máquinas de estados finitos que gobiernan las transiciones operativas de los activos (Operativo, En Mantenimiento, Baja Definitiva).",
      "en": "Learn how to configure finite state machines that control asset operational transitions (Operative, Under Maintenance, Decommissioned)."
    },
    "keyTakeaways": {
      "es": [
        "Transiciones y validación gráfica en canvas interactivo",
        "Automatizaciones OnEnter para disparo automático de órdenes de trabajo",
        "Estados iniciales y terminales con paleta semántica y control de flujo"
      ],
      "en": [
        "Visual transitions and validation in interactive canvas",
        "OnEnter automations triggering automated work orders",
        "Initial and terminal states with semantic palettes and flow governance"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Configuración Multilenguaje",
          "en": "Multilanguage Setup"
        },
        "description": {
          "es": "Demostración paso a paso en Español: modelado visual del ciclo de vida industrial.",
          "en": "Step-by-step walkthrough in English: visual modeling of enterprise asset states."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Gestión de Plantillas de Activos",
          "en": "Asset Templates Management"
        },
        "description": {
          "es": "Cada plantilla define los estados válidos, transiciones y automatizaciones de sus activos.",
          "en": "Each template defines state diagrams, transitions and automated event triggers."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Creación de Plantilla",
          "en": "Template Definition"
        },
        "description": {
          "es": "Definimos el código y nombre del equipo antes de pasar directamente al ciclo de vida.",
          "en": "Setting up equipment code and name before jumping straight to the lifecycle canvas."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Editor Visual de Ciclo de Vida",
          "en": "Visual Lifecycle Editor"
        },
        "description": {
          "es": "Canvas interactivo basado en nodos para modelar la máquina de estados finitos.",
          "en": "Interactive node-based canvas for state machine modeling."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Creación de Estados de Operación",
          "en": "Adding State Nodes"
        },
        "description": {
          "es": "Agregamos \"Operativo\", \"En Mantenimiento\" y \"Baja Definitiva\" al canvas.",
          "en": "Creating \"Operative\", \"Under Maintenance\" and \"Decommissioned\" states."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Estado Inicial y Color Semántico",
          "en": "Initial State & Semantic Palette"
        },
        "description": {
          "es": "Marcamos \"Operativo\" como estado inicial y asignamos color verde esmeralda.",
          "en": "Confirming \"Operative\" as initial entry point with emerald green badge."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Automatización & Reglas de Mantenimiento",
          "en": "Automations & Transition Rules"
        },
        "description": {
          "es": "Al entrar en mantenimiento se dispara automáticamente una Orden de Trabajo.",
          "en": "Configuring auto Work Order creation upon entering maintenance."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Estado Terminal de Baja",
          "en": "Terminal Decommission State"
        },
        "description": {
          "es": "Marcamos \"Baja Definitiva\" como terminal en rojo para cerrar el ciclo sin transiciones salientes.",
          "en": "Setting red terminal badge to ensure no outgoing transitions once retired."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Interconexión de Flujos y Transiciones",
          "en": "State Flow Interconnections"
        },
        "description": {
          "es": "Conectamos Operativo ➔ En Mantenimiento, Mantenimiento ➔ Operativo y En Mantenimiento ➔ Baja Definitiva.",
          "en": "Connecting Operative ➔ Under Maintenance, Maintenance ➔ Operative and Under Maintenance ➔ Decommissioned."
        }
      },
      {
        "number": 10,
        "title": {
          "es": "Herramientas del Canvas",
          "en": "Canvas Navigation Controls"
        },
        "description": {
          "es": "Centrado automático y controles de navegación para flujos de alta complejidad.",
          "en": "Centering and zoom tools designed for complex industrial state diagrams."
        }
      },
      {
        "number": 11,
        "title": {
          "es": "Guardado y Persistencia",
          "en": "Persisting State Machine"
        },
        "description": {
          "es": "La máquina de estados queda registrada y lista para gobernar los activos de planta.",
          "en": "State machine is persisted and immediately ready for industrial operations."
        }
      }
    ]
  },
  "03-01-alta": {
    "lessonId": "03-01-alta",
    "overview": {
      "es": "Crea un activo físico en el sistema utilizando la plantilla técnica, asignando tag corporativo, número de serie y ubicación.",
      "en": "Create a physical asset record using technical templates, assigning corporate tags, serial numbers, and locations."
    },
    "keyTakeaways": {
      "es": [
        "Generación automática de códigos QR / Barcode",
        "Relleno estructurado de especificaciones dinámicas",
        "Asignación inmediata a responsable y centro de costo"
      ],
      "en": [
        "Automatic QR / Barcode generation per asset",
        "Structured entry of dynamic technical properties",
        "Immediate assignment to custodian and cost center"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Configuración paso a paso en Español: alta de activo industrial a partir de plantilla.",
          "en": "Step-by-step walkthrough in English: industrial asset creation from templates."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Inventario Maestro de Activos",
          "en": "Enterprise Asset Inventory"
        },
        "description": {
          "es": "La vista de activos centraliza el parque de maquinaria, equipos y componentes de la planta.",
          "en": "The asset inventory manages plant machinery, systems, and field components."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Selección de Plantilla Base",
          "en": "Template Selection"
        },
        "description": {
          "es": "Seleccionamos la plantilla de Torno CNC para heredar automáticamente su esquema y ciclo de vida.",
          "en": "Selecting the CNC Lathe template to automatically inherit schema and lifecycle states."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Datos de Identificación del Activo",
          "en": "Asset Identification Data"
        },
        "description": {
          "es": "Asignamos código único \"CNC-01\" y nombre corporativo al equipo industrial.",
          "en": "Assigning unique code \"CNC-01\" and enterprise name to the new industrial machine."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Atributos Dinámicos y Específicos",
          "en": "Dynamic Inherited Attributes"
        },
        "description": {
          "es": "Completamos atributos heredados de la plantilla: número de serie y horómetro inicial.",
          "en": "Filling template attributes: serial number and initial operating hours counter."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Guardado y Alta en Planta",
          "en": "Persisting Asset Onboarding"
        },
        "description": {
          "es": "El activo queda registrado en estado \"Operativo\" y listo para trazabilidad de mantenimiento.",
          "en": "Asset is registered in \"Operative\" status ready for maintenance and work orders."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Ficha Técnica 360° del Activo",
          "en": "360° Asset Technical Sheet"
        },
        "description": {
          "es": "La ficha integra detalles, componentes BOM, ubicación, historial de cambios y finanzas.",
          "en": "The asset sheet displays specs, BOM spare parts, map location, history, and finance."
        }
      }
    ]
  },
  "03-02-bom": {
    "lessonId": "03-02-bom",
    "overview": {
      "es": "Gestiona la lista de materiales (BOM) y repuestos asociados a cada activo para agilizar mantenimientos y pedidos de almacén.",
      "en": "Manage Bill of Materials (BOM) and spare parts linked to each asset to accelerate maintenance and store replenishment."
    },
    "keyTakeaways": {
      "es": [
        "Despiece de repuestos por activo",
        "Enlace directo con el catálogo de stock",
        "Estimación de costos de reposición"
      ],
      "en": [
        "Spare parts breakdown per asset",
        "Direct link to inventory store catalog",
        "Replacement cost estimation"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Configuración detallada de repuestos e insumos vinculados al equipo industrial.",
          "en": "Detailed configuration of spare parts and consumables linked to the industrial asset."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Ficha Técnica Integral del Activo",
          "en": "Comprehensive Asset Technical Sheet"
        },
        "description": {
          "es": "Accedemos al detalle técnico del torno CNC para asociar su árbol de refacciones y consumibles.",
          "en": "Accessing the CNC Lathe technical sheet to attach spare parts and consumable items."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Pestaña BOM y Repuestos",
          "en": "BOM & Spare Parts Tab"
        },
        "description": {
          "es": "El Bill of Materials lista repuestos críticos y componentes para órdenes de trabajo preventivas.",
          "en": "The Bill of Materials lists critical parts and assemblies required by work orders."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Asignación de Nuevo Repuesto",
          "en": "Assigning a New Spare Part"
        },
        "description": {
          "es": "Abrimos el formulario de registro de material para vincularlo al catálogo maestro de partes.",
          "en": "Opening the material assignment drawer linked to the master spare parts catalog."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Selección desde Catálogo Maestro",
          "en": "Selecting from Master Catalog"
        },
        "description": {
          "es": "Buscamos y seleccionamos el filtro de aceite hidráulico estandarizado en la empresa.",
          "en": "Searching and choosing the standardized hydraulic oil filter from enterprise catalog."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Cantidad y Criticidad Operativa",
          "en": "Quantity & Criticality Flag"
        },
        "description": {
          "es": "Establecemos cantidad requerida y activamos el indicador de repuesto crítico para stock mínimo.",
          "en": "Setting required quantity and marking as critical spare part for safety inventory tracking."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Guardado y Vinculación BOM",
          "en": "Persisting BOM Association"
        },
        "description": {
          "es": "Persistimos la relación. El material queda listo para abastecer requisiciones de mantenimiento.",
          "en": "Saving relationship: the spare part is now available for maintenance kits and requisitions."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Árbol de Repuestos Actualizado",
          "en": "Updated Bill of Materials"
        },
        "description": {
          "es": "El componente queda catalogado con su criticidad destacada y badge de estado en el activo.",
          "en": "The component is cataloged with criticality badge and ready for inventory cross-checks."
        }
      }
    ]
  },
  "03-03-jerarquia": {
    "lessonId": "03-03-jerarquia",
    "overview": {
      "es": "Construye la jerarquía espacial y operativa de activos (Planta > Línea de Producción > Máquina > Componente).",
      "en": "Build the spatial and operational asset hierarchy (Plant > Production Line > Machine > Subcomponent)."
    },
    "keyTakeaways": {
      "es": [
        "Árbol visual interactivo",
        "Propagación de estados de falla en cascada",
        "Navegación contextual rápida"
      ],
      "en": [
        "Interactive visual asset tree",
        "Cascading fault status propagation",
        "Fast contextual navigation"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Configuración de la estructura organizacional y ubicación técnica en planta.",
          "en": "Configuring organizational equipment trees and plant locations step-by-step."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Inventario y Árbol de Planta",
          "en": "Asset Inventory & Plant Tree"
        },
        "description": {
          "es": "La estructura de activos modela la jerarquía física: Plantas > Celdas de Trabajo > Maquinaria > Componentes.",
          "en": "The asset tree models physical topology: Plants > Production Cells > Machines > Components."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Acceso a la Ficha Técnica",
          "en": "Accessing Technical Equipment Sheet"
        },
        "description": {
          "es": "Abrimos el equipo industrial para gestionar sus dependencias estructurales y componentes hijos.",
          "en": "Opening the industrial equipment to inspect structural dependencies and child sub-assemblies."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Pestaña de Jerarquía Organizacional",
          "en": "Organizational Hierarchy Tab"
        },
        "description": {
          "es": "Muestra visualmente el activo superior inmediato y todos los subsistemas subordinados.",
          "en": "Visually displays the immediate parent container and all subordinate sub-components."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Análisis de Dependencias y Subsistemas",
          "en": "Subsystems & Sub-assembly Inspection"
        },
        "description": {
          "es": "Verificamos los componentes acoplados al equipo: husillo principal, motor reductor y torreta CNC.",
          "en": "Inspecting attached assemblies: primary electrospindle, servo drive, and motorized turret."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Reasignación de Activo Superior",
          "en": "Reassigning Parent Container"
        },
        "description": {
          "es": "Abrimos el asistente de movimiento para reubicar este equipo dentro de otra celda productiva.",
          "en": "Opening the transfer dialog to relocate this machinery into another automated production line."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Selección de la Nueva Celda o Línea",
          "en": "Selecting New Production Line"
        },
        "description": {
          "es": "Elegimos la \"Línea de Producción Automatizada 02\" como nuevo contenedor padre.",
          "en": "Selecting \"Automated Production Line 02\" as the new topological parent container."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Confirmación y Propagación de Estados",
          "en": "Confirming Relocation & Cost Rollup"
        },
        "description": {
          "es": "Guardamos la nueva relación. La trazabilidad y costos se consolidan automáticamente hacia el padre.",
          "en": "Persisting new hierarchy. Maintenance tracking and MTBF roll up seamlessly to the new parent."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Selección de la Nueva Celda o Línea",
          "en": "Selecting New Production Line"
        },
        "description": {
          "es": "Elegimos la \"Línea de Producción Automatizada 02\" como nuevo contenedor padre.",
          "en": "Selecting \"Automated Production Line 02\" as the new topological parent container."
        }
      },
      {
        "number": 10,
        "title": {
          "es": "Confirmación y Propagación de Estados",
          "en": "Confirming Relocation & Cost Rollup"
        },
        "description": {
          "es": "Guardamos la nueva relación. La trazabilidad y costos se consolidan automáticamente hacia el padre.",
          "en": "Persisting new hierarchy. Maintenance tracking and MTBF roll up seamlessly to the new parent."
        }
      },
      {
        "number": 11,
        "title": {
          "es": "Jerarquía Industrial Actualizada",
          "en": "Updated Operational Hierarchy"
        },
        "description": {
          "es": "El activo queda reubicado en el organigrama operativo con navegación bidireccional entre niveles.",
          "en": "The machine is repositioned in the plant topology with bidirectional tree navigation."
        }
      }
    ]
  },
  "03-04-mapas": {
    "lessonId": "03-04-mapas",
    "overview": {
      "es": "Localiza activos en mapas interactivos y planos de planta mediante coordenadas geográficas o polígonos.",
      "en": "Locate assets across interactive maps and floorplans using GPS coordinates or boundary polygons."
    },
    "keyTakeaways": {
      "es": [
        "Georreferenciación Leaflet/OpenStreetMap",
        "Pins coloreados por estado operacional",
        "Filtros por zona geográfica"
      ],
      "en": [
        "Leaflet/OpenStreetMap geospatial mapping",
        "Color-coded pins by operational state",
        "Geographic zone filters"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Georreferenciación de activos, coordenadas GPS, polígonos de planta y visualización global.",
          "en": "Asset georeferencing, GPS coordinates, plant geofences, and fleet map view."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Georreferenciación en Planta Industrial",
          "en": "Industrial Geolocation & Site Mapping"
        },
        "description": {
          "es": "La ubicación precisa permite a las brigadas de mantenimiento localizar equipos en predios extensos.",
          "en": "Precise positioning allows field technicians to rapidly locate assets across large industrial sites."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Ficha Técnica del Torno CNC",
          "en": "CNC Lathe Technical Sheet"
        },
        "description": {
          "es": "Accedemos a los datos técnicos para consultar y ajustar su geoposicionamiento en planta.",
          "en": "Opening equipment record to inspect and manage its geospatial plant placement."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Pestaña de Ubicación y Mapas",
          "en": "Location & Map Visualization Tab"
        },
        "description": {
          "es": "Visualizador cartográfico con mapas vectoriales satelitales, pines de estado y polígonos GeoJSON.",
          "en": "Interactive cartographic viewer featuring satellite tiles, status markers, and GeoJSON boundaries."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Pin de Coordenadas y Estado del Activo",
          "en": "GPS Pin & Real-Time Operational State"
        },
        "description": {
          "es": "El marcador refleja la posición exacta en nave industrial con color representativo de su estado operativo.",
          "en": "The pin denotes exact shop-floor placement with status-coded colors and failure risk levels."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Herramientas de Delimitación y Geocercas",
          "en": "Geofencing & Boundary Drawing Tools"
        },
        "description": {
          "es": "Permite dibujar perímetros de seguridad, celdas de trabajo y zonas restringidas de mantenimiento.",
          "en": "Enables drafting security perimeters, robotic work cells, and hazardous maintenance zones."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Modo Pantalla Completa y Navegación",
          "en": "Fullscreen Inspection Mode"
        },
        "description": {
          "es": "Maximizamos el mapa para inspección detallada de layout, distancias y accesos logísticos.",
          "en": "Expanding the viewport for detailed plant layout navigation, logistics access, and clearance checks."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Mapa Global de Activos de la Empresa",
          "en": "Enterprise Global Asset Fleet Map"
        },
        "description": {
          "es": "Visualización consolidada de todo el parque de maquinaria distribuido entre plantas y naves.",
          "en": "Consolidated overview of all machines and mobile assets distributed across multi-site facilities."
        }
      }
    ]
  },
  "03-05-bitacora": {
    "lessonId": "03-05-bitacora",
    "overview": {
      "es": "Audita la línea de tiempo histórica del activo: cambios de estado, reparaciones, calibraciones y responsables.",
      "en": "Audit the historical asset timeline: status transitions, repairs, calibrations, and custodians."
    },
    "keyTakeaways": {
      "es": [
        "Registro inmutable de eventos",
        "Filtros cronológicos por tipo de suceso",
        "Evidencia fotográfica adjunta"
      ],
      "en": [
        "Immutable event audit trail",
        "Chronological filters by event type",
        "Attached photo evidence"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Historial inmutable de auditoría, transiciones de estado, responsables y registros de datos.",
          "en": "Immutable audit trail, lifecycle transitions, responsible personnel, and telemetry captures."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Auditoría Continua y Trazabilidad",
          "en": "Continuous Audit Trail & Traceability"
        },
        "description": {
          "es": "Cada intervención, cambio de estado y calibración sobre el equipo queda sellada criptográficamente.",
          "en": "Every technician intervention, lifecycle transition, and calibration event is timestamped."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Acceso a la Ficha del Activo",
          "en": "Accessing Equipment Record"
        },
        "description": {
          "es": "Abrimos la ficha técnica del Torno CNC para examinar su línea de tiempo operativa.",
          "en": "Opening the CNC Lathe technical sheet to review its complete operational lifecycle timeline."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Pestaña de Bitácora (Timeline)",
          "en": "Activity Log & Timeline Tab"
        },
        "description": {
          "es": "Cronología vertical con todas las transiciones del ciclo de vida y eventos relevantes del activo.",
          "en": "Vertical chronogram tracking all lifecycle states, maintenance triggers, and historical events."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Registro de Transiciones de Ciclo de Vida",
          "en": "Lifecycle State Transitions Log"
        },
        "description": {
          "es": "Inspeccionamos los saltos de estado: Alta > Calibración Inicial > Operativo > Mantenimiento.",
          "en": "Inspecting chronological state changes: Created > Initial Calibration > Operative > In Maintenance."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Formularios y Parámetros Capturados",
          "en": "Form Parameters & Telemetry Snapshots"
        },
        "description": {
          "es": "Al cambiar de estado, los datos obligatorios (técnico, horómetro, lecturas) quedan registrados.",
          "en": "During state handoffs, required transition fields (technician, hours meter, notes) are recorded."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Cumplimiento Normativo ISO 55000",
          "en": "ISO 55000 Compliance & Regulatory Audit"
        },
        "description": {
          "es": "La bitácora garantiza total trazabilidad para auditorías de calidad y confiabilidad operacional.",
          "en": "The timeline provides full provenance for plant safety audits and asset reliability reviews."
        }
      }
    ]
  },
  "03-06-finanzas": {
    "lessonId": "03-06-finanzas",
    "overview": {
      "es": "Controla el costo de adquisición, depreciación contable acumulada y valor residual de cada equipo.",
      "en": "Track acquisition costs, accumulated financial depreciation, and residual equipment valuation."
    },
    "keyTakeaways": {
      "es": [
        "Cálculo de depreciación lineal",
        "Costo total de propiedad (TCO)",
        "Proyección de fin de vida útil"
      ],
      "en": [
        "Straight-line depreciation calculation",
        "Total Cost of Ownership (TCO)",
        "End-of-life replacement projection"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "DemostraciÃƒÂ³n Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Libro contable del activo, depreciaciÃƒÂ³n periÃƒÂ³dica, revalÃƒÂºos y control de resguardos.",
          "en": "Asset accounting ledger, scheduled depreciation, asset revaluation, and custody transfers."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "GestiÃƒÂ³n Financiera del Ciclo de Vida",
          "en": "Lifecycle Financial Management"
        },
        "description": {
          "es": "Control de costo de adquisiciÃƒÂ³n, valor residual, depreciaciÃƒÂ³n acumulada y valor en libros.",
          "en": "Tracking historical acquisition cost, salvage value, accumulated depreciation, and net book value."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Ficha TÃƒÂ©cnica del Torno CNC",
          "en": "CNC Lathe Technical Sheet"
        },
        "description": {
          "es": "Accedemos a los datos del equipo para auditar su libro de activos fijos e historial contable.",
          "en": "Opening equipment record to audit its fixed asset financial book and balance sheet items."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "PestaÃƒÂ±a de Finanzas del Activo",
          "en": "Asset Finance & Accounting Tab"
        },
        "description": {
          "es": "Panel financiero integral con resumen patrimonial, cronogramas de amortizaciÃƒÂ³n y resguardos.",
          "en": "Comprehensive financial dashboard featuring net worth cards, amortization schedules, and custody."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "KPIs y Resumen Financiero",
          "en": "Financial KPIs & Net Book Value"
        },
        "description": {
          "es": "Visualizamos costo inicial ($120,000 USD), valor de rescate y valor contable actual.",
          "en": "Inspecting purchase cost ($120,000 USD), salvage reserve, and current balance sheet value."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Tabla de DepreciaciÃƒÂ³n y AmortizaciÃƒÂ³n",
          "en": "Depreciation & Amortization Schedule"
        },
        "description": {
          "es": "Cronograma proyectado por lÃƒÂ­nea recta mensual para cierres contables y deducibilidad fiscal.",
          "en": "Projected straight-line monthly depreciation ledger for corporate accounting and tax reporting."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Ajustes de Valor y RevalÃƒÂºos",
          "en": "Value Adjustments & Revaluations"
        },
        "description": {
          "es": "Registro de mejoras mayores, revalÃƒÂºos periciales o deterioro patrimonial del equipo.",
          "en": "Auditing capital expenditure retrofits, technical appraisals, and asset impairment entries."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Control de Custodia y Resguardos",
          "en": "Custody Transfers & Responsibility Logs"
        },
        "description": {
          "es": "Trazabilidad de asignaciÃƒÂ³n a tÃƒÂ©cnicos o cuadrillas con actas de entrega-recepciÃƒÂ³n digitales.",
          "en": "Full chain of custody tracking assignments to engineers, shift leads, and work centers."
        }
      }
    ]
  },
  "04-00-plantillas": {
    "lessonId": "04-00-plantillas",
    "overview": {
      "es": "Crea plantillas estandarizadas para tipos comunes de fallas e incidencias de mantenimiento.",
      "en": "Create standardized templates for recurring maintenance fault classifications."
    },
    "keyTakeaways": {
      "es": [
        "Clasificación uniforme de averías",
        "Prioridades predeterminadas",
        "Checklists de diagnóstico sugeridos"
      ],
      "en": [
        "Uniform fault taxonomy",
        "Predefined priority levels",
        "Suggested diagnostic checklists"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "DemostraciÃƒÂ³n Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "ConfiguraciÃƒÂ³n previa de la plantilla de incidencia con atributos dinÃƒÂ¡micos y ciclo de vida.",
          "en": "Preconditioning setup of incident templates featuring dynamic schemas and lifecycle states."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "CatÃƒÂ¡logo Maestro de Plantillas de Flujo",
          "en": "Master Workflow Templates Catalog"
        },
        "description": {
          "es": "Las plantillas estandarizan quÃƒÂ© datos se capturan cuando un activo entra en contingencia.",
          "en": "Templates standardize data requirements captured whenever machinery suffers an unplanned stoppage."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "CreaciÃƒÂ³n de Nueva Plantilla de Incidencia",
          "en": "Creating New Incident Template"
        },
        "description": {
          "es": "Iniciamos el formulario de configuraciÃƒÂ³n para definir el cÃƒÂ³digo y el tipo de flujo de trabajo.",
          "en": "Opening the configuration drawer to define protocol code, title, and maintenance workflow type."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Datos Generales y Tipo de Flujo",
          "en": "General Metadata & Incident Type"
        },
        "description": {
          "es": "Definimos el cÃƒÂ³digo INC-MEC-01, nombre corporativo y seleccionamos tipo \"Incidencia\".",
          "en": "Assigning code INC-MEC-01, enterprise title, and selecting \"Incident\" workflow category."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Esquema de Atributos DinÃƒÂ¡micos",
          "en": "Dynamic Schema Attributes"
        },
        "description": {
          "es": "DiseÃƒÂ±amos los campos tÃƒÂ©cnicos obligatorios: nivel de vibraciÃƒÂ³n, temperatura y fotos de la falla.",
          "en": "Configuring required technical inputs: spindle vibration RMS, thermal reading, and failure photos."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "MÃƒÂ¡quina de Estados de la Incidencia",
          "en": "Incident State Machine Canvas"
        },
        "description": {
          "es": "Configuramos el ciclo de resoluciÃƒÂ³n: Reportada > En DiagnÃƒÂ³stico > En ReparaciÃƒÂ³n > Resuelta.",
          "en": "Defining ticket lifecycle: Reported > In Triage > Under Repair > Closed / Resolved."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "PrevisualizaciÃƒÂ³n del Formulario TÃƒÂ©cnico",
          "en": "Live Dynamic Form Preview"
        },
        "description": {
          "es": "Validamos cÃƒÂ³mo verÃƒÂ¡ el tÃƒÂ©cnico de planta el formulario dinÃƒÂ¡mico al momento de la falla.",
          "en": "Inspecting the technician form layout as rendered on mobile and shop-floor terminals."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "PublicaciÃƒÂ³n y Disponibilidad Corporativa",
          "en": "Publishing Enterprise Template"
        },
        "description": {
          "es": "Guardamos la plantilla. Ahora estÃƒÂ¡ lista para ser consumida por la mÃƒÂ¡quina de estados de los activos.",
          "en": "Persisting template: now fully available to be linked into asset lifecycle state machines."
        }
      }
    ]
  },
  "04-01-transicion": {
    "lessonId": "04-01-transicion",
    "overview": {
      "es": "Flujo de vida de una incidencia: desde el reporte en terreno hasta el cierre validado por supervisión.",
      "en": "Lifecycle of an incident: from initial field reporting through supervisor sign-off."
    },
    "keyTakeaways": {
      "es": [
        "Estados: Abierta, En Diagnóstico, En Reparación, Resuelta",
        "Asignación automática a cuadrillas"
      ],
      "en": [
        "States: Open, In Triage, In Repair, Resolved",
        "Automatic workgroup dispatch"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilenguaje",
          "en": "Multilanguage Walkthrough"
        },
        "description": {
          "es": "Flujo completo donde el cambio de estado del activo genera automáticamente la orden de incidencia.",
          "en": "Full lifecycle flow where asset state transitions automatically trigger incident records."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Integración Máquina de Estados y Mantenimiento",
          "en": "State Machine & Maintenance Integration"
        },
        "description": {
          "es": "La incidencia no se crea aislada: nace de la regla de ciclo de vida configurada en la plantilla del equipo.",
          "en": "Incidents are not created in isolation: they originate from lifecycle delegation rules set on templates."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Activo Operativo en Planta",
          "en": "Operating Asset on Shop Floor"
        },
        "description": {
          "es": "El Torno CNC se encuentra en estado \"Operativo\" con sus botones de transición de ciclo de vida disponibles.",
          "en": "The CNC Lathe is currently in \"Operative\" status with available lifecycle transition triggers."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Vínculo con el Módulo Delegado",
          "en": "Delegated Module Linking"
        },
        "description": {
          "es": "La máquina de estados estipula que pasar a \"En Falla\" delega la acción directamente al módulo de incidencias.",
          "en": "The template state machine defines that moving to \"In Fault\" hands off control to the incidents module."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Disparo de la Transición de Estado",
          "en": "Triggering State Transition"
        },
        "description": {
          "es": "Hacemos clic en el botón de transición \"En Falla\" para reportar la contingencia del activo.",
          "en": "Clicking the transition action \"In Fault\" to flag an unplanned machine stoppage."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Apertura Automática del Reporte de Incidencia",
          "en": "Automatic Incident Form Launch"
        },
        "description": {
          "es": "El sistema asocia el activo automáticamente, bloquea el selector y precarga el estado de destino.",
          "en": "The system binds the asset context, locks the target status, and loads required incident inputs."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Selección de la Plantilla de Incidencia",
          "en": "Selecting Incident Workflow Template"
        },
        "description": {
          "es": "Seleccionamos la plantilla específica para averías mecánicas y térmicas de husillos.",
          "en": "Selecting the specialized breakdown template configured for spindle and thermal failures."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Captura de Datos de la Falla",
          "en": "Capturing Breakdown Details"
        },
        "description": {
          "es": "Ingresamos título, descripción técnica y severidad de la avería para la cuadrilla electromecánica.",
          "en": "Entering failure title, root symptom description, and priority level for the repair squad."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Atributos Dinámicos del Diagnóstico",
          "en": "Diagnostic Dynamic Schema Fields"
        },
        "description": {
          "es": "Completamos los campos del esquema de la plantilla: nivel de vibración y parámetros operativos.",
          "en": "Populating template schema inputs: vibration severity level and thermal telemetry snapshots."
        }
      },
      {
        "number": 10,
        "title": {
          "es": "Guardado y Bloqueo Operativo del Activo",
          "en": "Persisting Incident & Asset State Lock"
        },
        "description": {
          "es": "La incidencia queda registrada, el activo cambia a \"En Falla\" y queda bajo control de Mantenimiento.",
          "en": "Incident is created, asset status switches to \"In Fault\", and machinery is locked under maintenance."
        }
      },
      {
        "number": 11,
        "title": {
          "es": "Trazabilidad en Bitácora e Incidencias Activas",
          "en": "Audit Trace & Active Incident Accordion"
        },
        "description": {
          "es": "El acordeón de incidencias y la bitácora reflejan la transición y el folio de mantenimiento generado.",
          "en": "The asset timeline and incidents drawer verify immediate provenance and linked maintenance ticket."
        }
      }
    ]
  },
  "04-02-incidencias": {
    "lessonId": "04-02-incidencias",
    "overview": {
      "es": "Gestión y tablero central de incidencias operacionales reportadas por operadores y técnicos.",
      "en": "Central operational incident board reported by field technicians and machine operators."
    },
    "keyTakeaways": {
      "es": [
        "Vista Kanban y tabla filtrable",
        "SLA de respuesta por criticidad",
        "Adjuntos fotográficos de averías"
      ],
      "en": [
        "Kanban board & tabular views",
        "SLA timers by criticality",
        "Attached fault photo evidence"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilingüe de la Plataforma",
          "en": "Multilingual Platform Walkthrough"
        },
        "description": {
          "es": "Navegación completa del centro de gestión y ciclo de vida de contingencias operativas.",
          "en": "Comprehensive tour of the plant incident triage console and contingency workflows."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Bandeja Principal de Incidencias (/maintenance/incidents)",
          "en": "Incident Management Center (/maintenance/incidents)"
        },
        "description": {
          "es": "Consola unificada para supervisión, filtrado por criticidad y diagnóstico de fallas activas.",
          "en": "Centralized workspace for real-time monitoring, priority filtering, and diagnosis."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Búsqueda Inteligente y Filtros por Atributo",
          "en": "Smart Search & Attribute Facets"
        },
        "description": {
          "es": "Localizamos incidencias asociadas a componentes mecánicos y anomalías térmicas en planta.",
          "en": "Filtering machinery tickets by failure mode, asset class, and vibration diagnostics."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Selección de la Incidencia Generada por el Activo",
          "en": "Opening Asset-Originated Incident"
        },
        "description": {
          "es": "Abrimos la ficha técnica de la contingencia para iniciar la fase de diagnóstico y triaje.",
          "en": "Entering the technical contingency sheet to start diagnosis and squad triage."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Encabezado Operativo y Severidad",
          "en": "Operational Overview & Severity"
        },
        "description": {
          "es": "Visualizamos el activo afectado (Torno CNC Mazak), el estado actual y el código de trazabilidad.",
          "en": "Inspect the parent asset (Mazak CNC Lathe), current lifecycle state, and tracking badge."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Atributos Dinámicos de la Avería",
          "en": "Dynamic Schema Diagnostic Inputs"
        },
        "description": {
          "es": "Revisamos la telemetría capturada según el esquema de la plantilla (vibración, temperatura y síntomas).",
          "en": "Telemetry and operational parameters gathered via template schema (RMS vibration, thermal logs)."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Bitácora y Línea de Tiempo de Eventos",
          "en": "Event Log & State Audit Trail"
        },
        "description": {
          "es": "Cada transición, cambio de estado y nota técnica queda registrada cronológicamente con firma digital.",
          "en": "Chronological event record documenting transitions, technical remarks, and user sign-offs."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Transición de Estado: Diagnóstico / En Análisis",
          "en": "Lifecycle Transition: In Triage / Under Diagnosis"
        },
        "description": {
          "es": "Avanzamos el ciclo de vida de la incidencia para formalizar el triaje del equipo de electromecánica.",
          "en": "Advancing incident lifecycle to lock the ticket into active electromechanical troubleshooting."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Tareas de Intervención Vinculadas",
          "en": "Direct Diagnostic Tasks"
        },
        "description": {
          "es": "El widget integrado permite crear y coordinar tareas de inspección directa previas a la orden mayor.",
          "en": "Embedded widget to delegate immediate diagnostic checklists prior to comprehensive work orders."
        }
      }
    ]
  },
  "04-03-ordenes": {
    "lessonId": "04-03-ordenes",
    "overview": {
      "es": "Generación, despacho y seguimiento de Órdenes de Trabajo (OT) correctivas y preventivas.",
      "en": "Generation, dispatch, and tracking of corrective and preventive Work Orders (WO)."
    },
    "keyTakeaways": {
      "es": [
        "Planificación de fechas y cuadrilla",
        "Imputación de repuestos y horas-hombre",
        "Firma digital de conformidad"
      ],
      "en": [
        "Schedule dates and work crew",
        "Spare parts & labor hour logging",
        "Digital customer sign-off"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilingüe de la Plataforma",
          "en": "Multilingual Platform Walkthrough"
        },
        "description": {
          "es": "Flujo completo de emisión, gestión de repuestos y ciclo de vida de Órdenes de Trabajo.",
          "en": "End-to-end workflow covering work order generation, materials planning, and lifecycle stages."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Bandeja de Órdenes de Trabajo (/maintenance/orders)",
          "en": "Work Orders Dashboard (/maintenance/orders)"
        },
        "description": {
          "es": "Supervisión de órdenes preventivas y correctivas, estados operativos y prioridades de planta.",
          "en": "Plant overview tracking corrective and preventive orders, execution statuses, and schedules."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Creación de Nueva Orden de Trabajo",
          "en": "Creating a New Work Order"
        },
        "description": {
          "es": "Abrimos el formulario de registro para vincular el activo afectado y la incidencia reportada.",
          "en": "Opening the work order sheet to link the parent machine asset and its open incident ticket."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Captura de Parámetros de la OT",
          "en": "Entering Work Order Parameters"
        },
        "description": {
          "es": "Definimos título, criticidad, tipo correctivo y generación automática del checklist de tareas.",
          "en": "Specifying work order scope, corrective category, priority squad, and automated task checklists."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Selección de la Orden en el Listado",
          "en": "Selecting the Order from the Roster"
        },
        "description": {
          "es": "Elegimos la orden recién creada para acceder a su panel de gestión detallado.",
          "en": "Opening the newly issued work order into the split-pane management console."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Panel de Control de la Orden de Trabajo",
          "en": "Work Order Operations Console"
        },
        "description": {
          "es": "Revisamos la vinculación con el activo CNC, fechas programadas y trazabilidad con la incidencia.",
          "en": "Inspecting CNC asset linkage, scheduled downtime windows, and source incident provenance."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Transiciones de Estado de la Orden",
          "en": "Work Order Lifecycle State Transitions"
        },
        "description": {
          "es": "El flujo permite avanzar ordenadamente: Borrador → Aprobada → Programada → En Progreso → Verificada.",
          "en": "Controlled phase gating: Draft → Approved → Scheduled → In Progress → Done → Verified."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Gestión y Reserva de Materiales / BOM",
          "en": "BOM Parts Reservation & Allocation"
        },
        "description": {
          "es": "Asignamos repuestos necesarios desde el almacén (juego de rodamientos de precisión SKF y lubricante sintético).",
          "en": "Reserving warehouse spare parts (SKF precision angular bearing kit and synthetic grease cartridge)."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Tareas Hijas y Validación de Cuadrilla",
          "en": "Child Tasks & Squad Completion Checklist"
        },
        "description": {
          "es": "Desglose de tareas técnicas asignadas a los electromecánicos y control de cumplimiento para el cierre de la OT.",
          "en": "Granular electromechanical task checklist tracking individual execution before formal work sign-off."
        }
      }
    ]
  },
  "04-04-tareas": {
    "lessonId": "04-04-tareas",
    "overview": {
      "es": "Ejecución técnica paso a paso: checklists interactivos, mediciones de parámetros y firmas en terreno.",
      "en": "Step-by-step task execution: interactive checklists, parameter readings, and field sign-offs."
    },
    "keyTakeaways": {
      "es": [
        "Checklists obligatorios con validación",
        "Registro de mediciones (presión, temperatura)",
        "Modo sin conexión en PWA"
      ],
      "en": [
        "Required checklist verification",
        "Parameter logging (pressure, temp)",
        "Full offline support on PWA"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilingüe de la Plataforma",
          "en": "Multilingual Platform Walkthrough"
        },
        "description": {
          "es": "Tablero operativo de tareas técnicas, control de ejecución y trazabilidad de cuadrillas.",
          "en": "Hands-on task board covering technician dispatch, kanban progression, and field notes."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Bandeja de Tareas Técnicas (/maintenance/tasks)",
          "en": "Work Tasks Operations Center (/maintenance/tasks)"
        },
        "description": {
          "es": "Espacio de trabajo para los electromecánicos y líderes de cuadrilla con vistas Lista y Kanban.",
          "en": "Operational dispatch hub for maintenance squads with list and kanban workflow views."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Alternancia de Visualización: Lista y Kanban",
          "en": "View Switcher: Table List & Visual Kanban"
        },
        "description": {
          "es": "Cambiamos a la vista Kanban para supervisar el flujo de trabajo ágil por columnas de estado.",
          "en": "Toggling to visual Kanban view to monitor live field workload across stage columns."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Columnas de Estado y Flujo Operativo",
          "en": "Kanban Stages & Workflow Pipeline"
        },
        "description": {
          "es": "Flujo visual: Por Hacer (Todo) → En Progreso → Pausada → Hecha (Done) → Retrabajo.",
          "en": "Pipeline stages: To Do → In Progress → Paused → Done → Rework."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Inspección de la Tarjeta de Tarea Técnica",
          "en": "Inspecting Technical Task Card"
        },
        "description": {
          "es": "Visualizamos la tarea vinculada a la OT del Torno CNC con prioridad alta y responsable asignado.",
          "en": "Reviewing CNC lathe corrective task with high priority flag and assigned technician."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Ficha y Panel de Ejecución de la Tarea",
          "en": "Task Technical Execution Drawer"
        },
        "description": {
          "es": "Revisamos descripción, checklists, orden de trabajo padre y activo origen de la contingencia.",
          "en": "Examining failure checklists, parent work order linkage, and shop-floor asset context."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Avance de Estado Operativo de la Tarea",
          "en": "Advancing Technical Progress State"
        },
        "description": {
          "es": "Avanzamos la tarea de \"Por Hacer\" a \"En Progreso\" registrando el inicio de los trabajos.",
          "en": "Moving task from \"To Do\" to \"In Progress\" to formally log shop floor labor start."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Bitácora de Campo y Comentarios Técnicos",
          "en": "Field Audit Log & Shift Handover Notes"
        },
        "description": {
          "es": "El operario ingresa observaciones de desmontaje y hallazgos mecánicos directamente en la bitácora.",
          "en": "Technicians log disassembly findings and inspection remarks directly into the audit stream."
        }
      }
    ]
  },
  "04-05-preventivos": {
    "lessonId": "04-05-preventivos",
    "overview": {
      "es": "Automatización de planes preventivos por calendario (mensual, anual) o por métrica de uso (horas de motor, km).",
      "en": "Automation of preventive plans by calendar schedule (monthly, annual) or meter usage (running hours, km)."
    },
    "keyTakeaways": {
      "es": [
        "Disparadores automáticos de órdenes",
        "Reducción proactiva de paradas no programadas",
        "Estimación de carga laboral"
      ],
      "en": [
        "Automatic order generation triggers",
        "Proactive reduction of unplanned downtime",
        "Workload capacity forecast"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilingüe de la Plataforma",
          "en": "Multilingual Platform Walkthrough"
        },
        "description": {
          "es": "Configuración de planes preventivos automatizados, calendarios y generación de OTs recurrentes.",
          "en": "Automated recurring maintenance routines, calendar projections, and triggered work orders."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Bandeja de Planes Preventivos (/maintenance/preventive-plans)",
          "en": "Preventive Maintenance Console (/maintenance/preventive-plans)"
        },
        "description": {
          "es": "Consola de gestión para programas de mantenimiento periódico por calendario y horómetro.",
          "en": "Central command for recurring schedules, calendar cron frequencies, and batch plan dispatch."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Creación de Nuevo Plan Preventivo",
          "en": "Setting Up a Preventive Plan"
        },
        "description": {
          "es": "Configuramos un plan recurrente para activos individuales o por plantilla de maquinaria.",
          "en": "Creating recurring preventive plans targeting specific assets or entire machine classes."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Parámetros del Plan y Frecuencia Cron",
          "en": "Plan Parameters & Cron Recurrence"
        },
        "description": {
          "es": "Definimos nombre, entidad generada (Orden de Trabajo o Tarea) y periodicidad semanal.",
          "en": "Specifying schedule title, generated target entity (Work Order or Task), and weekly recurrence."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Selección del Plan en la Matriz Operativa",
          "en": "Selecting the Active Plan"
        },
        "description": {
          "es": "Abrimos el panel lateral de supervisión para consultar la planificación y bitácora del plan.",
          "en": "Opening the right-hand inspection drawer to examine projections, logs, and linked outputs."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Pestaña Calendario: Proyecciones Futuras",
          "en": "Calendar Tab: Projected Scheduled Downtimes"
        },
        "description": {
          "es": "El motor calcula automáticamente las próximas fechas de ejecución y paradas de planta.",
          "en": "The system computes recurring maintenance windows across future shifts."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Pestaña Bitácora: Historial de Disparos",
          "en": "Execution Logs Tab: Trigger Provenance"
        },
        "description": {
          "es": "Registro auditable de cada ejecución cíclica indicando éxito, timestamp y disparador.",
          "en": "Immutable chronological trace recording schedule runs, execution statuses, and timestamps."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Pestaña Generados: Órdenes y Tareas Emitidas",
          "en": "Generated Items Tab: Work Orders & Tasks"
        },
        "description": {
          "es": "Trazabilidad directa con las Órdenes de Trabajo y Tareas Técnicas generadas por el plan.",
          "en": "Direct navigation links to work orders and technician tasks generated automatically."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Ejecución Forzada / Disparo Manual",
          "en": "Manual Trigger & Cycle Execution"
        },
        "description": {
          "es": "Demostramos cómo un supervisor puede adelantar o forzar el ciclo de mantenimiento sin alterar el cron.",
          "en": "Demonstrating supervisor override to immediately trigger a preventive run ahead of schedule."
        }
      }
    ]
  },
  "05-01-almacenes": {
    "lessonId": "05-01-almacenes",
    "overview": {
      "es": "Alta y administración de bodegas, pañoles técnicos y ubicaciones físicas de estantería.",
      "en": "Creation and management of warehouses, technician vans, and shelf bin locations."
    },
    "keyTakeaways": {
      "es": [
        "Múltiples almacenes físicos y móviles",
        "Estructura Almacén > Pasillo > Estante > Gaveta"
      ],
      "en": [
        "Multiple physical and mobile warehouses",
        "Warehouse > Aisle > Shelf > Bin structure"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilingüe de la Plataforma",
          "en": "Multilingual Platform Walkthrough"
        },
        "description": {
          "es": "Gestión de centros de almacenamiento, bodegas satélite y control de ubicaciones operativas.",
          "en": "Managing storage facilities, satellite parts rooms, and maintenance tool cribs."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Módulo de Almacenes (/inventory/warehouses)",
          "en": "Warehouse Management (/inventory/warehouses)"
        },
        "description": {
          "es": "Consola centralizada para registrar bodegas, talleres de mantenimiento y pañoles de herramientas.",
          "en": "Central console for setting up supply depots, shop-floor staging areas, and inventory locations."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Creación de Nuevo Almacén",
          "en": "Creating a New Warehouse"
        },
        "description": {
          "es": "Iniciamos el registro de una nueva instalación logística mediante el panel lateral.",
          "en": "Launching the registration drawer to add a physical storage location."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Código Identificador de Almacén",
          "en": "Warehouse Identifier Code"
        },
        "description": {
          "es": "Ingresamos la nomenclatura estandarizada para trazabilidad en órdenes de compra y consumo.",
          "en": "Entering standardized facility code used across procurement and work order bill of materials."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Nombre Descriptivo del Almacén",
          "en": "Warehouse Name"
        },
        "description": {
          "es": "Definimos el nombre operativo que verán los técnicos al solicitar piezas o registrar entradas.",
          "en": "Setting the recognizable name displayed to maintenance technicians during stock reservation."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Descripción y Alcance Operativo",
          "en": "Description & Scope"
        },
        "description": {
          "es": "Detallamos el propósito de la bodega y los tipos de componentes que resguarda.",
          "en": "Documenting facility scope and the categories of mechanical/electrical spares handled."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Confirmación y Guardado del Almacén",
          "en": "Submitting Warehouse Record"
        },
        "description": {
          "es": "Registramos el almacén en el sistema validando código único y estado activo.",
          "en": "Persisting the warehouse record into the tenant inventory master catalog."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Matriz de Almacenes Registrados",
          "en": "Active Warehouses Grid"
        },
        "description": {
          "es": "Exploramos los almacenes operativos, sus códigos de identificación y fechas de alta.",
          "en": "Reviewing operational warehouses, tracking status badges, and registration timestamps."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Base Lista para Control de Stock",
          "en": "Stock Management Foundation Complete"
        },
        "description": {
          "es": "Con los almacenes configurados, el sistema está listo para recibir existencias y transferencias.",
          "en": "With warehouses established, the facility is primed for stock balances and inventory transactions."
        }
      }
    ]
  },
  "05-02-stock": {
    "lessonId": "05-02-stock",
    "overview": {
      "es": "Control de saldos de stock, movimientos de entrada/salida y transferencias entre bodegas.",
      "en": "Inventory balances, stock receipts, issues, and transfers across multiple warehouses."
    },
    "keyTakeaways": {
      "es": [
        "Stock disponible vs reservado para OT",
        "Alertas automáticas de punto de reorden",
        "Trazabilidad por lote y serie"
      ],
      "en": [
        "Available vs WO-reserved stock",
        "Automatic reorder threshold alerts",
        "Lot and serial number tracking"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Demostración Multilingüe de la Plataforma",
          "en": "Multilingual Platform Walkthrough"
        },
        "description": {
          "es": "Supervisión en tiempo real de existencias, valorización de inventario y entradas de almacén.",
          "en": "Real-time inventory levels, stock valuation, receipts, and count adjustments."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Consola de Saldos de Stock (/inventory/stock)",
          "en": "Stock Management Console (/inventory/stock)"
        },
        "description": {
          "es": "Visualización integral de repuestos mecánicos, eléctricos y consumibles por centro logístico.",
          "en": "Centralized oversight of mechanical spares, electrical modules, and tooling across warehouses."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Métricas de Inventario y Valor Total",
          "en": "Inventory KPIs & Total Value"
        },
        "description": {
          "es": "Resumen ejecutivo de artículos en stock, valuación en moneda local y alertas de desabasto.",
          "en": "High-level metrics covering total items, capital valuation in local currency, and stockouts."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Filtro Dinámico por Almacén",
          "en": "Dynamic Warehouse Filter"
        },
        "description": {
          "es": "Filtramos el inventario por ubicación física o visualizamos el consolidado global de la planta.",
          "en": "Isolating stock balances by facility or viewing plant-wide consolidated inventory."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Matriz Detallada de Existencias y Costo Medio",
          "en": "Stock Balances & Weighted Average Cost"
        },
        "description": {
          "es": "Trazabilidad de existencias físicas, costo unitario promedio ponderado y última actualización.",
          "en": "Tracking on-hand quantities, weighted moving average costs, and latest adjustment timestamps."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Registro de Entrada / Ajuste de Stock",
          "en": "Registering Stock Receipt / Adjustment"
        },
        "description": {
          "es": "Abrimos el formulario lateral para ingresar nuevos repuestos o corregir desvíos de conteo.",
          "en": "Opening the adjustment drawer to record replenishment shipments or cycle count corrections."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Datos del Movimiento y Repuesto",
          "en": "Movement Parameters & Line Items"
        },
        "description": {
          "es": "Seleccionamos almacén destino, repuesto de catálogo, cantidad recibida y costo de adquisición.",
          "en": "Specifying destination warehouse, catalog spare part, quantity received, and unit cost."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Confirmación y Actualización de Saldos",
          "en": "Posting Movement & Balance Refresh"
        },
        "description": {
          "es": "Guardamos la recepción actualizando el stock disponible y recalculando el costo promedio.",
          "en": "Committing the transaction to immediately update on-hand quantities and moving average cost."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Control Integral de Inventario Operativo",
          "en": "Complete Operational Inventory Control"
        },
        "description": {
          "es": "Los técnicos y compras disponen de visibilidad exacta de refacciones para mantenimiento preventivo y correctivo.",
          "en": "Maintenance and supply chain teams operate with accurate parts availability for work orders."
        }
      }
    ]
  },
  "05-03-config": {
    "lessonId": "05-03-config",
    "overview": {
      "es": "Configuración general de políticas de inventario, valoración (FIFO / Costo Promedio Ponderado) y unidades de medida.",
      "en": "General inventory policy setup, valuation methods (FIFO / Weighted Average), and units of measure."
    },
    "keyTakeaways": {
      "es": [
        "Métodos de costeo contable",
        "Unidades de medida estandarizadas",
        "Políticas de control de mermas"
      ],
      "en": [
        "Accounting costing methods",
        "Standardized units of measurement",
        "Shrinkage & loss policies"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Parámetros Operativos de Inventario",
          "en": "Inventory Operating Parameters"
        },
        "description": {
          "es": "Configura las reglas de aprovisionamiento, consumo en órdenes de trabajo y control de stock.",
          "en": "Configure provisioning rules, consumption in work orders, and strict stock balance controls."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Modos de Operación (Interno, Externo, Híbrido)",
          "en": "Operating Modes (Internal, External, Hybrid)"
        },
        "description": {
          "es": "Define cómo interactúa el inventario con mantenimiento: compra externa directa, descuento de stock propio o modelo híbrido.",
          "en": "Define maintenance interaction: direct vendor purchase, automatic warehouse stock deduction, or a hybrid model."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Selección de Modo Interno",
          "en": "Selecting Internal Warehouse Mode"
        },
        "description": {
          "es": "Al activar Modo Interno, los repuestos utilizados en órdenes de trabajo descuentan existencias automáticamente.",
          "en": "With Internal Mode active, parts recorded in work orders automatically consume on-hand inventory."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Flexibilidad con Modo Híbrido",
          "en": "Hybrid Mode Flexibility"
        },
        "description": {
          "es": "El Modo Híbrido permite decidir por cada línea de repuesto si proviene de bodega central o compra externa.",
          "en": "Hybrid Mode lets engineers choose per work order item whether it is pulled from stock or procured externally."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Política de Stock Negativo",
          "en": "Negative Stock Policy"
        },
        "description": {
          "es": "Restringe transacciones si no hay existencias físicas reales, garantizando trazabilidad y auditoría estricta.",
          "en": "Rejects transactions when physical stock is insufficient, enforcing auditable inventory balances."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Persistencia de Parámetros",
          "en": "Persisting Settings"
        },
        "description": {
          "es": "Guardando los cambios aplicados en las políticas operativas del tenant Atlas Industrial.",
          "en": "Saving changes and applying operational warehouse policies for Atlas Industrial tenant."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Configuración Lista",
          "en": "Configuration Complete"
        },
        "description": {
          "es": "Los almacenes y las órdenes de trabajo ahora operan bajo las directivas de inventario configuradas.",
          "en": "Warehouses and maintenance work orders are now operating under the specified inventory directives."
        }
      }
    ]
  },
  "06-01-empleados": {
    "lessonId": "06-01-empleados",
    "overview": {
      "es": "Gestión de ficha de técnicos, especialistas, certificaciones de seguridad y tarifas horarias.",
      "en": "Technician profiles, certifications, security clearances, and standard hourly cost rates."
    },
    "keyTakeaways": {
      "es": [
        "Control de vencimiento de certificaciones",
        "Tarifas horarias para costeo de OT",
        "Datos de contacto para emergencias"
      ],
      "en": [
        "Certification expiry tracking",
        "Hourly labor rates for WO costing",
        "Emergency contact information"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Directorio de Personal y Técnicos",
          "en": "Maintenance Staff & Technicians Directory"
        },
        "description": {
          "es": "Gestiona la nómina operativa, especialidades técnicas y perfiles de acceso al sistema para mantenimiento.",
          "en": "Manage field technicians, operational roles, contact info, and system login permissions."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Filtros y Búsqueda de Personal",
          "en": "Filters and Staff Search"
        },
        "description": {
          "es": "Permite filtrar rápidamente entre personal activo, inactivo y buscar por nombre o especialidad.",
          "en": "Quickly filter between active and inactive personnel, or search by name and specialty."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Alta de Nuevo Empleado",
          "en": "Registering New Employee"
        },
        "description": {
          "es": "Iniciando el registro de un nuevo técnico electromecánico en el sistema.",
          "en": "Starting the registration sheet for a new electromechanical technician."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Datos Personales y Contacto",
          "en": "Personal & Contact Information"
        },
        "description": {
          "es": "Ingresando nombre, apellido, correo corporativo y teléfono de contacto para asignaciones en campo.",
          "en": "Entering name, surname, corporate email, and phone number for field work order assignments."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Puesto de Trabajo y Acceso al Sistema",
          "en": "Job Title & System Login Access"
        },
        "description": {
          "es": "Asigna el rol de catálogo técnico y genera automáticamente credenciales con permisos de rol de sistema.",
          "en": "Assigns technical catalog job title and provisions system user login with technical permissions."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Guardar y Generar Credenciales",
          "en": "Save & Generate Credentials"
        },
        "description": {
          "es": "Confirmando el alta del técnico y generando su contraseña temporal de acceso inicial.",
          "en": "Confirming registration and provisioning temporary first-login credentials for the technician."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Empleado Registrado con Éxito",
          "en": "Employee Successfully Registered"
        },
        "description": {
          "es": "El técnico queda incorporado en la nómina activa y listo para formar parte de cuadrillas y órdenes de trabajo.",
          "en": "The technician is now part of the active roster, ready to be assigned to teams and work orders."
        }
      }
    ]
  },
  "06-02-equipos": {
    "lessonId": "06-02-equipos",
    "overview": {
      "es": "Organización de cuadrillas operativas y asignación de líderes de equipo para despacho de trabajos.",
      "en": "Organization of work crews and appointment of crew leads for work dispatch."
    },
    "keyTakeaways": {
      "es": [
        "Cuadrillas multidisciplinarias",
        "Asignación masiva de órdenes",
        "Disponibilidad de turnos"
      ],
      "en": [
        "Multi-disciplinary crews",
        "Bulk order dispatch",
        "Shift calendar availability"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Gestión de Cuadrillas y Brigadas Operativas",
          "en": "Work Crews & Operational Brigades Management"
        },
        "description": {
          "es": "Organiza al personal técnico en equipos multidisciplinarios para la asignación ágil de órdenes de trabajo.",
          "en": "Organize technical personnel into multidisciplinary squads for agile work order scheduling."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Listado de Equipos de Mantenimiento",
          "en": "Maintenance Teams Directory"
        },
        "description": {
          "es": "Supervisa el número de miembros, especialidades y líderes asignados a cada frente de trabajo en planta.",
          "en": "Monitor total members, technical specialties, and designated team leads across plant operations."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Alta de Nuevo Equipo",
          "en": "Creating New Team"
        },
        "description": {
          "es": "Iniciando el formulario para conformar una brigada técnica especializada.",
          "en": "Opening registration sheet to build a new specialized maintenance crew."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Nombre y Alcance Operativo",
          "en": "Team Name & Operational Scope"
        },
        "description": {
          "es": "Definiendo la denominación de la cuadrilla y su responsabilidad operativa en planta.",
          "en": "Defining brigade designation and operational maintenance responsibilities."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Selección de Miembros Técnicos",
          "en": "Selecting Technician Members"
        },
        "description": {
          "es": "Incorporando técnicos calificados a la plantilla operativa del equipo.",
          "en": "Adding qualified field technicians to the crew roster."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Designación de Líder de Equipo (Team Lead)",
          "en": "Designating Team Lead"
        },
        "description": {
          "es": "Asignando el rol de Líder técnico para la supervisión y cierre de órdenes en campo.",
          "en": "Assigning technical lead responsibility for field supervision and work order sign-offs."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Guardar y Conformar Cuadrilla",
          "en": "Save & Establish Crew"
        },
        "description": {
          "es": "Confirmando la creación del equipo con su respectivo líder y miembros asignados.",
          "en": "Confirming team creation with assigned lead and technician members."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Cuadrilla Habilitada",
          "en": "Crew Ready for Field Action"
        },
        "description": {
          "es": "El equipo de mantenimiento está listo para ser asignado en planes preventivos y órdenes correctivas.",
          "en": "The maintenance team is now active and ready for work orders and preventive schedule assignments."
        }
      }
    ]
  },
  "07-01-plantillas": {
    "lessonId": "07-01-plantillas",
    "overview": {
      "es": "Diseño y automatización de notificaciones por email para alertas de incidencias y cambios de estado.",
      "en": "Design and automation of email notifications for incident alerts and workflow status changes."
    },
    "keyTakeaways": {
      "es": [
        "Variables dinámicas (ej: {{asset_name}})",
        "Disparadores automáticos por evento",
        "Editor visual enriquecido"
      ],
      "en": [
        "Dynamic variables (e.g. {{asset_name}})",
        "Event-driven automated triggers",
        "Rich visual template editor"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Gestor de Plantillas de Notificación",
          "en": "Notification & Communication Templates Manager"
        },
        "description": {
          "es": "Centraliza las comunicaciones por correo electrónico y reportes documentales generados para activos, incidencias y órdenes.",
          "en": "Centralize automated email notifications and PDF printable documents for assets, incidents, and work orders."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Filtros por Ámbito y Formato",
          "en": "Scope & Template Type Filters"
        },
        "description": {
          "es": "Filtra plantillas asociadas a Incidencias, Órdenes de Trabajo o Activos, diferenciando correos de reportes imprimibles.",
          "en": "Filter templates linked to Incidents, Maintenance Orders, or Assets, separating emails from printable reports."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Crear Nueva Plantilla",
          "en": "Create New Template"
        },
        "description": {
          "es": "Iniciando el configurador visual para definir código, ámbito de entidad y formato de salida.",
          "en": "Opening the configuration sheet to define template code, entity scope, and document format."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Código y Ámbito de Entidad",
          "en": "Code & Entity Scope Definition"
        },
        "description": {
          "es": "Asignamos código único corporativo y vinculamos la plantilla al ciclo de vida de Órdenes de Trabajo.",
          "en": "Assigning a corporate unique code and binding the template to Maintenance Orders lifecycle events."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Diseño Bilingüe y Variables Dinámicas",
          "en": "Bilingual Content & Dynamic Placeholders"
        },
        "description": {
          "es": "Permite redactar el asunto y cuerpo HTML con placeholders como {order.id}, {asset.name} y {recipient.name}.",
          "en": "Craft localized subjects and HTML body with dynamic variables like {order.id}, {asset.name}, and {recipient.name}."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Previsualización con Datos de Muestra",
          "en": "Render Preview with Sample Data"
        },
        "description": {
          "es": "Inspeccionando el renderizado final del documento con variables dinámicas resueltas antes de publicarlo.",
          "en": "Inspecting final document layout with resolved mock data before rolling it out to production."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Publicación y Control de Versiones",
          "en": "Publishing & Version History"
        },
        "description": {
          "es": "Guardando la versión activa de la plantilla con historial completo de cambios y auditoría.",
          "en": "Saving the active template version with audit logs and version rollback capabilities."
        }
      },
      {
        "number": 9,
        "title": {
          "es": "Plantilla Habilitada",
          "en": "Template Ready for Dispatch"
        },
        "description": {
          "es": "El sistema enviará notificaciones y generará reportes automáticamente utilizando esta plantilla.",
          "en": "Asset Hub will automatically dispatch notifications and format work orders with this standardized layout."
        }
      }
    ]
  },
  "08-01-tenant": {
    "lessonId": "08-01-tenant",
    "overview": {
      "es": "Ajustes globales del tenant: logo de la empresa, colores corporativos, moneda y zona horaria.",
      "en": "Global tenant configuration: company logo branding, corporate colors, currency, and timezone."
    },
    "keyTakeaways": {
      "es": [
        "Personalización de marca",
        "Configuración regional",
        "Parámetros fiscales de la empresa"
      ],
      "en": [
        "White-label brand customization",
        "Regional localization setup",
        "Corporate tax parameters"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Configuración Corporativa del Tenant",
          "en": "Corporate Tenant Configuration"
        },
        "description": {
          "es": "Personaliza la identidad visual de la empresa, canales de soporte y enrutamiento de notificaciones automáticas.",
          "en": "Customize enterprise visual identity, technical support channels, and automated notification triggers."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Identidad y Correo de Soporte Técnico",
          "en": "Branding & Technical Support Channel"
        },
        "description": {
          "es": "Configura el logotipo corporativo y el buzón oficial para la atención de incidencias en planta.",
          "en": "Manage company logo and official support inbox for plant incident escalations."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Actualización de Contacto Operativo",
          "en": "Updating Operational Contact"
        },
        "description": {
          "es": "Estableciendo el correo de mesa de ayuda técnica institucional de Atlas Industrial.",
          "en": "Setting the institutional technical helpdesk email for Atlas Industrial."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Guardar Identidad Corporativa",
          "en": "Saving Corporate Identity"
        },
        "description": {
          "es": "Persistiendo los cambios visuales y de contacto para todos los usuarios del tenant.",
          "en": "Applying branding and contact updates across all workspace users."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Pestaña de Notificaciones del Sistema",
          "en": "System Notifications Tab"
        },
        "description": {
          "es": "Mapea eventos operativos del ciclo de vida con plantillas de correo personalizadas.",
          "en": "Map core lifecycle events to custom localized email communication templates."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Enlace de Evento de Incidencias",
          "en": "Incident Event Template Binding"
        },
        "description": {
          "es": "Asigna la plantilla corporativa activa para alertas inmediatas al reportarse una parada no programada.",
          "en": "Bind critical stoppage alerts to the standardized corporate incident notification template."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Configuración Completa",
          "en": "Configuration Applied"
        },
        "description": {
          "es": "Los parámetros de marca y automatización de alertas quedan listos y operando.",
          "en": "Tenant visual identity and automated event notifications are fully operational."
        }
      }
    ]
  },
  "08-02-roles": {
    "lessonId": "08-02-roles",
    "overview": {
      "es": "Control de acceso basado en roles (RBAC): permisos granulares de lectura, creación, edición y borrado.",
      "en": "Role-Based Access Control (RBAC): fine-grained read, write, update, and delete permissions."
    },
    "keyTakeaways": {
      "es": [
        "Matriz de permisos por módulo",
        "Separación de funciones (técnicos vs auditores)",
        "Seguridad empresarial"
      ],
      "en": [
        "Per-module permission matrix",
        "Segregation of duties (technicians vs auditors)",
        "Enterprise security"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Gestión de Seguridad y Roles Granulares",
          "en": "Security Management & Granular Roles"
        },
        "description": {
          "es": "Administra los perfiles de acceso mediante un esquema RBAC con permisos por módulo funcional.",
          "en": "Enforce access control using an RBAC model with fine-grained permissions per functional module."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Matriz de Roles del Sistema",
          "en": "System & Custom Roles Matrix"
        },
        "description": {
          "es": "Supervisa los roles predeterminados del sistema y los roles personalizados configurados en la organización.",
          "en": "Inspect pre-configured tenant default roles alongside organization-specific custom profiles."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Creación de Nuevo Rol Personalizado",
          "en": "Create New Custom Role"
        },
        "description": {
          "es": "Iniciando el configurador para diseñar un rol técnico con permisos restringidos de auditoría y campo.",
          "en": "Opening the role creator to craft a custom technical profile with targeted access rights."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Nombre y Alcance del Rol",
          "en": "Role Name & Scope Description"
        },
        "description": {
          "es": "Definiendo la denominación institucional y responsabilidades del perfil de seguridad.",
          "en": "Setting institutional title and responsibility boundaries for the security profile."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Selección de Permisos por Módulo",
          "en": "Modular Permission Selection"
        },
        "description": {
          "es": "Activando capacidades específicas para la lectura de activos y reporte de órdenes de trabajo.",
          "en": "Granting specific scopes for asset inspection and maintenance work orders execution."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Guardar y Publicar Rol RBAC",
          "en": "Save & Deploy RBAC Role"
        },
        "description": {
          "es": "Persistiendo el nuevo perfil de seguridad, listo para ser asignado a técnicos y supervisores.",
          "en": "Persisting the security role, immediately available for assignment to field staff."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Rol de Seguridad Habilitado",
          "en": "Security Role Activated"
        },
        "description": {
          "es": "El esquema de control de acceso queda reforzado con políticas y permisos precisos.",
          "en": "Role-based access control is now reinforced with audited granular privileges."
        }
      }
    ]
  },
  "08-03-usuarios": {
    "lessonId": "08-03-usuarios",
    "overview": {
      "es": "Invitación, activación y gestión de usuarios del sistema con asignación de roles y estados de cuenta.",
      "en": "Invitation, provisioning, and administration of system users with role assignment and status control."
    },
    "keyTakeaways": {
      "es": [
        "Invitaciones por correo electrónico",
        "Bloqueo temporal de cuentas",
        "Historial de sesiones activas"
      ],
      "en": [
        "Email invitation onboarding",
        "Account lock / unlock triggers",
        "Active session logs"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Directorio de Cuentas de Acceso",
          "en": "User Accounts Directory"
        },
        "description": {
          "es": "Administra los usuarios autorizados, credenciales, estados de cuenta e invitaciones pendientes en Atlas Industrial.",
          "en": "Manage authorized users, security roles, account active states, and onboarding invitations."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Listado de Usuarios y Roles Asignados",
          "en": "Active Users & Assigned Roles"
        },
        "description": {
          "es": "Supervisa el estado activo/inactivo, último acceso registrado y perfiles RBAC vinculados a cada cuenta.",
          "en": "Monitor active/inactive status, last session timestamps, and linked RBAC roles per user account."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Invitar Nuevo Colaborador",
          "en": "Invite New Teammate"
        },
        "description": {
          "es": "Iniciando el modal de invitación corporativa segura por correo electrónico.",
          "en": "Opening the enterprise secure email invitation dialog."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Buzón Corporativo y Rol de Seguridad",
          "en": "Corporate Email & Role Assignment"
        },
        "description": {
          "es": "Especificando el correo del destinatario y el rol operativo que desempeñará en la plataforma.",
          "en": "Specifying the recipient email address and pre-assigning operational security permissions."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Enviar Invitación y Generar Token",
          "en": "Dispatch Invite & Generate Token"
        },
        "description": {
          "es": "Generando el enlace de incorporación temporal y remitiendo la notificación de bienvenida.",
          "en": "Creating temporary onboarding link and dispatching corporate invitation email."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Pestaña de Invitaciones Pendientes",
          "en": "Pending Invitations Tab"
        },
        "description": {
          "es": "Permite auditar solicitudes enviadas, copiar el link directo de onboarding o reenviar el acceso.",
          "en": "Audit outgoing onboarding requests, copy direct registration links, or resend notifications."
        }
      },
      {
        "number": 8,
        "title": {
          "es": "Gestión de Acceso Lista",
          "en": "User Access Control Ready"
        },
        "description": {
          "es": "El flujo de incorporación e invitación de nuevos colaboradores queda auditado y operativo.",
          "en": "Collaborator onboarding and identity provisioning workflows are fully verified."
        }
      }
    ]
  },
  "08-04-cuenta": {
    "lessonId": "08-04-cuenta",
    "overview": {
      "es": "Seguridad personal del usuario: cambio de contraseña y autenticación de dos factores (MFA).",
      "en": "Personal user account security: password updates and Multi-Factor Authentication (MFA)."
    },
    "keyTakeaways": {
      "es": [
        "Autenticación con TOTP (Google Authenticator)",
        "Códigos de recuperación de emergencia",
        "Sesiones seguras"
      ],
      "en": [
        "TOTP 2FA authenticator app pairing",
        "Emergency recovery codes",
        "Secure session revocation"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Gestión de Cuenta y Perfil del Colaborador",
          "en": "Account & User Profile Management"
        },
        "description": {
          "es": "Permite al personal técnico y directivo actualizar su perfil institucional y proteger su acceso con seguridad avanzada.",
          "en": "Allows technical and executive staff to maintain their profile and enforce high-standard security safeguards."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Información Personal y Preferencias",
          "en": "Personal Information & Preferences"
        },
        "description": {
          "es": "Revisión del nombre corporativo, correo electrónico institucional e idioma de interfaz preferido.",
          "en": "Reviewing corporate name, institutional email address, and interface language settings."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Actualización de Perfil",
          "en": "Updating Profile Information"
        },
        "description": {
          "es": "Confirmando los cambios en los datos de contacto y preferencias regionales del usuario.",
          "en": "Saving changes to contact details and regional preferences."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Pestaña de Seguridad y Contraseña",
          "en": "Security & Password Management Tab"
        },
        "description": {
          "es": "Módulo para la renovación periódica de credenciales respetando políticas de complejidad.",
          "en": "Dedicated module for periodic credential updates adhering to password complexity policies."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Autenticación Multifactor (MFA / 2FA)",
          "en": "Multi-Factor Authentication (MFA / 2FA)"
        },
        "description": {
          "es": "Protección reforzada para roles críticos que previene accesos no autorizados mediante código TOTP de un solo uso.",
          "en": "Enhanced protection for privileged accounts preventing unauthorized logins using time-based TOTP tokens."
        }
      },
      {
        "number": 7,
        "title": {
          "es": "Perfil y Seguridad Listos",
          "en": "Account Security Configured"
        },
        "description": {
          "es": "La cuenta de usuario cuenta con máxima protección y directivas de seguridad corporativa activas.",
          "en": "User profile and enterprise security protections are fully operational."
        }
      }
    ]
  },
  "09-01-kpis": {
    "lessonId": "09-01-kpis",
    "overview": {
      "es": "Monitoreo de KPIs de confiabilidad operacional: MTBF (Tiempo Medio Entre Fallas), MTTR (Tiempo Medio de Reparación) y Disponibilidad.",
      "en": "Operational reliability KPI monitoring: MTBF (Mean Time Between Failures), MTTR (Mean Time to Repair), and Availability."
    },
    "keyTakeaways": {
      "es": [
        "Métricas de confiabilidad industrial",
        "Gráficos de tendencia de costos",
        "Filtro por criticidad y período"
      ],
      "en": [
        "Industrial reliability benchmarks",
        "Cost trend analytics charts",
        "Criticality and date range filters"
      ]
    },
    "steps": [
      {
        "number": 1,
        "title": {
          "es": "Selector de Idioma",
          "en": "Language Selector"
        },
        "description": {
          "es": "Demostración de la plataforma en idioma Español y configuración regional activa.",
          "en": "Platform demonstration with English locale and active regional settings."
        }
      },
      {
        "number": 2,
        "title": {
          "es": "Centro de Inteligencia Operativa y Mantenimiento",
          "en": "Operational Intelligence & Maintenance Command Center"
        },
        "description": {
          "es": "Monitorea en tiempo real los indicadores clave de rendimiento (KPIs), confiabilidad de activos y costos acumulados de ciclo de vida.",
          "en": "Monitor real-time maintenance KPIs, plant reliability benchmarks, and lifecycle cost accumulation."
        }
      },
      {
        "number": 3,
        "title": {
          "es": "Métricas de Confiabilidad (MTBF y MTTR)",
          "en": "Reliability Metrics (MTBF & MTTR)"
        },
        "description": {
          "es": "Calcula el Tiempo Medio Entre Fallas (MTBF) y Tiempo Medio de Reparación (MTTR) a nivel global o por activo individual.",
          "en": "Calculates Mean Time Between Failures (MTBF) and Mean Time to Repair (MTTR) globally or per asset unit."
        }
      },
      {
        "number": 4,
        "title": {
          "es": "Desglose del Costo Total de Propiedad (TCO)",
          "en": "Total Cost of Ownership (TCO) Breakdown"
        },
        "description": {
          "es": "Analiza los costos acumulados distinguiendo entre mano de obra técnica, consumo de repuestos y servicios externos contratados.",
          "en": "Analyzes lifecycle expenditures segregated across labor hours, spare parts consumption, and third-party contracts."
        }
      },
      {
        "number": 5,
        "title": {
          "es": "Ranking de Confiabilidad por Activo",
          "en": "Asset Reliability Ranking"
        },
        "description": {
          "es": "Identifica los equipos críticos con mayor tasa de intervención correctiva y horas de parada en planta.",
          "en": "Spotlights high-criticality machinery with highest failure frequencies and cumulative downtime in the factory."
        }
      },
      {
        "number": 6,
        "title": {
          "es": "Panel Analítico Listo",
          "en": "Operational Dashboard Verified"
        },
        "description": {
          "es": "Toda la telemetría operativa y financiera del parque de activos se consolida para la toma de decisiones informadas.",
          "en": "Asset operational telemetry and maintenance financials are synchronized for strategic decision-making."
        }
      }
    ]
  }
};
