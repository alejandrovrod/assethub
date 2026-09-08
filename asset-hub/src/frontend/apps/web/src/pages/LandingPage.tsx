import { useEffect, useState, useRef } from "react";
import { Link } from "react-router";
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import heroBg from '../assets/hero-bg-network-text.jpg';

// --- TRANSLATIONS ---
const translations = {
  en: {
    nav: { platform: "Platform", multitenant: "Multi-tenant", pricing: "Pricing", login: "Log in", start: "Start Free" },
    hero: { badge: "Operations platform", title1: "Make every asset", title2: "traceable.", subtitle: "Centralize assets, incidents, maintenance, and field work in one operational flow.", cta: "Start now", demo: "See how it works" },
    hero_cards: { assets: "Critical Assets", assets_status: "Hospital, Highway...", incidents: "Incidents", incidents_status: "2 Alerts", orders: "Work Orders", orders_status: "Staff & Equipment", prediction: "AI Prediction", prediction_status: "Optimizing" },
    mockup: { activeOrders: "Active Work Orders", subtitle: "Multi-site maintenance coordination.", preventive: "Preventive Maintenance", inProgress: "In Progress", sla: "Global SLA Compliance", slaDesc: "Target is 98.0% for active contracts." },
    social: "Trusted by industry leaders",
    features: { title: "Everything you need to deliver flawless maintenance.", f1_title: "Asset Templates", f1_desc: "Define custom attributes, lifecycles, and checklists for any type of asset. Create them once and reuse them across your entire organization.", f2_title: "Live Asset Tracking", f2_desc: "Comprehensive operational profiling: dynamic attributes, geospatial mapping, historical timeline, and component hierarchy.", f3_title: "Integrated Maintenance", f3_desc: "End-to-end management: from incident templates to incidents, work orders, and field tasks.", f4_title: "Resource Management", f4_desc: "Control dynamic catalogs, manage your staff and teams, and administer users with roles and permissions." },
    multitenant: { title: "Strict isolation for every client.", subtitle: "Offer your clients a personalized, white-labeled experience. They log into their own portal, see only their assets, and review their specific SLAs.", point1_title: "Custom Subdomains", point1_desc: "client.assethub.app routing instantly isolates sessions and databases.", point2_title: "Cross-tenant RBAC", point2_desc: "Global dispatchers manage everything. Client managers see read-only reports.", card_title: "Tenant Architecture", card_tag: "Secure", clients: ["hospital-network.tuempresa.app", "gym-chain.tuempresa.app", "highway-tolls.tuempresa.app"] },
    pricing: { title: "Simple, scalable pricing.", subtitle: "Pay for the volume of assets you manage. No hidden fees.", p1_title: "Starter", p1_desc: "For internal operations.", p1_price: "$149", p1_f1: "Up to 500 assets", p1_f2: "Preventive & Corrective WOs", p1_f3: "Mobile App access", p1_f4: "No multi-tenant portals", p1_btn: "Get Started", p2_tag: "POPULAR", p2_title: "Professional", p2_desc: "For Service Providers.", p2_price: "$489", p2_f1: "Unlimited assets & tenants", p2_f2: "Custom client subdomains", p2_f3: "Advanced SLA reporting", p2_f4: "White-label options", p2_btn: "Start Free Trial" }
  },
  es: {
    nav: { platform: "Plataforma", multitenant: "Multi-tenant", pricing: "Planes", login: "Iniciar Sesión", start: "Comenzar" },
    hero: { badge: "Plataforma de operaciones", title1: "Convertí cada activo", title2: "en una operación trazable.", subtitle: "Centralizá activos, incidencias, mantenimiento y tareas en un solo flujo operativo.", cta: "Comenzar ahora", demo: "Ver cómo funciona" },
    hero_cards: { assets: "Activos Críticos", assets_status: "Hospital, Carretera...", incidents: "Incidencias", incidents_status: "2 Alertas", orders: "Órdenes de Trabajo", orders_status: "Personal y Equipo", prediction: "Predicción AI", prediction_status: "Optimizando" },
    mockup: { activeOrders: "Órdenes Activas", subtitle: "Coordinación de mantenimiento multi-sitio.", preventive: "Mantenimiento Preventivo", inProgress: "En Proceso", sla: "Cumplimiento de SLA Global", slaDesc: "El objetivo es 98.0% para contratos activos." },
    social: "Elegido por líderes de la industria",
    features: { title: "Todo lo que necesitas para una operación impecable.", f1_title: "Plantillas de Activos", f1_desc: "Define atributos, ciclos de vida y checklists personalizados para cualquier tipo de activo. Créalas una vez y reutilízalas en toda tu organización.", f2_title: "Gestión de Activos 360°", f2_desc: "Control total de cada activo: atributos dinámicos, geolocalización, bitácora de estados y estructura jerárquica en tiempo real.", f3_title: "Mantenimiento Integral", f3_desc: "Gestión punta a punta: desde plantillas de incidencias hasta su resolución mediante órdenes de trabajo y tareas en campo.", f4_title: "Administración de Recursos", f4_desc: "Controla catálogos dinámicos, gestiona a tu personal y equipos de trabajo, y administra usuarios con roles y permisos." },
    multitenant: { title: "Aislamiento estricto por cliente.", subtitle: "Ofrece a tus clientes una experiencia personalizada. Ingresan a su propio portal, ven solo sus activos y revisan sus SLAs específicos.", point1_title: "Subdominios Personalizados", point1_desc: "El enrutamiento aísla instantáneamente sesiones y bases de datos.", point2_title: "RBAC Multi-cliente", point2_desc: "Los despachadores globales gestionan todo. Los clientes ven reportes de solo lectura.", card_title: "Arquitectura Multi-tenant", card_tag: "Seguro", clients: ["hospitales.tuempresa.app", "vialnorte.tuempresa.app", "fitlife.tuempresa.app"] },
    pricing: { title: "Planes escalables.", subtitle: "Paga por el volumen de activos. Sin costos ocultos.", p1_title: "Starter", p1_desc: "Uso Interno.", p1_price: "$149", p1_f1: "Hasta 500 activos registrados", p1_f2: "Órdenes preventivas y correctivas", p1_f3: "App móvil para técnicos", p1_f4: "Sin portales multi-cliente", p1_btn: "Seleccionar Starter", p2_tag: "IDEAL SERVICIOS", p2_title: "Professional", p2_desc: "Multi-Cliente.", p2_price: "$489", p2_f1: "Activos y tenants ilimitados", p2_f2: "Subdominios por cliente", p2_f3: "Reportes SLA avanzados", p2_f4: "Opciones de marca blanca", p2_btn: "Prueba Gratuita" }
  }
};
// --------------------

const RevealText = ({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) => {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (domRef.current) observer.unobserve(domRef.current);
        }
      });
    }, { threshold: 0.1 });
    if (domRef.current) observer.observe(domRef.current);
    return () => { if (domRef.current) observer.unobserve(domRef.current); };
  }, []);

  return (
    <div 
      ref={domRef}
      className={`transition-all duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

const BrowserFrame = ({ 
  children, 
  url = "assethub.app/activos/nave-b-patio-sur"
}: { 
  children: React.ReactNode; 
  url?: string;
}) => {
  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-black/[0.08] bg-white shadow-md flex flex-col group/browser">
      {/* Chrome Top Bar */}
      <div className="h-7 bg-[#edf4fb] border-b border-[#dbe6f2] px-3.5 flex items-center shrink-0">
        {/* Three light-blue / pastel window control dots */}
        <div className="flex items-center gap-1.5 w-14">
          <div className="w-2.5 h-2.5 rounded-full bg-[#cbdcf0] group-hover/browser:bg-[#ff5f56] transition-colors"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#cbdcf0] group-hover/browser:bg-[#ffbd2e] transition-colors"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#cbdcf0] group-hover/browser:bg-[#27c93f] transition-colors"></div>
        </div>

        {/* Center URL pill */}
        <div className="flex-1 flex justify-center">
          <div className="h-4.5 w-32 sm:w-44 md:w-60 bg-[#dbe8f6] rounded-full flex items-center justify-center px-2.5 gap-1.5">
            <span className="material-symbols-outlined text-[10px] text-slate-400">lock</span>
            <span className="text-[9px] md:text-[10px] text-slate-600 font-mono tracking-tight truncate select-none">
              {url}
            </span>
          </div>
        </div>

        <div className="w-14"></div>
      </div>

      {/* Browser Body with slim sidebar + viewport */}
      <div className="flex-1 flex overflow-hidden bg-[#fafbfc]">
        {/* Slim Icon Sidebar matching Noxus reference */}
        <div className="w-9 md:w-10 bg-white border-r border-black/[0.05] flex flex-col items-center py-2.5 gap-2.5 shrink-0 select-none">
          {/* Logo mark */}
          <div className="w-4.5 h-4.5 rounded-full border-[1.5px] border-slate-900 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-slate-900"></div>
          </div>
          {/* M badge */}
          <div className="w-4 h-4 rounded bg-amber-400 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
            M
          </div>
          {/* Navigation icons */}
          <span className="material-symbols-outlined text-[13px] text-slate-400">key</span>
          <span className="material-symbols-outlined text-[13px] text-slate-400">chat_bubble</span>
          <div className="w-6 h-6 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[14px]">grid_view</span>
          </div>
          <span className="material-symbols-outlined text-[13px] text-slate-400">history</span>
        </div>

        {/* Viewport content */}
        <div className="flex-1 overflow-hidden relative bg-white">
          {children}
        </div>
      </div>
    </div>
  );
};

const ScrollyTellingFeatures = ({ t, lang = "es" }: { t: any, lang?: "en" | "es" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollProgress = -rect.top / (rect.height - window.innerHeight);
      if (scrollProgress < 0) setActiveIndex(0);
      else if (scrollProgress >= 1) setActiveIndex(3);
      else setActiveIndex(Math.floor(scrollProgress * 4));
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    { title: t.features.f1_title, desc: t.features.f1_desc, icon: "list_alt" },
    { title: t.features.f2_title, desc: t.features.f2_desc, icon: "inventory_2" },
    { title: t.features.f3_title, desc: t.features.f3_desc, icon: "engineering" },
    { title: t.features.f4_title, desc: t.features.f4_desc, icon: "group" }
  ];

  return (
    <div ref={containerRef} className="h-[400vh] relative w-full bg-[#fcfcfc]" id="features">
      <div className="sticky top-0 h-screen flex items-start pt-[100px] md:pt-0 md:items-center justify-center overflow-hidden">
        
        {/* Background gradient specifically for this section matching Noxus */}
        <div className="absolute top-10 bottom-10 left-4 right-4 md:left-12 md:right-12 rounded-[32px] md:rounded-[48px] bg-gradient-to-b from-[#eaf2f9] to-[#f4f8fb] -z-10"></div>

        <div className="max-w-7xl mx-auto w-full px-6 md:px-24 flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-24">
          
          {/* Left Text */}
          <div className="flex-none md:flex-1 w-full relative h-[260px] md:h-[400px] flex flex-col justify-center z-20">
             {features.map((f, idx) => (
                <div key={idx} className={`absolute top-1/2 left-0 right-0 transition-all duration-700 ease-out ${activeIndex === idx ? 'opacity-100 translate-y-[-50%]' : activeIndex > idx ? 'opacity-0 translate-y-[-100%]' : 'opacity-0 translate-y-[0%]'}`}>
                   <div className="w-10 h-10 md:w-16 md:h-16 rounded-[12px] md:rounded-[20px] bg-white flex items-center justify-center mb-3 md:mb-8 shadow-sm">
                      <span className="material-symbols-outlined text-[20px] md:text-[32px] text-blue-500">{f.icon}</span>
                   </div>
                   <h2 className="text-2xl md:text-[3.5rem] font-display font-medium mb-2 md:mb-6 leading-[1.1] tracking-tight">{f.title}</h2>
                   <p className="text-sm md:text-xl text-[#666] leading-relaxed font-light">{f.desc}</p>
                </div>
             ))}
          </div>

          {/* Right Mockups */}
          <div className="flex-none md:flex-[1.2] w-full relative h-[300px] md:h-[600px] flex items-center justify-center">
             
             {/* Mockup 1: Asset Templates (Full Slider) */}
             <div className={`absolute inset-0 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${activeIndex === 0 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'}`}>
                <div className="w-full h-full rounded-[32px] bg-white border border-black/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col p-2">
                  <div className="flex-1 bg-[#f5f5f5] rounded-[24px] overflow-hidden relative">
                    <Swiper
                      modules={[Autoplay, Pagination]}
                      pagination={{ clickable: true }}
                      autoplay={{ delay: 4000, disableOnInteraction: false }}
                      className="w-full h-full"
                    >
                      {/* Slide 1: Plantillas (Real Image) */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/plantillas/nave-industrial">
                               <img src="/templates-mockup.png" alt="Plantillas" className="w-full h-full object-cover object-left-top transition-transform duration-700 group-hover:scale-105" />
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-4 text-slate-900">Diseño Base</h3>
                           <p className="text-slate-500 text-sm md:text-lg leading-relaxed max-w-2xl">Define los cimientos de tus activos. Una vez creada la plantilla, todos los activos instanciados heredarán su estructura.</p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 2: Formularios Dinámicos (Abstract UI) */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[55%] mb-4 md:mb-8 rounded-2xl overflow-hidden border border-black/5 bg-gradient-to-br from-blue-50 to-indigo-50 relative flex items-center justify-center">
                             {/* Abstract Form UI */}
                             <div className="w-full max-w-[200px] md:max-w-[240px] bg-white rounded-xl shadow-sm border border-blue-100 p-3 md:p-4 space-y-2 md:space-y-3 relative z-10 hover:-translate-y-1 transition-transform">
                               <div className="h-2 md:h-3 w-1/3 bg-slate-200 rounded-full mb-2 md:mb-4"></div>
                               <div className="flex gap-2">
                                 <div className="h-6 md:h-8 flex-1 bg-slate-50 rounded border border-slate-100"></div>
                                 <div className="h-6 md:h-8 flex-1 bg-slate-50 rounded border border-slate-100"></div>
                               </div>
                               <div className="h-6 md:h-8 w-full bg-slate-50 rounded border border-slate-100 flex items-center px-2">
                                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                               </div>
                               <div className="h-6 md:h-8 w-1/2 bg-blue-500 rounded text-white flex items-center justify-center text-[10px] font-bold mt-2">Guardar</div>
                             </div>
                             
                             {/* Decorative background elements */}
                             <div className="absolute top-4 right-4 w-16 md:w-24 h-16 md:h-24 bg-blue-200/40 rounded-full blur-xl"></div>
                             <div className="absolute bottom-4 left-4 w-24 md:w-32 h-24 md:h-32 bg-indigo-200/40 rounded-full blur-xl"></div>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-4 text-slate-900">Formularios Dinámicos</h3>
                           <p className="text-slate-500 text-sm md:text-lg leading-relaxed max-w-2xl">Crea campos personalizados y reglas de validación que se adaptan a tus activos automáticamente sin código.</p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 3: Máquina de Estados (Abstract UI) */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[55%] mb-4 md:mb-8 rounded-2xl overflow-hidden border border-black/5 bg-gradient-to-br from-emerald-50 to-teal-50 relative flex items-center justify-center">
                             {/* Abstract State Machine UI */}
                             <div className="relative flex items-center gap-2 sm:gap-6 z-10 hover:scale-105 transition-transform">
                               <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-white shadow-sm border-2 border-emerald-200 flex items-center justify-center z-10">
                                 <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-emerald-400"></div>
                               </div>
                               <div className="w-4 sm:w-12 h-0.5 bg-emerald-200 absolute left-10 sm:left-16 top-1/2 -translate-y-1/2 z-0"></div>
                               <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-xl bg-white shadow-md border-2 border-emerald-400 flex items-center justify-center z-10 relative">
                                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-4 sm:h-4 bg-emerald-500 rounded-full animate-ping"></div>
                                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-4 sm:h-4 bg-emerald-500 rounded-full"></div>
                                  <span className="material-symbols-outlined text-[18px] sm:text-[24px] text-emerald-500">settings</span>
                               </div>
                               <div className="w-4 sm:w-12 h-0.5 bg-slate-200 absolute right-10 sm:right-16 top-1/2 -translate-y-1/2 z-0"></div>
                               <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-white shadow-sm border-2 border-slate-200 flex items-center justify-center z-10 opacity-60">
                                 <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-slate-300"></div>
                               </div>
                             </div>
                             
                             {/* Decorative background elements */}
                             <div className="absolute -top-10 left-10 w-24 sm:w-40 h-24 sm:h-40 bg-emerald-200/30 rounded-full blur-2xl"></div>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-4 text-slate-900">Máquina de Estados</h3>
                           <p className="text-slate-500 text-sm md:text-lg leading-relaxed max-w-2xl">Configura el ciclo de vida y procesos de tus activos con estados personalizados de acuerdo a tu negocio.</p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 4: Flujos de Trabajo (Abstract UI) */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[55%] mb-8 rounded-2xl overflow-hidden border border-black/5 bg-gradient-to-br from-purple-50 to-pink-50 relative flex flex-col items-center justify-center p-6 gap-3">
                             {/* Abstract Checklist UI */}
                             <div className="w-full max-w-[220px] bg-white rounded-lg shadow-sm border border-purple-100 p-3 flex items-center gap-3 z-10 transform translate-x-2">
                               <div className="w-5 h-5 rounded bg-purple-500 flex items-center justify-center"><span className="material-symbols-outlined text-white text-[12px]">check</span></div>
                               <div className="h-2 w-1/2 bg-slate-200 rounded-full"></div>
                             </div>
                             <div className="w-full max-w-[220px] bg-white rounded-lg shadow-sm border border-purple-100 p-3 flex items-center gap-3 z-10 transform -translate-x-2">
                               <div className="w-5 h-5 rounded bg-slate-100 border border-slate-200"></div>
                               <div className="h-2 w-3/4 bg-slate-200 rounded-full"></div>
                             </div>
                             <div className="w-full max-w-[220px] bg-white rounded-lg shadow-sm border border-purple-100 p-3 flex items-center gap-3 z-10 opacity-60">
                               <div className="w-5 h-5 rounded bg-slate-100 border border-slate-200"></div>
                               <div className="h-2 w-1/3 bg-slate-200 rounded-full"></div>
                             </div>
                             
                             {/* Decorative background elements */}
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-200/30 rounded-full blur-2xl"></div>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-4 text-slate-900">Flujos de Trabajo</h3>
                           <p className="text-slate-500 text-lg leading-relaxed max-w-2xl">Asigna planes preventivos y checklists por defecto que se activan automáticamente al instanciar el activo.</p>
                        </div>
                      </SwiperSlide>
                    </Swiper>
                  </div>
                </div>
             </div>

             {/* Mockup 2: Asset Management / Activos (Full Slider) */}
             <div className={`absolute inset-0 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${activeIndex === 1 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'}`}>
                <div className="w-full h-full rounded-[32px] bg-white border border-black/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col p-2">
                  <div className="flex-1 bg-[#f5f5f5] rounded-[24px] overflow-hidden relative">
                    <Swiper
                      modules={[Autoplay, Pagination]}
                      pagination={{ clickable: true }}
                      autoplay={{ delay: 4000, disableOnInteraction: false }}
                      className="w-full h-full"
                    >
                      {/* Slide 1: Atributos y Detalles */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/activos/nave-b-patio-sur#detalles">
                               <img src="/asset-details-mockup.png" alt="Detalles del Activo" className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Atributos Dinámicos" : "Dynamic Attributes"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Superficie, altura libre, capacidad eléctrica y especificaciones técnicas personalizadas por tipo de activo." : "Surface area, clear height, electrical capacity, and technical attributes customized per asset type."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 2: Georreferenciación y Mapa */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/activos/nave-b-patio-sur#ubicacion">
                               <img src="/asset-location-mockup.png" alt="Ubicación del Activo" className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105" />
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-3 text-slate-900">
                             {lang === "es" ? "Ubicación Geoespacial" : "Geospatial Location"}
                           </h3>
                           <p className="text-slate-500 text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Mapeo interactivo con herramientas de dibujo poligonal, filtrado por estado operativo y matriz de riesgo." : "Interactive mapping with polygon drawing tools, operational status filters, and risk matrix overlays."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 3: Bitácora de Estados */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/activos/nave-b-patio-sur#bitacora">
                               <img src="/asset-history-mockup.png" alt="Bitácora de Estados" className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-3 text-slate-900">
                             {lang === "es" ? "Bitácora y Trazabilidad" : "Status Audit Trail"}
                           </h3>
                           <p className="text-slate-500 text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Historial cronológico inmutable de cambios de estado, transiciones operativas y auditoría de eventos." : "Immutable chronological record of state changes, operational transitions, and audit events."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 4: Jerarquía de Activos */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/activos/carretera-uneti#jerarquia">
                               <img src="/asset-hierarchy-mockup.png" alt="Jerarquía y Componentes" className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-3 text-slate-900">
                             {lang === "es" ? "Jerarquía y Componentes" : "Hierarchy & Components"}
                           </h3>
                           <p className="text-slate-500 text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Estructura arbórea multinivel vinculando activos principales con subsistemas y partes dependientes." : "Multi-level tree structure linking primary assets with subsystems and dependent components."}
                           </p>
                        </div>
                      </SwiperSlide>
                    </Swiper>
                  </div>
                </div>
             </div>

              {/* Mockup 3: Maintenance (Full Slider) */}
             <div className={`absolute inset-0 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${activeIndex === 2 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'}`}>
                <div className="w-full h-full rounded-[32px] bg-white border border-black/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col p-2">
                  <div className="flex-1 bg-[#f5f5f5] rounded-[24px] overflow-hidden relative">
                    <Swiper
                      modules={[Autoplay, Pagination]}
                      pagination={{ clickable: true }}
                      autoplay={{ delay: 4000, disableOnInteraction: false }}
                      className="w-full h-full"
                    >
                      {/* Slide 1: Plantillas de Incidencias */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/maintenance/templates">
                               <div className="w-full h-full bg-[#f8f9fa] flex flex-col items-center justify-center p-4 relative overflow-hidden">
                                  <div className="relative flex items-center justify-center w-full h-full">
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                                       <path d="M 80 100 Q 150 100 170 100" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                                       <path d="M 270 100 Q 340 100 360 100" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                                    </svg>
                                    
                                    <div className="flex items-center gap-6 z-10 scale-[0.55] sm:scale-[0.8] lg:scale-90">
                                      <div className="w-[120px] h-[36px] bg-[#ef4444] border-[3px] border-[#16a34a] rounded-lg shadow-sm flex items-center justify-center">
                                        <span className="text-black font-bold text-[11px]">Abierto</span>
                                      </div>
                                      
                                      <div className="w-[120px] h-[36px] bg-[#f97316] border-[3px] border-[#f97316] rounded-lg shadow-sm flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                                        <span className="text-black font-bold text-[11px]">Diagnóstico</span>
                                      </div>
                                      
                                      <div className="w-[120px] h-[36px] bg-[#eab308] border-[3px] border-[#eab308] rounded-lg shadow-sm flex items-center justify-center">
                                        <span className="text-black font-bold text-[11px]">Reparación</span>
                                      </div>
                                      
                                      <div className="w-[120px] h-[36px] bg-[#22c55e] border-[3px] border-[#dc2626] rounded-lg shadow-sm flex items-center justify-center">
                                        <span className="text-black font-bold text-[11px]">Resuelta</span>
                                      </div>
                                    </div>
                                    <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-50 z-0"></div>
                                  </div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Plantillas de Incidencias" : "Incident Templates"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Define el ciclo de vida, prioridades y atributos personalizados por cada tipo de problema." : "Define the lifecycle, priorities, and custom attributes for each problem type."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 2: Incidencias */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/maintenance/incidents">
                               <div className="w-full h-full bg-[#f3f4f6] p-4 flex flex-col gap-3">
                                 <div className="h-8 w-1/3 bg-white rounded shadow-sm border border-black/5 flex items-center px-3 mb-2">
                                   <div className="h-3 w-16 bg-slate-200 rounded"></div>
                                 </div>
                                 
                                 <div className="w-full bg-white rounded-lg shadow-sm border border-black/5 p-4 flex justify-between items-center hover:-translate-y-0.5 transition-transform">
                                    <div className="flex gap-4 items-center">
                                      <div className="w-8 h-8 md:w-10 md:h-10 rounded bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-[16px] md:text-[20px]">warning</span>
                                      </div>
                                      <div className="text-left">
                                        <div className="text-[11px] md:text-sm font-bold text-slate-800 mb-0.5">INC-2024-112</div>
                                        <div className="text-[9px] md:text-xs text-slate-500">Motor de bomba sobrecalentado</div>
                                      </div>
                                    </div>
                                    <div className="bg-red-100 text-red-700 px-2 py-1 rounded text-[8px] md:text-[10px] font-bold shrink-0">CRÍTICA</div>
                                 </div>

                                 <div className="w-full bg-white rounded-lg shadow-sm border border-black/5 p-4 flex justify-between items-center hover:-translate-y-0.5 transition-transform">
                                    <div className="flex gap-4 items-center">
                                      <div className="w-8 h-8 md:w-10 md:h-10 rounded bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-[16px] md:text-[20px]">build</span>
                                      </div>
                                      <div className="text-left">
                                        <div className="text-[11px] md:text-sm font-bold text-slate-800 mb-0.5">INC-2024-113</div>
                                        <div className="text-[9px] md:text-xs text-slate-500">Fuga en válvula principal</div>
                                      </div>
                                    </div>
                                    <div className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-[8px] md:text-[10px] font-bold shrink-0">MEDIA</div>
                                 </div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Incidencias" : "Incidents"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Reporta y da seguimiento a problemas en tiempo real con estados claros." : "Report and track problems in real-time with clear states."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 3: Ordenes de Trabajo */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/maintenance/orders/WO-2024-089">
                               <div className="w-full h-full bg-white p-6 flex flex-col relative overflow-hidden">
                                 <div className="flex justify-between items-start mb-6 pb-4 border-b border-black/5">
                                   <div className="text-left">
                                     <div className="text-lg md:text-xl font-bold text-slate-900 mb-1">WO-2024-089</div>
                                     <div className="text-[11px] md:text-xs text-slate-500">Reparación de Bomba #2</div>
                                   </div>
                                   <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-[9px] md:text-[10px] font-bold">EN PROGRESO</div>
                                 </div>
                                 <div className="space-y-4 flex-1">
                                   <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                     <div className="flex items-center gap-3">
                                       <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">JP</div>
                                       <div className="text-xs md:text-sm text-slate-700">Juan Pérez (Técnico)</div>
                                     </div>
                                   </div>
                                   <div className="space-y-2 text-left">
                                     <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">Repuestos</div>
                                     <div className="flex justify-between items-center text-xs md:text-sm text-slate-700 p-2 border-b border-slate-100">
                                       <span>Filtro de aceite x2</span>
                                       <span className="font-mono text-[10px] md:text-xs">$120.00</span>
                                     </div>
                                   </div>
                                 </div>
                                 <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-100/50 rounded-full blur-3xl"></div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Órdenes de Trabajo" : "Work Orders"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Asigna recursos, repuestos y técnicos responsables." : "Assign resources, spare parts, and responsible technicians."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 4: Tareas */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/maintenance/tasks">
                               <div className="w-full h-full bg-[#fafbfc] p-4 md:p-6 flex flex-col text-left">
                                 <div className="mb-4 md:mb-6">
                                   <div className="text-base md:text-lg font-bold text-slate-800">Checklist de Inspección</div>
                                   <div className="text-[10px] md:text-xs text-slate-500">WO-2024-089 • 2/4 Completadas</div>
                                 </div>
                                 <div className="space-y-2 md:space-y-3">
                                   <div className="flex items-start gap-3 p-3 bg-white rounded-lg shadow-sm border border-green-200">
                                     <div className="mt-0.5 w-4 h-4 md:w-5 md:h-5 rounded bg-green-500 flex items-center justify-center shrink-0">
                                       <span className="material-symbols-outlined text-white text-[12px] md:text-[14px]">check</span>
                                     </div>
                                     <div>
                                       <div className="text-[11px] md:text-sm font-medium text-slate-800 line-through opacity-70">Verificar presión</div>
                                     </div>
                                   </div>
                                   <div className="flex items-start gap-3 p-3 bg-white rounded-lg shadow-sm border border-blue-200 shadow-[0_0_0_2px_rgba(59,130,246,0.1)]">
                                     <div className="mt-0.5 w-4 h-4 md:w-5 md:h-5 rounded border-2 border-slate-300 shrink-0"></div>
                                     <div>
                                       <div className="text-[11px] md:text-sm font-medium text-slate-800">Prueba de funcionamiento</div>
                                       <div className="text-[9px] md:text-xs text-blue-500 font-medium mt-1">Siguiente paso</div>
                                     </div>
                                   </div>
                                 </div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Tareas en Campo" : "Field Tasks"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Asegura el cumplimiento paso a paso a través de checklists detallados." : "Ensure step-by-step compliance through detailed checklists."}
                           </p>
                        </div>
                      </SwiperSlide>
                    </Swiper>
                  </div>
                </div>
             </div>

             {/* Mockup 4: Resource Management (Full Slider) */}
             <div className={`absolute inset-0 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${activeIndex === 3 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'}`}>
                <div className="w-full h-full rounded-[32px] bg-white border border-black/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col p-2">
                  <div className="flex-1 bg-[#f5f5f5] rounded-[24px] overflow-hidden relative">
                    <Swiper
                      modules={[Autoplay, Pagination]}
                      pagination={{ clickable: true }}
                      autoplay={{ delay: 4000, disableOnInteraction: false }}
                      className="w-full h-full"
                    >
                      {/* Slide 1: Catálogos Dinámicos */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/settings/catalogs">
                               <div className="w-full h-full bg-[#f3f4f6] p-4 flex flex-col gap-3">
                                 <div className="h-8 w-1/3 bg-white rounded shadow-sm border border-black/5 flex items-center px-3 mb-2">
                                   <div className="h-3 w-16 bg-slate-200 rounded"></div>
                                 </div>
                                 <div className="w-full bg-white rounded-lg shadow-sm border border-black/5 p-3 flex justify-between items-center hover:-translate-y-0.5 transition-transform">
                                    <div className="flex gap-3 items-center">
                                      <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-[16px]">category</span>
                                      </div>
                                      <div className="text-left">
                                        <div className="text-xs font-bold text-slate-800">Marcas de Equipos</div>
                                        <div className="text-[10px] text-slate-500">12 elementos</div>
                                      </div>
                                    </div>
                                    <div className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold">Activo</div>
                                 </div>
                                 <div className="w-full bg-white rounded-lg shadow-sm border border-black/5 p-3 flex justify-between items-center hover:-translate-y-0.5 transition-transform">
                                    <div className="flex gap-3 items-center">
                                      <div className="w-8 h-8 rounded bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-[16px]">list_alt</span>
                                      </div>
                                      <div className="text-left">
                                        <div className="text-xs font-bold text-slate-800">Tipos de Mantenimiento</div>
                                        <div className="text-[10px] text-slate-500">4 elementos</div>
                                      </div>
                                    </div>
                                    <div className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold">Activo</div>
                                 </div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Catálogos Dinámicos" : "Dynamic Catalogs"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Centraliza opciones, categorías y parámetros estandarizados en toda tu operación." : "Centralize options, categories, and standardized parameters across your entire operation."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 2: Empleados */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/settings/employees">
                               <div className="w-full h-full bg-[#f3f4f6] p-4 flex gap-3 overflow-hidden">
                                 <div className="w-1/2 bg-white rounded-lg shadow-sm border border-black/5 p-4 flex flex-col items-center text-center hover:-translate-y-1 transition-transform">
                                   <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg mb-2">RC</div>
                                   <div className="text-sm font-bold text-slate-800">Roberto C.</div>
                                   <div className="text-[10px] text-slate-500 mb-3">Técnico Nivel 2</div>
                                   <div className="w-full h-6 bg-slate-50 rounded flex items-center justify-center text-[10px] text-slate-600 truncate px-2">r.cruz@empresa.com</div>
                                 </div>
                                 <div className="w-1/2 bg-white rounded-lg shadow-sm border border-black/5 p-4 flex flex-col items-center text-center hover:-translate-y-1 transition-transform">
                                   <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg mb-2">AM</div>
                                   <div className="text-sm font-bold text-slate-800">Ana M.</div>
                                   <div className="text-[10px] text-slate-500 mb-3">Supervisora</div>
                                   <div className="w-full h-6 bg-slate-50 rounded flex items-center justify-center text-[10px] text-slate-600 truncate px-2">a.mtz@empresa.com</div>
                                 </div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Directorio de Personal" : "Staff Directory"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Registra a tus técnicos, supervisores y gerentes con su información de contacto." : "Register your technicians, supervisors, and managers with their contact information."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 3: Equipos de Trabajo */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/settings/teams">
                               <div className="w-full h-full bg-white p-6 flex flex-col relative overflow-hidden items-center justify-center">
                                 <div className="w-full max-w-[240px] bg-white rounded-xl shadow-md border border-slate-100 p-4 relative z-10 hover:shadow-lg transition-shadow">
                                   <div className="flex items-center gap-3 mb-4">
                                     <div className="w-10 h-10 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                       <span className="material-symbols-outlined text-[20px]">groups</span>
                                     </div>
                                     <div className="text-left">
                                       <div className="text-sm font-bold text-slate-800">Cuadrilla Eléctrica</div>
                                       <div className="text-[10px] text-slate-500">Zona Norte • 4 Miembros</div>
                                     </div>
                                   </div>
                                   <div className="flex -space-x-2">
                                     <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] font-bold">AB</div>
                                     <div className="w-8 h-8 rounded-full bg-green-100 border-2 border-white flex items-center justify-center text-[10px] font-bold">CD</div>
                                     <div className="w-8 h-8 rounded-full bg-yellow-100 border-2 border-white flex items-center justify-center text-[10px] font-bold">EF</div>
                                     <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">+1</div>
                                   </div>
                                 </div>
                                 <div className="absolute top-1/2 right-4 w-32 h-32 bg-indigo-100/50 rounded-full blur-3xl"></div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Equipos de Trabajo" : "Work Teams"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Agrupa a tu personal en cuadrillas y asígnales zonas o especialidades." : "Group your staff into crews and assign them zones or specialties."}
                           </p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 4: Usuarios y Roles */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-4 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-4 md:mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/settings/roles">
                               <div className="w-full h-full bg-[#fafbfc] flex text-left overflow-hidden">
                                 {/* Sidebar */}
                                 <div className="w-1/3 bg-white border-r border-slate-100 p-3 flex flex-col gap-2">
                                   <div className="text-[10px] font-bold text-slate-400 mb-1">ROLES</div>
                                   <div className="px-2 py-1.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">Administrador</div>
                                   <div className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 rounded text-[11px] font-medium">Técnico</div>
                                   <div className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 rounded text-[11px] font-medium">Solo Lectura</div>
                                 </div>
                                 {/* Content */}
                                 <div className="flex-1 p-4 flex flex-col gap-3">
                                   <div className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Permisos</div>
                                   <div className="flex justify-between items-center">
                                     <span className="text-xs text-slate-700">Crear Activos</span>
                                     <div className="w-6 h-3 bg-blue-500 rounded-full relative"><div className="w-2.5 h-2.5 bg-white rounded-full absolute right-0.5 top-px shadow-sm"></div></div>
                                   </div>
                                   <div className="flex justify-between items-center">
                                     <span className="text-xs text-slate-700">Eliminar Órdenes</span>
                                     <div className="w-6 h-3 bg-slate-200 rounded-full relative"><div className="w-2.5 h-2.5 bg-white rounded-full absolute left-0.5 top-px shadow-sm"></div></div>
                                   </div>
                                 </div>
                               </div>
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-xl md:text-3xl mb-2 md:mb-3 text-slate-900">
                             {lang === "es" ? "Usuarios y Permisos" : "Users and Roles"}
                           </h3>
                           <p className="text-slate-500 text-sm md:text-base leading-relaxed max-w-2xl">
                             {lang === "es" ? "Control granular sobre quién puede ver, editar o eliminar información." : "Granular control over who can view, edit, or delete information."}
                           </p>
                        </div>
                      </SwiperSlide>
                    </Swiper>
                  </div>
                </div>
             </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default function LandingPage() {
  const [lang, setLang] = useState<"en" | "es">("es");
  const t = translations[lang];

  return (
    <div className="bg-[#fcfcfc] min-h-screen font-sans text-[#111] selection:bg-[#e0e0e0] relative">
      
      {/* NOXUS.AI INSPIRED LIGHT MODE HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-white/95 backdrop-blur-xl border-b border-black/[0.04] shadow-sm">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-black rounded flex items-center justify-center transition-transform group-hover:scale-95">
            <span className="material-symbols-outlined text-white text-[16px]">all_inclusive</span>
          </div>
          <span className="font-display font-bold text-lg tracking-tight">AssetHub</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8 bg-black/[0.03] px-6 py-2 rounded-full border border-black/[0.04]">
          <a href="#features" className="text-[13px] font-medium text-black/60 hover:text-black transition-colors">{t.nav.platform}</a>
          <a href="#multi-tenant" className="text-[13px] font-medium text-black/60 hover:text-black transition-colors">{t.nav.multitenant}</a>
          <a href="#pricing" className="text-[13px] font-medium text-black/60 hover:text-black transition-colors">{t.nav.pricing}</a>
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="text-[11px] font-bold px-2 py-1 bg-black/[0.04] hover:bg-black/[0.08] rounded transition-colors uppercase">
            {lang}
          </button>
          <Link to="/login" className="hidden sm:block text-[13px] font-medium text-black/60 hover:text-black transition-colors">
            {t.nav.login}
          </Link>
          <Link to="/login" className="bg-black text-white px-5 py-2 rounded-full text-[13px] font-medium hover:bg-black/80 transition-colors shadow-sm">
            {t.nav.start}
          </Link>
        </div>
      </header>

      <main className="relative z-10">
        {/* HERO SECTION — navy background matching the hero image, content left, image right */}
        <section className="relative z-10 overflow-hidden px-6 pb-16 pt-20 bg-[#0F1821] min-h-[580px] lg:min-h-[100dvh]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-no-repeat opacity-70"
            style={{
              backgroundImage: `url(${heroBg})`,
              backgroundPosition: 'right center',
              backgroundSize: 'auto 100%'
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#0F1821_0%,#0F1821_30%,rgba(15,24,33,0.35)_62%,#0F1821_100%)]"></div>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,#0F1821_88%)]"></div>
          </div>

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 items-center text-center lg:text-left min-h-[460px] lg:min-h-[calc(100dvh-140px)] max-w-[1200px] mx-auto">

            {/* LEFT: hero copy */}
            <div className="flex flex-col items-center lg:items-start">

            <RevealText delay={0}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/20 bg-white/10 backdrop-blur-md mb-7">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span>
                <span className="text-[11px] font-bold tracking-widest text-white/90 uppercase">{t.hero.badge}</span>
              </div>
            </RevealText>
            
            <RevealText delay={100} className="w-full">
              <h1 className="font-display text-[3.25rem] sm:text-[4.5rem] lg:text-[5.25rem] xl:text-[5.75rem] font-medium tracking-tighter leading-[0.92] text-white">
                {t.hero.title1}
                <span className="block text-white/50 mb-5 md:mb-6">{t.hero.title2}</span>
              </h1>
            </RevealText>
            
            <RevealText delay={200}>
              <p className="text-lg sm:text-xl text-white/70 max-w-lg mx-auto lg:mx-0 mb-9 leading-relaxed font-light tracking-tight">
                {t.hero.subtitle}
              </p>
            </RevealText>
            
            <RevealText delay={300} className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 w-full">
              <Link to="/signup" className="bg-blue-600 text-white px-8 py-4 rounded-full font-medium hover:bg-blue-500 hover:scale-105 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] w-full sm:w-auto text-sm">
                {t.hero.cta}
              </Link>
              <a href="#features" className="bg-white/10 border border-white/20 text-white backdrop-blur-md px-8 py-4 rounded-full font-medium hover:bg-white/20 transition-colors w-full sm:w-auto text-sm flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                {t.hero.demo}
              </a>
            </RevealText>

            </div>

          </div>
        </section>

        {/* SCROLLYTELLING FEATURES (Noxus Style) */}
        <ScrollyTellingFeatures t={t} lang={lang} />

        {/* MULTI TENANT (Side-by-side Cards) */}
        <section className="py-16 md:py-24 px-4 md:px-6" id="multi-tenant">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 items-stretch">
            
            {/* Left Card: Core Platform (White) */}
            <div className="flex-1 rounded-[32px] p-6 sm:p-10 md:p-14 bg-white border border-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between">
              <RevealText>
                <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 md:mb-6 leading-tight tracking-tight">
                  {t.multitenant.title}
                </h2>
                <p className="text-base md:text-lg text-black/50 mb-8 md:mb-12 leading-relaxed font-light">
                  {t.multitenant.subtitle}
                </p>
                
                <div className="space-y-6 md:space-y-8">
                  <div className="border-l border-black/10 pl-4 md:pl-6">
                    <h4 className="font-medium mb-1 md:mb-2">{t.multitenant.point1_title}</h4>
                    <p className="text-xs md:text-sm text-black/50 font-light">{t.multitenant.point1_desc}</p>
                  </div>
                  <div className="border-l border-black/10 pl-4 md:pl-6">
                    <h4 className="font-medium mb-1 md:mb-2">{t.multitenant.point2_title}</h4>
                    <p className="text-xs md:text-sm text-black/50 font-light">{t.multitenant.point2_desc}</p>
                  </div>
                </div>
              </RevealText>
            </div>
            
            {/* Right Card: Multi-tenant Architecture (Light Blue Gradient) */}
            <div className="flex-1 w-full rounded-[32px] p-6 sm:p-10 md:p-14 bg-gradient-to-b from-[#e8f2fc] to-[#f6f9fc] border border-blue-100 flex flex-col justify-between">
              <RevealText delay={200}>
                <div className="mb-12">
                   <h2 className="font-display text-4xl font-medium mb-6 leading-tight tracking-tight text-[#0a2540]">
                     {t.multitenant.card_title}
                   </h2>
                   <span className="text-[10px] bg-blue-500/10 text-blue-700 px-3 py-1.5 rounded-full uppercase tracking-widest font-bold">
                     {t.multitenant.card_tag}
                   </span>
                </div>
                
                <div className="bg-white/60 backdrop-blur-sm rounded-3xl p-6 border border-white/50 shadow-sm">
                   <div className="space-y-3">
                     {t.multitenant.clients.map((client, idx) => (
                       <div key={idx} className="flex justify-between items-center p-4 rounded-xl bg-white border border-blue-50 shadow-sm transition-colors hover:border-blue-200">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-[16px] text-blue-400">dns</span>
                            <span className="font-mono text-sm text-[#0a2540]/70">{client}</span>
                          </div>
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                       </div>
                     ))}
                   </div>
                </div>
              </RevealText>
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="py-12 px-6 border-t border-black/5 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">all_inclusive</span>
            <span className="font-display font-medium text-lg tracking-tight">AssetHub</span>
          </div>
          <p className="text-sm text-black/40 font-light">
            © {new Date().getFullYear()} AssetHub, Inc. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm">
            <a href="#" className="text-black/50 hover:text-black transition-colors">Twitter</a>
            <a href="#" className="text-black/50 hover:text-black transition-colors">LinkedIn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
