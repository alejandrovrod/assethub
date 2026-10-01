// Adds the LandingPage inline-ternary content to landing.json (es + en),
// keeping both locales structurally identical.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'frontend', 'apps', 'web', 'src', 'locales')

const additions = {
  es: {
    banner: {
      release: 'Nueva versión con Mapeo Geoespacial y Máquinas de Estado configurables.',
      learnMore: 'Ver novedades',
    },
    logos: [
      { name: 'TechCorp Global', tag: 'Tech' },
      { name: 'VialConcesiones', tag: 'Infraestructura' },
      { name: 'Hospital Metropolitano', tag: 'Salud' },
      { name: 'Energía del Norte', tag: 'Energía' },
      { name: 'Logística Express', tag: 'Transporte' },
      { name: 'Industrial Solutions', tag: 'Manufactura' },
    ],
    featuresTabsExplore: 'Explorar módulo',
    gridCards: [
      {
        title: 'Geolocalización Poligonal',
        desc: 'Dibuja zonas perimetrales en carreteras o parques industriales. Filtra activos en tiempo real por índice de riesgo y criticidad.',
      },
      {
        title: 'Bitácora Inmutable de Eventos',
        desc: 'Cada cambio de estado queda registrado con firma de usuario, estampa temporal y observaciones para auditorías sin fisuras.',
      },
      {
        title: 'Jerarquía de Componentes',
        desc: 'Estructura arbórea infinita: vincula activos padre con subsistemas, luminarias, bombas y piezas de recambio.',
      },
    ],
    multitenantRouting: 'Enrutamiento Aislado por Cliente',
    multitenantSubdomains: 'subdominios empresariales activos',
    testimonialsItems: [
      {
        quote: 'AssetHub transformó radicalmente la manera en que coordinamos cuadrillas y gestionamos 4,000 activos en ruta. El tiempo de respuesta a incidencias bajó un 42% en el primer trimestre.',
        author: 'Ing. Martín Peralta',
        role: 'Director de Mantenimiento • Autopistas del Norte',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=face',
      },
      {
        quote: 'La arquitectura multi-tenant nos permitió darle a cada hospital cliente su propio subdominio con reportes SLA en vivo. Pasamos de planillas desactualizadas a trazabilidad quirúrgica.',
        author: 'Dra. Valeria Gómez',
        role: 'Gerente de Operaciones Médicas • BioCare Facilities',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
      },
      {
        quote: 'Poder diseñar plantillas con atributos personalizados y máquinas de estados sin tocar código es el mayor diferencial. No existe otra plataforma que entienda tan bien la realidad de campo.',
        author: 'Carlos Méndez',
        role: 'Líder Técnico de Confiabilidad • EnerGrid',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=face',
      },
    ],
    faqItems: [
      {
        q: '¿Qué diferencia a AssetHub de un CMMS o software tradicional?',
        a: 'A diferencia de herramientas rígidas, AssetHub te permite modelar cualquier tipo de activo con plantillas dinámicas, máquinas de estados y jerarquías personalizadas. Además incluye soporte nativo multi-tenant para proveedores de servicios que administran múltiples clientes.',
      },
      {
        q: '¿Cómo funciona el aislamiento en el esquema multi-tenant?',
        a: 'Cada cliente puede acceder mediante su propio subdominio (ej: cliente.tuempresa.app). Las sesiones, datos de activos, bitácoras y permisos quedan completamente aislados por tenant, con la opción de despachadores globales autorizados.',
      },
      {
        q: '¿Pueden los técnicos usar la plataforma desde el celular sin instalar nada?',
        a: 'Sí, la plataforma está construida con una arquitectura web responsiva de alta velocidad. Los técnicos pueden abrir órdenes de trabajo, completar checklists y registrar fotos directamente desde el navegador de su teléfono o tablet.',
      },
      {
        q: '¿Se pueden exportar e integrar los datos de activos e incidencias?',
        a: 'Totalmente. Contamos con endpoints API seguros y opciones de exportación para conectar AssetHub con tus sistemas ERP, bases de datos analíticas o herramientas contables.',
      },
    ],
    cta: {
      title: '¿Listo para profesionalizar tus activos?',
      subtitle: 'Sumate a las organizaciones líderes que operan con trazabilidad total y cero fricción.',
      contact: 'Contactar a un Asesor',
    },
    footer: { rights: 'Todos los derechos reservados.' },
  },
  en: {
    banner: {
      release: 'New release with Geospatial Mapping and configurable Finite State Machines.',
      learnMore: 'Learn more',
    },
    logos: [
      { name: 'TechCorp Global', tag: 'Tech' },
      { name: 'VialConcesiones', tag: 'Infrastructure' },
      { name: 'Hospital Metropolitano', tag: 'Healthcare' },
      { name: 'Energía del Norte', tag: 'Energy' },
      { name: 'Logística Express', tag: 'Transport' },
      { name: 'Industrial Solutions', tag: 'Manufacturing' },
    ],
    featuresTabsExplore: 'Explore module',
    gridCards: [
      {
        title: 'Geospatial Polygon Mapping',
        desc: 'Draw perimeter zones across highways or industrial yards. Filter assets in real-time by operational risk index.',
      },
      {
        title: 'Immutable Event Audit Trail',
        desc: 'Every lifecycle state transition is logged with user signature, timestamp, and audit notes for flawless compliance.',
      },
      {
        title: 'Component Tree Hierarchy',
        desc: 'Infinite parent-child relations: link major assets with subcomponents, luminaires, valves, and spare parts.',
      },
    ],
    multitenantRouting: 'Isolated Tenant Routing',
    multitenantSubdomains: 'active corporate subdomains',
    testimonialsItems: [
      {
        quote: 'AssetHub completely transformed how we coordinate field crews and track 4,000 highway assets. Incident response times dropped 42% in our very first quarter.',
        author: 'Ing. Martín Peralta',
        role: 'Maintenance Director • Northern Highways',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=face',
      },
      {
        quote: 'The multi-tenant architecture allowed us to provide each hospital client with their own subdomain and live SLA audits. We went from messy spreadsheets to surgical precision.',
        author: 'Dra. Valeria Gómez',
        role: 'Head of Medical Operations • BioCare Facilities',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
      },
      {
        quote: 'Being able to design asset templates with dynamic schemas and finite state machines without coding is an absolute game-changer. Unmatched operational depth.',
        author: 'Carlos Méndez',
        role: 'Reliability Lead • EnerGrid',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=face',
      },
    ],
    faqItems: [
      {
        q: 'What sets AssetHub apart from traditional CMMS software?',
        a: 'Unlike rigid legacy software, AssetHub lets you model any physical asset with dynamic schemas, customizable state machines, and multi-level hierarchies. It also provides native multi-tenancy for service providers managing multiple client portals.',
      },
      {
        q: 'How does tenant isolation work in the multi-tenant architecture?',
        a: 'Each client logs in via their dedicated subdomain (e.g., client.yourdomain.app). Sessions, asset registries, audit logs, and permissions are strictly isolated per tenant, with optional cross-tenant dispatching roles.',
      },
      {
        q: 'Can field technicians use the platform on mobile without app store downloads?',
        a: 'Yes, our web client is completely mobile-responsive and optimized for touch devices. Field workers can access work orders, checklists, and incident forms right from mobile browsers.',
      },
      {
        q: 'Can we export and integrate asset and incident data?',
        a: 'Absolutely. AssetHub provides secure REST APIs and structured export capabilities to sync with your existing ERPs, analytical warehouses, or financial reporting tools.',
      },
    ],
    cta: {
      title: 'Ready to professionalize your operations?',
      subtitle: 'Join industry leaders who manage critical infrastructure with total transparency and zero friction.',
      contact: 'Contact Sales',
    },
    footer: { rights: 'All rights reserved.' },
  },
}

for (const lang of ['es', 'en']) {
  const file = join(root, lang, 'landing.json')
  const current = JSON.parse(readFileSync(file, 'utf8'))
  const add = additions[lang]

  current.banner = add.banner
  current.logos = add.logos
  current.featuresTabs.explore = add.featuresTabsExplore
  current.grid.cards = add.gridCards
  current.multitenant.routing = add.multitenantRouting
  current.multitenant.subdomains = add.multitenantSubdomains
  current.testimonials.items = add.testimonialsItems
  current.faq.items = add.faqItems
  current.cta = add.cta
  current.footer = add.footer

  writeFileSync(file, JSON.stringify(current, null, 2) + '\n', 'utf8')
  console.log(`${lang}: updated`)
}

// verify structural parity
const es = JSON.parse(readFileSync(join(root, 'es', 'landing.json'), 'utf8'))
const en = JSON.parse(readFileSync(join(root, 'en', 'landing.json'), 'utf8'))
const walk = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? walk(v, p + k + '.') : [p + k]
  )
const a = walk(es).sort()
const b = walk(en).sort()
const onlyEs = a.filter((k) => !b.includes(k))
const onlyEn = b.filter((k) => !a.includes(k))
console.log(`keys es=${a.length} en=${b.length}`)
if (onlyEs.length || onlyEn.length) {
  console.log('MISMATCH onlyEs=', onlyEs, 'onlyEn=', onlyEn)
  process.exit(1)
}
console.log('parity OK')
