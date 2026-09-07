import { useEffect, useState, useRef } from "react";
import { Link } from "react-router";
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';

// --- TRANSLATIONS ---
const translations = {
  en: {
    nav: { platform: "Platform", multitenant: "Multi-tenant", pricing: "Pricing", login: "Log in", start: "Start Free" },
    hero: { badge: "System of Execution", title1: "Operate", title2: "at scale.", subtitle: "AssetHub is the system of execution for agentic operations. Bridge your legacy systems with process intelligence to run complex workflows end-to-end.", cta: "Start your free trial", demo: "Watch Demo" },
    mockup: { activeOrders: "Active Work Orders", subtitle: "Multi-site maintenance coordination.", preventive: "Preventive Maintenance", inProgress: "In Progress", sla: "Global SLA Compliance", slaDesc: "Target is 98.0% for active contracts." },
    social: "Trusted by industry leaders",
    features: { title: "Everything you need to deliver flawless maintenance.", f1_title: "Asset Templates", f1_desc: "Define custom attributes, lifecycles, and checklists for any type of asset. Create them once and reuse them across your entire organization.", f2_title: "Live Asset Tracking", f2_desc: "Comprehensive operational profiling: dynamic attributes, geospatial mapping, historical timeline, and component hierarchy.", f3_title: "Accurate Billing", f3_desc: "Track spare parts and labor hours seamlessly. Generate transparent invoices.", f4_title: "Infinite Asset Hierarchy", f4_desc: "Map any complex structure. From a single HVAC unit to a national hospital network." },
    multitenant: { title: "Strict isolation for every client.", subtitle: "Offer your clients a personalized, white-labeled experience. They log into their own portal, see only their assets, and review their specific SLAs.", point1_title: "Custom Subdomains", point1_desc: "client.assethub.app routing instantly isolates sessions and databases.", point2_title: "Cross-tenant RBAC", point2_desc: "Global dispatchers manage everything. Client managers see read-only reports.", card_title: "Tenant Architecture", card_tag: "Secure", clients: ["hospital-network.tuempresa.app", "gym-chain.tuempresa.app", "highway-tolls.tuempresa.app"] },
    pricing: { title: "Simple, scalable pricing.", subtitle: "Pay for the volume of assets you manage. No hidden fees.", p1_title: "Starter", p1_desc: "For internal operations.", p1_price: "$149", p1_f1: "Up to 500 assets", p1_f2: "Preventive & Corrective WOs", p1_f3: "Mobile App access", p1_f4: "No multi-tenant portals", p1_btn: "Get Started", p2_tag: "POPULAR", p2_title: "Professional", p2_desc: "For Service Providers.", p2_price: "$489", p2_f1: "Unlimited assets & tenants", p2_f2: "Custom client subdomains", p2_f3: "Advanced SLA reporting", p2_f4: "White-label options", p2_btn: "Start Free Trial" }
  },
  es: {
    nav: { platform: "Plataforma", multitenant: "Multi-tenant", pricing: "Planes", login: "Iniciar Sesión", start: "Comenzar" },
    hero: { badge: "Sistema de Ejecución", title1: "Opera", title2: "a escala.", subtitle: "AssetHub es el sistema de ejecución para operaciones maestras. Conecta tus sistemas legacy con inteligencia de procesos para ejecutar flujos de trabajo de punta a punta.", cta: "Comenzar Ahora", demo: "Ver Demo" },
    mockup: { activeOrders: "Órdenes Activas", subtitle: "Coordinación de mantenimiento multi-sitio.", preventive: "Mantenimiento Preventivo", inProgress: "En Proceso", sla: "Cumplimiento de SLA Global", slaDesc: "El objetivo es 98.0% para contratos activos." },
    social: "Elegido por líderes de la industria",
    features: { title: "Todo lo que necesitas para una operación impecable.", f1_title: "Plantillas de Activos", f1_desc: "Define atributos, ciclos de vida y checklists personalizados para cualquier tipo de activo. Créalas una vez y reutilízalas en toda tu organización.", f2_title: "Gestión de Activos 360°", f2_desc: "Control total de cada activo: atributos dinámicos, geolocalización, bitácora de estados y estructura jerárquica en tiempo real.", f3_title: "Facturación Precisa", f3_desc: "Registra repuestos y horas hombre sin fricción. Genera facturas transparentes.", f4_title: "Jerarquía Infinita", f4_desc: "Mapea cualquier estructura compleja. Desde un equipo HVAC hasta una red hospitalaria." },
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
          <div className="h-4.5 w-44 md:w-60 bg-[#dbe8f6] rounded-full flex items-center justify-center px-2.5 gap-1.5">
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
    { title: t.features.f3_title, desc: t.features.f3_desc, icon: "receipt_long" },
    { title: t.features.f4_title, desc: t.features.f4_desc, icon: "account_tree" }
  ];

  return (
    <div ref={containerRef} className="h-[400vh] relative w-full bg-[#fcfcfc]" id="features">
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
        
        {/* Background gradient specifically for this section matching Noxus */}
        <div className="absolute top-10 bottom-10 left-6 right-6 md:left-12 md:right-12 rounded-[48px] bg-gradient-to-b from-[#eaf2f9] to-[#f4f8fb] -z-10"></div>

        <div className="max-w-7xl mx-auto w-full px-12 md:px-24 flex flex-col md:flex-row items-center gap-12 md:gap-24">
          
          {/* Left Text */}
          <div className="flex-1 relative h-[400px] flex flex-col justify-center">
             {features.map((f, idx) => (
                <div key={idx} className={`absolute top-1/2 left-0 right-0 transition-all duration-700 ease-out ${activeIndex === idx ? 'opacity-100 translate-y-[-50%]' : activeIndex > idx ? 'opacity-0 translate-y-[-100%]' : 'opacity-0 translate-y-[0%]'}`}>
                   <div className="w-16 h-16 rounded-[20px] bg-white flex items-center justify-center mb-8 shadow-sm">
                      <span className="material-symbols-outlined text-[32px] text-blue-500">{f.icon}</span>
                   </div>
                   <h2 className="text-4xl md:text-[3.5rem] font-display font-medium mb-6 leading-[1.1] tracking-tight">{f.title}</h2>
                   <p className="text-xl text-[#666] leading-relaxed font-light">{f.desc}</p>
                </div>
             ))}
          </div>

          {/* Right Mockups */}
          <div className="flex-[1.2] w-full relative h-[400px] md:h-[600px] flex items-center justify-center">
             
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
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/plantillas/nave-industrial">
                               <img src="/templates-mockup.png" alt="Plantillas" className="w-full h-full object-cover object-left-top transition-transform duration-700 group-hover:scale-105" />
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-4 text-slate-900">Diseño Base</h3>
                           <p className="text-slate-500 text-lg leading-relaxed max-w-2xl">Define los cimientos de tus activos. Una vez creada la plantilla, todos los activos instanciados heredarán su estructura.</p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 2: Formularios Dinámicos (Abstract UI) */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[55%] mb-8 rounded-2xl overflow-hidden border border-black/5 bg-gradient-to-br from-blue-50 to-indigo-50 relative flex items-center justify-center">
                             {/* Abstract Form UI */}
                             <div className="w-full max-w-[240px] bg-white rounded-xl shadow-sm border border-blue-100 p-4 space-y-3 relative z-10 hover:-translate-y-1 transition-transform">
                               <div className="h-3 w-1/3 bg-slate-200 rounded-full mb-4"></div>
                               <div className="flex gap-2">
                                 <div className="h-8 flex-1 bg-slate-50 rounded border border-slate-100"></div>
                                 <div className="h-8 flex-1 bg-slate-50 rounded border border-slate-100"></div>
                               </div>
                               <div className="h-8 w-full bg-slate-50 rounded border border-slate-100 flex items-center px-2">
                                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                               </div>
                               <div className="h-8 w-1/2 bg-blue-500 rounded text-white flex items-center justify-center text-[10px] font-bold mt-2">Guardar</div>
                             </div>
                             
                             {/* Decorative background elements */}
                             <div className="absolute top-4 right-4 w-24 h-24 bg-blue-200/40 rounded-full blur-xl"></div>
                             <div className="absolute bottom-4 left-4 w-32 h-32 bg-indigo-200/40 rounded-full blur-xl"></div>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-4 text-slate-900">Formularios Dinámicos</h3>
                           <p className="text-slate-500 text-lg leading-relaxed max-w-2xl">Crea campos personalizados y reglas de validación que se adaptan a tus activos automáticamente sin código.</p>
                        </div>
                      </SwiperSlide>

                      {/* Slide 3: Máquina de Estados (Abstract UI) */}
                      <SwiperSlide>
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[55%] mb-8 rounded-2xl overflow-hidden border border-black/5 bg-gradient-to-br from-emerald-50 to-teal-50 relative flex items-center justify-center">
                             {/* Abstract State Machine UI */}
                             <div className="relative flex items-center gap-4 sm:gap-6 z-10 hover:scale-105 transition-transform">
                               <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white shadow-sm border-2 border-emerald-200 flex items-center justify-center z-10">
                                 <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-emerald-400"></div>
                               </div>
                               <div className="w-6 sm:w-12 h-0.5 bg-emerald-200 absolute left-12 sm:left-16 top-1/2 -translate-y-1/2 z-0"></div>
                               <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-white shadow-md border-2 border-emerald-400 flex items-center justify-center z-10 relative">
                                  <div className="absolute -top-2 -right-2 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 rounded-full animate-ping"></div>
                                  <div className="absolute -top-2 -right-2 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 rounded-full"></div>
                                  <span className="material-symbols-outlined text-emerald-500">settings</span>
                               </div>
                               <div className="w-6 sm:w-12 h-0.5 bg-slate-200 absolute right-12 sm:right-16 top-1/2 -translate-y-1/2 z-0"></div>
                               <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white shadow-sm border-2 border-slate-200 flex items-center justify-center z-10 opacity-60">
                                 <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-slate-300"></div>
                               </div>
                             </div>
                             
                             {/* Decorative background elements */}
                             <div className="absolute -top-10 left-10 w-40 h-40 bg-emerald-200/30 rounded-full blur-2xl"></div>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-4 text-slate-900">Máquina de Estados</h3>
                           <p className="text-slate-500 text-lg leading-relaxed max-w-2xl">Configura el ciclo de vida y procesos de tus activos con estados personalizados de acuerdo a tu negocio.</p>
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
                        <div className="w-full h-full bg-white flex flex-col items-center justify-start p-6 md:p-10 text-center">
                           <div className="w-full h-[58%] mb-6 rounded-2xl overflow-hidden shadow-lg border border-black/5 bg-[#f8f9fa] relative group">
                             <BrowserFrame url="assethub.app/activos/nave-b-patio-sur#detalles">
                               <img src="/asset-details-mockup.png" alt="Detalles del Activo" className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                             </BrowserFrame>
                           </div>
                           <h3 className="font-display font-medium text-3xl mb-3 text-slate-900">
                             {lang === "es" ? "Atributos Dinámicos" : "Dynamic Attributes"}
                           </h3>
                           <p className="text-slate-500 text-base leading-relaxed max-w-2xl">
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

             {/* Mockup 3: Billing */}
             <div className={`absolute inset-0 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${activeIndex === 2 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'}`}>
                <div className="w-full h-[80%] my-auto rounded-[32px] bg-white border border-black/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col p-8">
                  <div className="flex justify-between items-center mb-8 pb-8 border-b border-black/5">
                    <div>
                      <div className="text-4xl font-light tracking-tighter mb-2">$4,250.00</div>
                      <div className="text-sm text-black/40">Invoice #INV-2024-089</div>
                    </div>
                    <div className="bg-green-50 text-green-700 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase">
                      Paid
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-black/60">Labor (14 hours)</span>
                      <span className="font-medium">$1,050.00</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-black/60">Spare Parts (Filters, Belts)</span>
                      <span className="font-medium">$3,200.00</span>
                    </div>
                  </div>
                </div>
             </div>

             {/* Mockup 4: Hierarchy */}
             <div className={`absolute inset-0 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${activeIndex === 3 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'}`}>
                <div className="w-full h-[90%] my-auto rounded-[32px] bg-white border border-black/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col p-8">
                  <div className="font-medium text-lg mb-6">Asset Tree</div>
                  <div className="space-y-3 font-mono text-sm text-black/60">
                    <div className="flex items-center gap-2 text-black"><span className="material-symbols-outlined text-[16px]">domain</span> Central Hospital</div>
                    <div className="flex items-center gap-2 pl-6"><span className="material-symbols-outlined text-[16px]">home_work</span> Building A</div>
                    <div className="flex items-center gap-2 pl-12"><span className="material-symbols-outlined text-[16px]">view_in_ar</span> Floor 3</div>
                    <div className="flex items-center gap-2 pl-[72px] text-blue-600 bg-blue-50 py-1 px-2 rounded -ml-2"><span className="material-symbols-outlined text-[16px]">mode_fan</span> HVAC Unit 302</div>
                    <div className="flex items-center gap-2 pl-[96px] text-black/40"><span className="material-symbols-outlined text-[16px]">build_circle</span> Compressor A</div>
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
      
      {/* Background Gradient for Hero */}
      <div className="absolute top-0 left-0 right-0 h-[900px] bg-gradient-to-b from-[#e8f2fc] via-[#f2f7fb] to-transparent pointer-events-none"></div>

      {/* NOXUS.AI INSPIRED LIGHT MODE HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-white/50 backdrop-blur-xl border-b border-black/[0.04]">
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

      <main className="relative z-10 pt-40 pb-20">
        
        {/* HERO SECTION */}
        <section className="px-6 pb-20 text-center max-w-[1200px] mx-auto">
          <div className="flex flex-col items-center">
            
            <RevealText delay={0}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-black/10 bg-black/[0.02] mb-10">
                <span className="w-1.5 h-1.5 rounded-full bg-black"></span>
                <span className="text-[11px] font-bold tracking-widest text-black/60 uppercase">{t.hero.badge}</span>
              </div>
            </RevealText>
            
            <RevealText delay={100} className="w-full">
              <h1 className="font-display text-[5rem] sm:text-[7rem] md:text-[9rem] font-medium tracking-tighter leading-[0.9] text-black">
                {t.hero.title1}
              </h1>
              <h1 className="font-display text-[5rem] sm:text-[7rem] md:text-[9rem] font-medium tracking-tighter leading-[0.9] text-black/40 mb-8">
                {t.hero.title2}
              </h1>
            </RevealText>
            
            <RevealText delay={200}>
              <p className="text-xl sm:text-2xl text-black/50 max-w-2xl mx-auto mb-12 leading-relaxed font-light tracking-tight">
                {t.hero.subtitle}
              </p>
            </RevealText>
            
            <RevealText delay={300} className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
              <Link to="/login" className="bg-black text-white px-8 py-4 rounded-full font-medium hover:scale-105 transition-transform w-full sm:w-auto text-sm">
                {t.hero.cta}
              </Link>
              <a href="#demo" className="bg-white border border-black/10 text-black px-8 py-4 rounded-full font-medium hover:bg-black/[0.02] transition-colors w-full sm:w-auto text-sm flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                {t.hero.demo}
              </a>
            </RevealText>
          </div>
        </section>

        {/* LOGOS */}
        <section className="py-20 border-y border-black/[0.03]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap justify-center gap-16 items-center opacity-30 grayscale mix-blend-multiply">
              <span className="font-display font-bold text-2xl flex items-center gap-2"><span className="material-symbols-outlined text-[28px]">local_hospital</span> MediCare Sys</span>
              <span className="font-display font-bold text-2xl flex items-center gap-2"><span className="material-symbols-outlined text-[28px]">directions_car</span> RoadWorks</span>
              <span className="font-display font-bold text-2xl flex items-center gap-2"><span className="material-symbols-outlined text-[28px]">computer</span> IT Global</span>
              <span className="font-display font-bold text-2xl flex items-center gap-2"><span className="material-symbols-outlined text-[28px]">apartment</span> RealEstate</span>
            </div>
          </div>
        </section>

        {/* SCROLLYTELLING FEATURES (Noxus Style) */}
        <ScrollyTellingFeatures t={t} lang={lang} />

        {/* MULTI TENANT (Side-by-side Cards) */}
        <section className="py-24 px-6" id="multi-tenant">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 items-stretch">
            
            {/* Left Card: Core Platform (White) */}
            <div className="flex-1 rounded-[32px] p-10 md:p-14 bg-white border border-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between">
              <RevealText>
                <h2 className="font-display text-4xl font-medium mb-6 leading-tight tracking-tight">
                  {t.multitenant.title}
                </h2>
                <p className="text-lg text-black/50 mb-12 leading-relaxed font-light">
                  {t.multitenant.subtitle}
                </p>
                
                <div className="space-y-8">
                  <div className="border-l border-black/10 pl-6">
                    <h4 className="font-medium mb-2">{t.multitenant.point1_title}</h4>
                    <p className="text-sm text-black/50 font-light">{t.multitenant.point1_desc}</p>
                  </div>
                  <div className="border-l border-black/10 pl-6">
                    <h4 className="font-medium mb-2">{t.multitenant.point2_title}</h4>
                    <p className="text-sm text-black/50 font-light">{t.multitenant.point2_desc}</p>
                  </div>
                </div>
              </RevealText>
            </div>
            
            {/* Right Card: Multi-tenant Architecture (Light Blue Gradient) */}
            <div className="flex-1 w-full rounded-[32px] p-10 md:p-14 bg-gradient-to-b from-[#e8f2fc] to-[#f6f9fc] border border-blue-100 flex flex-col justify-between">
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
